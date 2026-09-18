//! Pictures on the clipboard (SPEC-clipboard §3, §5.5).
//!
//! Windows hands a copied picture over as a DIB — a bitmap with no file header, often megabytes of it. Keeping fifty
//! of those would cost hundreds of megabytes, so each one is saved as a PNG plus a small thumbnail for the list, and
//! turned back into a DIB when the item is copied again.
//!
//! The only pure part is the BMP header, which is what lets WIC read a bare DIB; it is tested on its own.

/// Longest side of the thumbnail in the list (the row shows 84×52 logical px, so this covers high DPI).
pub const THUMB_PX: u32 = 160;

/// A copied picture bigger than this is ignored rather than stored.
pub const MAX_DIB_BYTES: usize = 64 * 1024 * 1024;

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

/// Size and shape of a DIB: `(width, height, offset of the pixels from the start of the DIB)`.
/// `None` when the block is too short or makes no sense as a bitmap.
pub fn dib_shape(dib: &[u8]) -> Option<(u32, u32, usize)> {
    let header = u32_at(dib, 0)? as usize;
    if !(12..=124).contains(&header) || dib.len() <= header {
        return None;
    }
    let (width, height, bits, compression, colours_used) = if header == 12 {
        // BITMAPCOREHEADER, still seen from very old apps.
        (
            i32::from(u16_at(dib, 4)? as i16),
            i32::from(u16_at(dib, 6)? as i16),
            u16_at(dib, 10)?,
            0,
            0,
        )
    } else {
        (
            u32_at(dib, 4)? as i32,
            u32_at(dib, 8)? as i32,
            u16_at(dib, 14)?,
            u32_at(dib, 16)?,
            u32_at(dib, 32)?,
        )
    };
    if width <= 0 || height == 0 || bits == 0 {
        return None;
    }
    let palette = if bits <= 8 {
        let entries = if colours_used == 0 {
            1u32 << bits
        } else {
            colours_used
        };
        entries as usize * if header == 12 { 3 } else { 4 }
    } else if compression == 3 && header == 40 {
        // BI_BITFIELDS keeps three masks after the header.
        12
    } else {
        0
    };
    Some((
        width as u32,
        height.unsigned_abs(),
        header.checked_add(palette)?,
    ))
}

/// A 14-byte BITMAPFILEHEADER for this DIB, so it can be read as a `.bmp` file.
pub fn bmp_header(dib: &[u8]) -> Option<[u8; 14]> {
    let (_, _, pixels_at) = dib_shape(dib)?;
    let mut header = [0u8; 14];
    header[0..2].copy_from_slice(b"BM");
    header[2..6].copy_from_slice(&((dib.len() + 14) as u32).to_le_bytes());
    header[10..14].copy_from_slice(&((pixels_at + 14) as u32).to_le_bytes());
    Some(header)
}

/// The DIB as a `.bmp` byte stream.
pub fn dib_to_bmp(dib: &[u8]) -> Option<Vec<u8>> {
    let header = bmp_header(dib)?;
    let mut bmp = Vec::with_capacity(dib.len() + 14);
    bmp.extend_from_slice(&header);
    bmp.extend_from_slice(dib);
    Some(bmp)
}

#[cfg(windows)]
pub use win::{png_to_dib, save_png};

#[cfg(windows)]
mod win {
    use super::{dib_to_bmp, THUMB_PX};
    use std::path::Path;
    use windows::core::{Interface, Result};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatPng, GUID_WICPixelFormat32bppBGRA,
        IWICBitmapSource, IWICImagingFactory, WICBitmapDitherTypeNone, WICBitmapEncoderNoCache,
        WICBitmapInterpolationModeFant, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CLSCTX_INPROC_SERVER, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET,
    };
    use windows::Win32::UI::Shell::SHCreateMemStream;

    /// Saves a copied picture as `full` and a thumbnail as `thumb`; returns the picture's real size.
    pub fn save_png(
        dib: &[u8],
        full: &Path,
        thumb: &Path,
    ) -> std::result::Result<(u32, u32), String> {
        let bmp = dib_to_bmp(dib).ok_or("not a bitmap winbar can read")?;
        // SAFETY: plain COM calls on objects created here; `bmp` outlives every call that reads it.
        let (size, png, small) = unsafe { encode(&bmp) }.map_err(|e| e.to_string())?;
        super::super::store::write_file(full, &png)?;
        super::super::store::write_file(thumb, &small)?;
        Ok(size)
    }

    /// The picture's size, its PNG, and the thumbnail's PNG.
    type Encoded = ((u32, u32), Vec<u8>, Vec<u8>);

    unsafe fn encode(bmp: &[u8]) -> Result<Encoded> {
        unsafe {
            let wic: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let input = wic.CreateStream()?;
            input.InitializeFromMemory(bmp)?;
            let decoder = wic.CreateDecoderFromStream(
                &input,
                std::ptr::null(),
                WICDecodeMetadataCacheOnDemand,
            )?;
            let frame = decoder.GetFrame(0)?;
            let (mut w, mut h) = (0, 0);
            frame.GetSize(&mut w, &mut h)?;

            let full = write_png(&wic, &frame.cast()?)?;
            let (tw, th) = crate::media::art::fit(w, h, THUMB_PX);
            let scaler = wic.CreateBitmapScaler()?;
            scaler.Initialize(&frame, tw, th, WICBitmapInterpolationModeFant)?;
            let thumb = write_png(&wic, &scaler.cast()?)?;
            Ok(((w, h), full, thumb))
        }
    }

    unsafe fn write_png(wic: &IWICImagingFactory, source: &IWICBitmapSource) -> Result<Vec<u8>> {
        unsafe {
            let output = SHCreateMemStream(None).ok_or_else(windows::core::Error::empty)?;
            let encoder = wic.CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
            encoder.Initialize(&output, WICBitmapEncoderNoCache)?;
            let mut target = None;
            encoder.CreateNewFrame(&mut target, std::ptr::null_mut())?;
            let target = target.ok_or_else(windows::core::Error::empty)?;
            target.Initialize(None)?;
            target.WriteSource(source, std::ptr::null())?;
            target.Commit()?;
            encoder.Commit()?;
            read_stream(&output)
        }
    }

    unsafe fn read_stream(stream: &windows::Win32::System::Com::IStream) -> Result<Vec<u8>> {
        unsafe {
            let mut stat = STATSTG::default();
            stream.Stat(&mut stat, STATFLAG_NONAME)?;
            stream.Seek(0, STREAM_SEEK_SET, None)?;
            let mut bytes = vec![0u8; stat.cbSize as usize];
            let mut read = 0u32;
            stream
                .Read(
                    bytes.as_mut_ptr().cast(),
                    bytes.len() as u32,
                    Some(&mut read),
                )
                .ok()?;
            bytes.truncate(read as usize);
            Ok(bytes)
        }
    }

    /// Reads a saved PNG back into a CF_DIB block, so the picture can be copied again.
    pub fn png_to_dib(path: &Path) -> std::result::Result<Vec<u8>, String> {
        let png = std::fs::read(path).map_err(|e| e.to_string())?;
        // SAFETY: as above; the pixel buffer is sized from the frame WIC reports.
        unsafe { decode_to_dib(&png) }.map_err(|e| e.to_string())
    }

    unsafe fn decode_to_dib(png: &[u8]) -> Result<Vec<u8>> {
        unsafe {
            let wic: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let input = wic.CreateStream()?;
            input.InitializeFromMemory(png)?;
            let decoder = wic.CreateDecoderFromStream(
                &input,
                std::ptr::null(),
                WICDecodeMetadataCacheOnDemand,
            )?;
            let frame = decoder.GetFrame(0)?;
            let (mut w, mut h) = (0, 0);
            frame.GetSize(&mut w, &mut h)?;

            let converter = wic.CreateFormatConverter()?;
            converter.Initialize(
                &frame,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )?;
            let stride = w as usize * 4;
            let mut pixels = vec![0u8; stride * h as usize];
            converter.CopyPixels(std::ptr::null(), stride as u32, &mut pixels)?;

            // BITMAPINFOHEADER, 32-bit, bottom-up as a plain DIB expects.
            let mut dib = Vec::with_capacity(40 + pixels.len());
            dib.extend_from_slice(&40u32.to_le_bytes());
            dib.extend_from_slice(&(w as i32).to_le_bytes());
            dib.extend_from_slice(&(h as i32).to_le_bytes());
            dib.extend_from_slice(&1u16.to_le_bytes());
            dib.extend_from_slice(&32u16.to_le_bytes());
            dib.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
            dib.extend_from_slice(&(pixels.len() as u32).to_le_bytes());
            dib.extend_from_slice(&[0u8; 16]); // resolution and palette counts
            for row in (0..h as usize).rev() {
                dib.extend_from_slice(&pixels[row * stride..(row + 1) * stride]);
            }
            Ok(dib)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A BITMAPINFOHEADER with the given bit depth, compression and palette count, plus one pixel row.
    fn dib(bits: u16, compression: u32, colours_used: u32, palette_bytes: usize) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&4i32.to_le_bytes());
        out.extend_from_slice(&2i32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(&compression.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&[0u8; 8]);
        out.extend_from_slice(&colours_used.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend(std::iter::repeat_n(0u8, palette_bytes + 32));
        out
    }

    #[test]
    fn a_plain_true_colour_bitmap_has_no_palette() {
        assert_eq!(dib_shape(&dib(32, 0, 0, 0)), Some((4, 2, 40)));
    }

    #[test]
    fn a_paletted_bitmap_counts_its_colours() {
        // 8-bit with 256 entries of 4 bytes.
        assert_eq!(dib_shape(&dib(8, 0, 0, 1024)), Some((4, 2, 40 + 1024)));
        // ...and honours an explicit smaller palette.
        assert_eq!(dib_shape(&dib(8, 0, 16, 64)), Some((4, 2, 40 + 64)));
    }

    #[test]
    fn bitfields_leave_room_for_three_masks() {
        assert_eq!(dib_shape(&dib(32, 3, 0, 12)), Some((4, 2, 52)));
    }

    #[test]
    fn nonsense_is_rejected_rather_than_guessed() {
        assert_eq!(dib_shape(&[]), None);
        assert_eq!(dib_shape(&[0, 0, 0, 0]), None);
        assert_eq!(dib_shape(&dib(0, 0, 0, 0)), None, "no bit depth");
        let truncated = &dib(32, 0, 0, 0)[..20];
        assert_eq!(dib_shape(truncated), None, "shorter than its own header");
    }

    #[test]
    fn a_bottom_up_and_a_top_down_bitmap_have_the_same_height() {
        let mut top_down = dib(32, 0, 0, 0);
        top_down[8..12].copy_from_slice(&(-2i32).to_le_bytes());
        assert_eq!(dib_shape(&top_down).map(|s| s.1), Some(2));
    }

    #[test]
    fn the_file_header_points_at_the_pixels() {
        let bytes = dib(8, 0, 16, 64);
        let header = bmp_header(&bytes).expect("a header");
        assert_eq!(&header[0..2], b"BM");
        assert_eq!(
            u32::from_le_bytes(header[2..6].try_into().unwrap()) as usize,
            bytes.len() + 14
        );
        assert_eq!(
            u32::from_le_bytes(header[10..14].try_into().unwrap()),
            40 + 64 + 14
        );
        assert_eq!(dib_to_bmp(&bytes).expect("a bmp").len(), bytes.len() + 14);
    }
}

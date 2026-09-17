//! Artwork for the current track (SPEC-media §3, §5.1): the session's thumbnail stream is decoded with WIC, scaled
//! down to fit 280 px and sent to the page as a PNG data URL. Only the current track's artwork is kept.

/// Longest side of the artwork sent to the page (the card shows it at 140 logical px, so 2× for high DPI).
pub const MAX_PX: u32 = 280;

/// Size that fits `max`×`max` keeping the aspect ratio; never scales up.
pub fn fit(width: u32, height: u32, max: u32) -> (u32, u32) {
    if width == 0 || height == 0 || (width <= max && height <= max) {
        return (width, height);
    }
    if width >= height {
        (
            max,
            ((height as u64 * max as u64 + width as u64 / 2) / width as u64).max(1) as u32,
        )
    } else {
        (
            ((width as u64 * max as u64 + height as u64 / 2) / height as u64).max(1) as u32,
            max,
        )
    }
}

/// Reads and encodes a session thumbnail. Call on a thread with COM initialised (the media thread).
#[cfg(windows)]
pub fn read(
    thumbnail: &windows::Storage::Streams::IRandomAccessStreamReference,
) -> Result<String, String> {
    use windows::Storage::Streams::DataReader;
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatPng, IWICImagingFactory,
        WICBitmapEncoderNoCache, WICBitmapInterpolationModeFant, WICDecodeMetadataCacheOnDemand,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CLSCTX_INPROC_SERVER, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET,
    };
    use windows::Win32::UI::Shell::SHCreateMemStream;

    const MAX_BYTES: u64 = 16 * 1024 * 1024;

    let stream = thumbnail
        .OpenReadAsync()
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;
    let size = stream.Size().map_err(|e| e.to_string())?;
    if size == 0 || size > MAX_BYTES {
        return Err(format!("artwork of {size} bytes"));
    }
    let reader = DataReader::CreateDataReader(&stream).map_err(|e| e.to_string())?;
    let loaded = reader
        .LoadAsync(size as u32)
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut bytes).map_err(|e| e.to_string())?;

    // SAFETY: plain COM calls on objects created here; buffers outlive the calls that use them.
    let png = unsafe {
        (|| -> windows::core::Result<Vec<u8>> {
            let wic: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let input = wic.CreateStream()?;
            input.InitializeFromMemory(&bytes)?;
            let decoder = wic.CreateDecoderFromStream(
                &input,
                std::ptr::null(),
                WICDecodeMetadataCacheOnDemand,
            )?;
            let frame = decoder.GetFrame(0)?;
            let (mut w, mut h) = (0, 0);
            frame.GetSize(&mut w, &mut h)?;
            let (tw, th) = fit(w, h, MAX_PX);
            let scaler = wic.CreateBitmapScaler()?;
            scaler.Initialize(&frame, tw, th, WICBitmapInterpolationModeFant)?;

            let output = SHCreateMemStream(None).ok_or_else(windows::core::Error::empty)?;
            let encoder = wic.CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
            encoder.Initialize(&output, WICBitmapEncoderNoCache)?;
            let mut target = None;
            encoder.CreateNewFrame(&mut target, std::ptr::null_mut())?;
            let target = target.ok_or_else(windows::core::Error::empty)?;
            target.Initialize(None)?;
            target.WriteSource(&scaler, std::ptr::null())?;
            target.Commit()?;
            encoder.Commit()?;

            let mut stat = STATSTG::default();
            output.Stat(&mut stat, STATFLAG_NONAME)?;
            output.Seek(0, STREAM_SEEK_SET, None)?;
            let mut png = vec![0u8; stat.cbSize as usize];
            let mut read = 0u32;
            output
                .Read(png.as_mut_ptr().cast(), png.len() as u32, Some(&mut read))
                .ok()?;
            png.truncate(read as usize);
            Ok(png)
        })()
    }
    .map_err(|e| e.to_string())?;
    Ok(crate::command_bar::icons::data_url(&png))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_the_longest_side_and_keeps_the_ratio() {
        assert_eq!(fit(640, 640, 280), (280, 280));
        assert_eq!(fit(1280, 720, 280), (280, 158));
        assert_eq!(fit(300, 600, 280), (140, 280));
    }

    #[test]
    fn never_scales_up_or_divides_by_zero() {
        assert_eq!(fit(120, 90, 280), (120, 90));
        assert_eq!(fit(280, 280, 280), (280, 280));
        assert_eq!(fit(0, 0, 280), (0, 0));
        assert_eq!(fit(10_000, 1, 280), (280, 1));
    }
}

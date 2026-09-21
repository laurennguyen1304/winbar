import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { notchShape, type NotchLayout, type NotchMaterial } from "./notch-shape";
import styles from "./NotchShape.module.css";

interface NotchShapeProps {
  layout: NotchLayout;
  material: NotchMaterial;
  /** Solid black behind the material, 0-100 (SPEC-notch-shell §5.1). */
  opacity?: number;
  /** Where the notch is heading; the corner radius eases with the height between the previous and this target. */
  targetHeight: number;
  radius: number;
}

/**
 * Background and rim of the notch, drawn behind its content (SPEC §15 V1–V2). Sits inside the notch element and
 * follows its animated size with a ResizeObserver, writing the paths straight to the DOM (no React render per frame).
 */
export function NotchShape({ layout, material, opacity = 0, targetHeight, radius }: NotchShapeProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<SVGPathElement>(null);
  const innerRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // useId output is not a valid url(#…) reference as is.
  const gradientId = `notch-rim${useId().replace(/[^\w-]/g, "")}`;
  const drawn = useRef<{ height: number; radius: number } | undefined>(undefined);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const notch = box?.parentElement;
    if (!box || !notch) return;
    const from = drawn.current ?? { height: targetHeight, radius };

    const draw = () => {
      const width = notch.offsetWidth;
      const height = notch.offsetHeight;
      const span = from.height - targetHeight;
      const progress = span === 0 ? 0 : Math.min(1, Math.max(0, (height - targetHeight) / span));
      const r = radius + (from.radius - radius) * progress;
      const s = notchShape(width, height, r, layout);
      box.style.left = `${-s.inset}px`;
      box.style.width = `${s.width}px`;
      box.style.height = `${s.height}px`;
      fillRef.current?.style.setProperty("clip-path", `path("${s.fill}")`);
      svgRef.current?.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
      rimRef.current?.setAttribute("d", s.rim);
      innerRef.current?.setAttribute("d", s.innerRim);
      drawn.current = { height, radius: r };
    };

    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(notch);
    return () => observer.disconnect();
  }, [layout, targetHeight, radius]);

  return (
    <div
      ref={boxRef}
      className={styles.shape}
      data-material={material}
      data-layout={layout}
      style={{ "--notch-opacity": Math.min(100, Math.max(0, opacity)) / 100 } as CSSProperties}
      aria-hidden
    >
      <div ref={fillRef} className={styles.fill} />
      <svg ref={svgRef} className={styles.rim} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {/* Softer than before: the reference keeps its brightness for the bottom edge, not the rim. */}
            <stop offset="0" stopColor="#fff" stopOpacity={0.16} />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0.07} />
            <stop offset="1" stopColor="#fff" stopOpacity={0.14} />
          </linearGradient>
        </defs>
        <path
          ref={rimRef}
          className={styles.outer}
          style={material === "liquid" ? { stroke: `url(#${gradientId})` } : undefined}
        />
        <path ref={innerRef} className={styles.inner} />
      </svg>
    </div>
  );
}

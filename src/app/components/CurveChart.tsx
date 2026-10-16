// Output-over-time chart for the Output Preview: one 2px line per component, a cursor at the current
// time, hover crosshair + tooltip, click/drag to scrub. Series colours were validated for the dark
// surface (dataviz validator: lightness, chroma, CVD and contrast all pass).
import { useRef, useState } from 'react';
import { formatValue } from '../preview/context';

const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
const NAMES_VEC = ['x', 'y', 'z', 'w'];
const NAMES_COLOR = ['r', 'g', 'b', 'a'];

export interface CurvePoint {
  t: number;
  /** Numbers per component, or null where evaluation failed. */
  v: number[] | null;
}

interface Props {
  points: CurvePoint[];
  duration: number;
  time: number;
  isColor?: boolean;
  onScrub: (t: number) => void;
}

const W = 340;
const H = 120;
const PAD = { l: 44, r: 8, t: 8, b: 18 };

/** Short axis label: at most 4 significant digits, k for thousands. */
function tick(v: number): string {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(a >= 100000 ? 0 : 1)}k`;
  return String(Number(v.toPrecision(4)));
}

export function CurveChart({ points, duration, time, isColor, onScrub }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const dims = Math.max(0, ...points.map((p) => p.v?.length ?? 0));
  const all = points.flatMap((p) => p.v ?? []).filter(Number.isFinite);
  if (!dims || !all.length) return null;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const names = dims === 1 ? ['value'] : isColor ? NAMES_COLOR : NAMES_VEC;
  const x = (t: number) => PAD.l + (t / duration) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

  const tAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.min(duration, Math.max(0, ((px - PAD.l) / (W - PAD.l - PAD.r)) * duration));
  };
  const nearest = (t: number) => points.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), points[0]!);

  const paths = Array.from({ length: dims }, (_, d) => {
    let dPath = '';
    let pen = false;
    for (const p of points) {
      const v = p.v?.[d];
      if (v === undefined || !Number.isFinite(v)) {
        pen = false;
        continue;
      }
      dPath += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return dPath;
  });
  const last = [...points].reverse().find((p) => p.v);
  const hoverPoint = hover != null ? nearest(hover) : null;
  const zeroInRange = min < 0 && max > 0;

  return (
    <figure className="curve">
      <figcaption className="curve-legend">
        {dims > 1 && names.slice(0, dims).map((n, i) => (
          <span key={n}><i style={{ background: SERIES[i] }} aria-hidden /> {n}</span>
        ))}
        <span className="muted small">click or drag to scrub</span>
      </figcaption>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Output from 0 to ${duration} seconds, ranging ${formatValue(min)} to ${formatValue(max)}`}
        onPointerMove={(e) => {
          const t = tAt(e.clientX);
          setHover(t);
          if (dragging) onScrub(t);
        }}
        onPointerLeave={() => { setHover(null); setDragging(false); }}
        onPointerDown={(e) => { setDragging(true); onScrub(tAt(e.clientX)); }}
        onPointerUp={() => setDragging(false)}
      >
        {/* Recessive frame: min/max labels, baseline, optional zero line */}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="curve-axis" />
        {zeroInRange && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="curve-grid" />}
        <text x={PAD.l - 4} y={PAD.t + 4} className="curve-tick" textAnchor="end">{tick(max)}</text>
        <text x={PAD.l - 4} y={H - PAD.b} className="curve-tick" textAnchor="end">{tick(min)}</text>
        <text x={PAD.l} y={H - 4} className="curve-tick">0s</text>
        <text x={W - PAD.r} y={H - 4} className="curve-tick" textAnchor="end">{duration}s</text>

        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Direct labels at the end of each line (<= 4 series) */}
        {dims > 1 && last?.v && last.v.map((v, i) => (
          Number.isFinite(v) ? <text key={i} x={W - PAD.r - 2} y={y(v) - 4} className="curve-label" textAnchor="end">{names[i]}</text> : null
        ))}

        {/* Current time */}
        <line x1={x(time)} x2={x(time)} y1={PAD.t} y2={H - PAD.b} className="curve-cursor" />

        {/* Hover crosshair + markers */}
        {hoverPoint && (
          <g pointerEvents="none">
            <line x1={x(hoverPoint.t)} x2={x(hoverPoint.t)} y1={PAD.t} y2={H - PAD.b} className="curve-hover" />
            {hoverPoint.v?.map((v, i) => Number.isFinite(v) && (
              <circle key={i} cx={x(hoverPoint.t)} cy={y(v)} r={4} fill={SERIES[i]} stroke="var(--panel)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hoverPoint && (
        <div className="curve-tip" style={{ left: `${(x(hoverPoint.t) / W) * 100}%` }}>
          <strong>{hoverPoint.t.toFixed(2)}s</strong>
          {hoverPoint.v
            ? hoverPoint.v.map((v, i) => (
                <span key={i}>{dims > 1 && <i style={{ background: SERIES[i] }} aria-hidden />}{dims > 1 ? `${names[i]} ` : ''}{formatValue(v)}</span>
              ))
            : <span className="muted">error</span>}
        </div>
      )}
    </figure>
  );
}

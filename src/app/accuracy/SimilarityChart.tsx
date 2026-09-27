"use client";

// Grouped column chart: for each age-gap group, how similar three things are to the
// person's REAL later photo (ArcFace cosine similarity). Hover a column for details;
// the same numbers are in the table below the chart.

import { useState } from "react";

export type ChartGroup = {
  label: string;
  pairs: number;
  baseline: number;
  aged: number;
  strangers: number;
};

const SERIES = [
  { key: "baseline", name: "Original childhood photo, unchanged", color: "var(--series-baseline)" },
  { key: "aged", name: "Aged by Still Looking", color: "var(--series-aged)" },
  { key: "strangers", name: "Aged image vs. other people (chance level)", color: "var(--series-strangers)" },
] as const;

const W = 640;
const H = 300;
const PAD = { top: 20, right: 12, bottom: 52, left: 40 };
const BAR = 24; // columns stay thin; the leftover space is air
const GAP = 2; // surface gap between touching columns

export default function SimilarityChart({ groups }: { groups: ChartGroup[] }) {
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);

  const max = Math.max(0.6, ...groups.flatMap((g) => [g.baseline, g.aged, g.strangers]));
  const yMax = Math.ceil(max * 10) / 10;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / groups.length;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: Math.round(yMax / 0.1) + 1 }, (_, i) => +(i * 0.1).toFixed(1));

  return (
    <figure className="space-y-3">
      {/* legend: identity never relies on colour alone */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
          aria-label="Column chart of face similarity to the real later photo, by age gap. The unchanged original photo scores highest in every group, the aged image is in between, and other people score lowest.">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)">
                {t.toFixed(1)}
              </text>
            </g>
          ))}

          {groups.map((g, gi) => {
            const cx = PAD.left + band * gi + band / 2;
            return (
              <g key={g.label}>
                {SERIES.map((s, si) => {
                  const v = g[s.key];
                  const x = cx + (si - 1) * (BAR + GAP) - BAR / 2;
                  const top = y(v);
                  const h = Math.max(PAD.top + plotH - top, 1);
                  const r = Math.min(4, h); // 4px rounded data-end, square at the baseline
                  const active = hover?.g === gi && hover.s === si;
                  return (
                    <g key={s.key}>
                      <path
                        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + BAR - r} Q${x + BAR},${top} ${x + BAR},${top + r} V${top + h} Z`}
                        fill={s.color}
                        opacity={hover && !active ? 0.45 : 1}
                      />
                      <text x={x + BAR / 2} y={top - 5} textAnchor="middle" fontSize={11} fill="var(--foreground)">
                        {v.toFixed(2)}
                      </text>
                      {/* hit target larger than the mark */}
                      <rect x={x - GAP} y={PAD.top} width={BAR + GAP * 2} height={plotH} fill="transparent"
                        onMouseEnter={() => setHover({ g: gi, s: si })} onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ g: gi, s: si })} onBlur={() => setHover(null)} tabIndex={0}
                        aria-label={`${g.label}: ${s.name}, ${v.toFixed(2)}`} />
                    </g>
                  );
                })}
                <text x={cx} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={12} fill="var(--foreground)">{g.label}</text>
                <text x={cx} y={H - PAD.bottom + 34} textAnchor="middle" fontSize={11} fill="var(--muted)">{g.pairs} people</text>
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--muted)" strokeWidth={1} />
        </svg>

        {hover && (() => {
          const g = groups[hover.g];
          const s = SERIES[hover.s];
          return (
            <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm">
              <div className="font-medium">{g.label} gap · {g.pairs} people</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.name}: <strong>{g[s.key].toFixed(2)}</strong>
              </div>
            </div>
          );
        })()}
      </div>
      <figcaption className="text-xs text-muted">
        Face similarity to the person&apos;s real later photo (ArcFace cosine similarity; higher = more alike).
        Years between the childhood photo and the later photo on the horizontal axis.
      </figcaption>
    </figure>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/* ======================================================================
 * Graphiques SVG légers (aucune dépendance).
 * Règles appliquées : un seul axe, grille discrète, barres fines à bout
 * arrondi (4 px) avec 2 px d'écart, légende + info-bulle au survol/focus,
 * vue tableau accessible. Couleurs : variables --chart-* (validées CVD).
 * ==================================================================== */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    // Mesure immédiate (le ResizeObserver ne se déclenche qu'au prochain rendu)
    setWidth(ref.current.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Graduations « rondes » : 0, 10 k, 20 k… */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Barre verticale : bout supérieur arrondi (4 px), base plate sur l'axe. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export interface Series {
  key: string;
  label: string;
  color: string; // variable CSS, ex. var(--chart-1)
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Bascule graphique / tableau (accessibilité, lecteurs d'écran, valeurs exactes). */
export function ViewToggle({ table, onChange }: { table: boolean; onChange: (t: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!table)}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      aria-pressed={table}
    >
      {table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
      {table ? 'Graphique' : 'Tableau'}
    </button>
  );
}

interface GroupedBarProps<T> {
  data: T[];
  series: Series[];
  category: (d: T) => string;
  categoryLong: (d: T) => string;
  value: (d: T, key: string) => number;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  extra?: (d: T) => ReactNode;
  height?: number;
  ariaLabel: string;
}

/** Barres groupées par catégorie (ex. mois), un axe unique. */
export function GroupedBarChart<T>({ data, series, category, categoryLong, value, format, formatAxis, extra, height = 220, ariaLabel }: GroupedBarProps<T>) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const margin = { top: 12, right: 8, bottom: 24, left: 52 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => value(d, s.key))));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => innerH - (v / top) * innerH;
  const slot = data.length ? innerW / data.length : 0;
  const gap = 2;
  const barW = Math.max(4, Math.min(22, (slot * 0.62 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  // Étiquettes de l'axe X : on en saute si l'espace manque
  const labelEvery = slot < 34 ? 2 : 1;

  const tip = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? margin.left + slot * hover + slot / 2 : 0;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={0} x2={innerW} stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={-8} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = slot * i + (slot - groupW) / 2;
              return (
                <g key={i}>
                  {hover === i && <rect x={slot * i + 2} y={0} width={slot - 4} height={innerH} rx={6} className="fill-slate-100" />}
                  {series.map((s, si) => {
                    const v = value(d, s.key);
                    return <path key={s.key} d={barPath(x0 + si * (barW + gap), y(v), barW, innerH - y(v))} fill={s.color} />;
                  })}
                  {i % labelEvery === 0 && (
                    <text x={slot * i + slot / 2} y={innerH + 16} textAnchor="middle" className={`text-[11px] ${hover === i ? 'fill-slate-700' : 'fill-slate-400'}`}>
                      {category(d)}
                    </text>
                  )}
                  {/* Zone de survol plus large que les barres (+ focus clavier) */}
                  <rect
                    x={slot * i}
                    y={0}
                    width={slot}
                    height={innerH + margin.bottom}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${categoryLong(d)} : ${series.map((s) => `${s.label} ${format(value(d, s.key))}`).join(', ')}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="cursor-default outline-none"
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 min-w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(tipLeft, 90), width - 90) }}
        >
          <div className="mb-1 font-semibold text-slate-800">{categoryLong(tip)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium tabular-nums text-slate-900">{format(value(tip, s.key))}</span>
            </div>
          ))}
          {extra && <div className="mt-1 border-t border-slate-100 pt-1 text-slate-500">{extra(tip)}</div>}
        </div>
      )}
    </div>
  );
}

interface HBarRow {
  key: string;
  label: string;
  value: number;
  color: string;
  detail: string;
  tooltip: ReactNode;
}

/** Barres horizontales ordonnées (étapes du pipeline), étiquettes directes. */
export function HorizontalBars({ rows, format }: { rows: HBarRow[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li
          key={r.key}
          className="relative"
          tabIndex={0}
          onMouseEnter={() => setHover(r.key)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(r.key)}
          onBlur={() => setHover(null)}
          aria-label={`${r.label} : ${format(r.value)}, ${r.detail}`}
        >
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-slate-700">{r.label}</span>
            <span className="tabular-nums text-slate-500">
              <span className="font-medium text-slate-800">{format(r.value)}</span> · {r.detail}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full transition-[width] duration-500" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%`, background: r.color }} />
          </div>
          {hover === r.key && (
            <div role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
              {r.tooltip}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Contrôle segmenté pour la période. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition-colors ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

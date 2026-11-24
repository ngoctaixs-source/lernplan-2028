import React from 'react';
import { BarChart3 } from 'lucide-react';

function BreakEvenChart({ spec }) {
  const kf = Number(spec.kf || 0);
  const kv = Number(spec.kv || 0);
  const price = Number(spec.price || 0);
  const db = price - kv;
  const currency = spec.currency || '€';
  const unit = spec.unit || 'Stück';

  if (db <= 0 || kf <= 0) return null;

  const bepX = kf / db;
  const bepY = bepX * price;
  const maxX = Math.ceil(bepX * 1.65);
  const maxY = Math.max(maxX * price, kf + maxX * kv) * 1.1;

  // SVG coordinate space
  const W = 520;
  const H = 260;
  const padL = 64;
  const padR = 24;
  const padT = 20;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (val) => padL + (val / maxX) * plotW;
  const toY = (val) => padT + plotH - (val / maxY) * plotH;

  const x0 = toX(0);
  const y0 = toY(0);
  const yKf = toY(kf);
  const xEnd = toX(maxX);
  const yTotalEnd = toY(kf + kv * maxX);
  const yRevEnd = toY(price * maxX);
  const xBep = toX(bepX);
  const yBep = toY(bepY);

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl mx-auto h-auto select-none">
          {/* Loss zone triangle (0 to BEP) */}
          <polygon
            points={`${x0},${yKf} ${xBep},${yBep} ${x0},${y0}`}
            fill="rgba(244, 63, 94, 0.12)"
          />
          {/* Profit zone triangle (BEP to maxX) */}
          <polygon
            points={`${xBep},${yBep} ${xEnd},${yRevEnd} ${xEnd},${yTotalEnd}`}
            fill="rgba(16, 185, 129, 0.16)"
          />

          {/* Grid axes */}
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#94a3b8" strokeWidth="1.5" />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#94a3b8" strokeWidth="1.5" />

          {/* Fixkosten horizontal dashed line */}
          <line x1={x0} y1={yKf} x2={xEnd} y2={yKf} stroke="#64748b" strokeWidth="1.5" strokeDasharray="5,4" />
          <text x={x0 + 6} y={yKf - 5} fontSize="10" fill="#64748b" fontWeight="600">
            Kf = {kf.toLocaleString('de-DE')} {currency}
          </text>

          {/* Gesamtkosten line (K = Kf + kv*x) */}
          <line x1={x0} y1={yKf} x2={xEnd} y2={yTotalEnd} stroke="#f97316" strokeWidth="2.5" />
          <text x={xEnd - 86} y={yTotalEnd + 14} fontSize="10.5" fill="#ea580c" fontWeight="700">
            Gesamtkosten (K)
          </text>

          {/* Erlöse line (E = p*x) */}
          <line x1={x0} y1={y0} x2={xEnd} y2={yRevEnd} stroke="#10b981" strokeWidth="2.5" />
          <text x={xEnd - 64} y={Math.max(padT + 12, yRevEnd - 6)} fontSize="10.5" fill="#059669" fontWeight="700">
            Erlöse (E)
          </text>

          {/* BEP projection dashed lines */}
          <line x1={xBep} y1={yBep} x2={xBep} y2={H - padB} stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="4,3" />
          <line x1={padL} y1={yBep} x2={xBep} y2={yBep} stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="4,3" />

          {/* BEP Highlight Dot */}
          <circle cx={xBep} cy={yBep} r="5.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="2" />
          <text x={xBep - 42} y={yBep - 10} fontSize="11" fill="#4f46e5" fontWeight="800">
            BEP ({Math.ceil(bepX)} {unit})
          </text>

          {/* Zone Labels */}
          <text x={padL + 14} y={y0 - 12} fontSize="10" fill="#e11d48" fontWeight="700">
            Verlustzone
          </text>
          <text x={xBep + 34} y={yBep - 6} fontSize="10" fill="#059669" fontWeight="700">
            Gewinnzone
          </text>

          {/* Axis value labels */}
          <text x={xBep} y={H - padB + 16} textAnchor="middle" fontSize="10.5" fill="#4f46e5" fontWeight="700">
            {Math.ceil(bepX)}
          </text>
          <text x={padL - 6} y={yBep + 4} textAnchor="end" fontSize="10" fill="#4f46e5" fontWeight="700">
            {Math.round(bepY).toLocaleString('de-DE')}{currency}
          </text>
          <text x={W - padR} y={H - 8} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">
            Menge ({unit}) →
          </text>
          <text x={padL} y={13} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="600">
            {currency} ↑
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          db = {price} − {kv} = <strong>{db} {currency}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
          BEP = {kf.toLocaleString('de-DE')} / {db} = <strong>{Math.ceil(bepX)} {unit}</strong>
        </span>
      </div>
    </div>
  );
}

function TKontoChart({ spec }) {
  const soll = spec.soll || [];
  const haben = spec.haben || [];
  return (
    <div className="max-w-xl mx-auto">
      <div className="grid grid-cols-2 border-b-2 border-slate-800 dark:border-slate-300 pb-1.5 text-xs font-extrabold uppercase tracking-wider">
        <span className="text-left text-indigo-700 dark:text-indigo-300">Soll (Bên Nợ)</span>
        <span className="text-center font-black text-slate-900 dark:text-white col-span-2 -mt-4 pointer-events-none">
          {spec.account || 'Konto'}
        </span>
        <span className="text-right text-emerald-700 dark:text-emerald-300 -mt-4">Haben (Bên Có)</span>
      </div>
      <div className="grid grid-cols-2 divide-x-2 divide-slate-800 dark:divide-slate-300 text-xs sm:text-sm">
        <div className="pr-3 py-2.5 space-y-1.5">
          {soll.map((row, idx) => (
            <div key={idx} className="flex justify-between gap-2">
              <span className="text-slate-700 dark:text-slate-200">{row.label}</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">{row.amount}</span>
            </div>
          ))}
        </div>
        <div className="pl-3 py-2.5 space-y-1.5">
          {haben.map((row, idx) => (
            <div key={idx} className="flex justify-between gap-2">
              <span className="text-slate-700 dark:text-slate-200">{row.label}</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">{row.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowChart({ spec }) {
  const steps = spec.steps || [];
  if (!steps.length) return null;
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 flex-wrap">
      {steps.map((st, idx) => (
        <React.Fragment key={idx}>
          <div className="flex-1 min-w-[150px] max-w-[240px] bg-white dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 shadow-sm text-center space-y-1">
            {st.badge && (
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                {st.badge}
              </span>
            )}
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">{st.title}</div>
            {st.subtitle && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{st.subtitle}</div>
            )}
          </div>
          {idx < steps.length - 1 && (
            <div className="text-center text-indigo-500 font-black text-lg leading-none select-none">
              <span className="hidden sm:inline">→</span>
              <span className="sm:hidden">↓</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function BarComparisonChart({ spec }) {
  const items = spec.items || [];
  const unit = spec.unit || '';
  if (!items.length) return null;
  const maxVal = Math.max(...items.map((i) => Number(i.value || 0)), 1);

  return (
    <div className="space-y-2.5 max-w-xl mx-auto">
      {items.map((item, idx) => {
        const val = Number(item.value || 0);
        const pct = Math.max(4, Math.round((val / maxVal) * 100));
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-200">{item.label}</span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                {val.toLocaleString('de-DE')} {unit}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DiagramRenderer({ diagram }) {
  if (!diagram || !diagram.type) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
        <BarChart3 className="w-4 h-4" />
        <span>{diagram.title || 'Biểu đồ & Sơ đồ trực quan'}</span>
      </div>
      {diagram.type === 'break_even' && <BreakEvenChart spec={diagram} />}
      {diagram.type === 't_konto' && <TKontoChart spec={diagram} />}
      {diagram.type === 'flow' && <FlowChart spec={diagram} />}
      {diagram.type === 'bar' && <BarComparisonChart spec={diagram} />}
    </div>
  );
}

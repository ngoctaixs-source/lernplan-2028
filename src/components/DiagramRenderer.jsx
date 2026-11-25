import React from 'react';

function parseGermanNumber(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (!val) return NaN;
  const cleaned = String(val)
    .replace(/[^\d.,-]/g, '')
    .trim();
  if (!cleaned) return NaN;
  // Định dạng số kiểu Đức: 360.000,50 -> 360000.50
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (cleaned.includes(',')) {
    return Number(cleaned.replace(',', '.'));
  }
  // Nếu có dấu chấm phân cách hàng nghìn (VD: 360.000)
  if (/^\-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, ''));
  }
  return Number(cleaned);
}

function formatGermanEuro(num, currency = '€') {
  if (!Number.isFinite(num)) return '';
  return `${num.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`.trim();
}

// Render 1 T-Konto / Bilanz / GuV chuẩn IHK Đức (có Buchhalternase & dấu gạch đôi ===)
function SingleTKonto({
  account = 'T-Konto',
  leftHeader = 'Soll',
  rightHeader = 'Haben',
  soll = [],
  haben = [],
  totalLeft = '',
  totalRight = '',
  compact = false,
}) {
  const leftRows = Array.isArray(soll) ? soll : [];
  const rightRows = Array.isArray(haben) ? haben : [];
  const maxRows = Math.max(leftRows.length, rightRows.length, 1);

  const calcSum = (rows) => {
    const nums = rows.map((r) => parseGermanNumber(r?.amount)).filter((n) => Number.isFinite(n));
    if (!nums.length) return '';
    return formatGermanEuro(nums.reduce((a, b) => a + b, 0));
  };

  const sumL = totalLeft || calcSum(leftRows);
  const sumR = totalRight || calcSum(rightRows);
  const showBuchhalternaseLeft = leftRows.length < rightRows.length;
  const showBuchhalternaseRight = rightRows.length < leftRows.length;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 overflow-hidden shadow-sm">
      {/* Header T-Konto */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border-b-2 border-slate-800 dark:border-indigo-400">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {leftHeader}
        </span>
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-black text-slate-900 dark:text-white px-2 text-center`}>
          {account}
        </span>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right">
          {rightHeader}
        </span>
      </div>

      {/* Body T-Konto (2 cột ngăn bởi trục dọc giữa) */}
      <div className="grid grid-cols-2 divide-x-2 divide-slate-800 dark:divide-indigo-400">
        {/* Bên Trái (Soll / Aktiva) */}
        <div className="flex flex-col justify-between min-h-[96px]">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {leftRows.map((item, idx) => (
              <div key={idx} className="px-3 py-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-700 dark:text-slate-200 font-medium break-words">
                  {item?.label || ''}
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0 tabular-nums">
                  {item?.amount || ''}
                </span>
              </div>
            ))}
          </div>

          {/* Buchhalternase (đường gạch chéo chuẩn kế toán Đức ở bên ít dòng hơn) */}
          {showBuchhalternaseLeft && (
            <div className="px-3 py-2 flex items-center" title="Buchhalternase (gạch chéo chống điền thêm chuẩn IHK)">
              <svg viewBox="0 0 120 26" className="w-full h-6 text-indigo-400/70 dark:text-indigo-400/60" preserveAspectRatio="none">
                <path d="M 4 22 L 106 4 L 116 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          )}
        </div>

        {/* Bên Phải (Haben / Passiva) */}
        <div className="flex flex-col justify-between min-h-[96px]">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {rightRows.map((item, idx) => (
              <div key={idx} className="px-3 py-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-slate-700 dark:text-slate-200 font-medium break-words">
                  {item?.label || ''}
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0 tabular-nums">
                  {item?.amount || ''}
                </span>
              </div>
            ))}
          </div>

          {showBuchhalternaseRight && (
            <div className="px-3 py-2 flex items-center" title="Buchhalternase (gạch chéo chống điền thêm chuẩn IHK)">
              <svg viewBox="0 0 120 26" className="w-full h-6 text-indigo-400/70 dark:text-indigo-400/60" preserveAspectRatio="none">
                <path d="M 4 22 L 106 4 L 116 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Dòng Tổng kết với gạch đôi chuẩn IHK (===) */}
      {(sumL || sumR) && (
        <div className="grid grid-cols-2 divide-x-2 divide-slate-800 dark:divide-indigo-400 border-t border-slate-400 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-800/60">
          <div className="px-3 py-2 flex items-center justify-between text-xs font-extrabold text-slate-900 dark:text-white">
            <span className="text-[10px] uppercase text-slate-400">Summe</span>
            <span className="font-mono border-b-4 border-double border-slate-900 dark:border-indigo-300 pb-0.5 tabular-nums">
              {sumL || '—'}
            </span>
          </div>
          <div className="px-3 py-2 flex items-center justify-between text-xs font-extrabold text-slate-900 dark:text-white">
            <span className="text-[10px] uppercase text-slate-400">Summe</span>
            <span className="font-mono border-b-4 border-double border-slate-900 dark:border-indigo-300 pb-0.5 tabular-nums">
              {sumR || '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Biểu đồ Break-even-Point (Gewinnschwelle) chuẩn IHK
function BreakEvenChart({ diagram }) {
  const kf = Number(diagram.kf) || 0;
  const kv = Number(diagram.kv) || 0;
  const price = Number(diagram.price) || 0;
  const unit = diagram.unit || 'Stück';
  const currency = diagram.currency || '€';

  const db = price - kv;
  if (db <= 0 || kf <= 0) return null;

  const bepX = kf / db;
  const bepY = bepX * price;
  const maxX = Math.ceil(bepX * 1.65);
  const maxY = Math.ceil(Math.max(maxX * price, kf + maxX * kv) * 1.12);

  const W = 540;
  const H = 270;
  const padL = 68;
  const padR = 28;
  const padT = 22;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (x) => padL + (x / maxX) * plotW;
  const toY = (y) => padT + plotH - (y / maxY) * plotH;

  const x0 = toX(0);
  const y0 = toY(0);
  const xMax = toX(maxX);
  const yKf = toY(kf);
  const yKmax = toY(kf + maxX * kv);
  const yEmax = toY(maxX * price);
  const xBep = toX(bepX);
  const yBep = toY(bepY);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
          {diagram.title || 'Break-even-Point (Gewinnschwelle)'}
        </h4>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            BEP: {Math.ceil(bepX).toLocaleString('de-DE')} {unit}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
            Umsatz: {Math.round(bepY).toLocaleString('de-DE')} {currency}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            DB = {db.toLocaleString('de-DE')} {currency}
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Vùng Lỗ (Verlustzone) & Vùng Lãi (Gewinnzone) */}
        <polygon points={`${x0},${y0} ${x0},${yKf} ${xBep},${yBep}`} fill="rgba(244,63,94,0.12)" />
        <polygon points={`${xBep},${yBep} ${xMax},${yEmax} ${xMax},${yKmax}`} fill="rgba(16,185,129,0.15)" />

        {/* Trục tọa độ */}
        <line x1={x0} y1={padT} x2={x0} y2={y0} stroke="#64748b" strokeWidth="1.5" />
        <line x1={x0} y1={y0} x2={xMax} y2={y0} stroke="#64748b" strokeWidth="1.5" />

        {/* Đường Fixkosten Kf */}
        <line x1={x0} y1={yKf} x2={xMax} y2={yKf} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={xMax - 4} y={yKf - 5} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="700">
          Kf = {kf.toLocaleString('de-DE')} {currency}
        </text>

        {/* Đường Gesamtkosten K(x) */}
        <line x1={x0} y1={yKf} x2={xMax} y2={yKmax} stroke="#f43f5e" strokeWidth="2.5" />
        <text x={xMax - 4} y={yKmax + 13} textAnchor="end" fontSize="11" fill="#f43f5e" fontWeight="800">
          K(x)
        </text>

        {/* Đường Erlöse E(x) */}
        <line x1={x0} y1={y0} x2={xMax} y2={yEmax} stroke="#10b981" strokeWidth="2.5" />
        <text x={xMax - 4} y={yEmax - 6} textAnchor="end" fontSize="11" fill="#10b981" fontWeight="800">
          E(x)
        </text>

        {/* Đường gióng tọa độ BEP */}
        <line x1={xBep} y1={yBep} x2={xBep} y2={y0} stroke="#6366f1" strokeWidth="1.4" strokeDasharray="4 3" />
        <line x1={x0} y1={yBep} x2={xBep} y2={yBep} stroke="#6366f1" strokeWidth="1.4" strokeDasharray="4 3" />
        <circle cx={xBep} cy={yBep} r="5.5" fill="#6366f1" stroke="#ffffff" strokeWidth="2" />

        {/* Nhãn BEP */}
        <text x={xBep} y={yBep - 10} textAnchor="middle" fontSize="11" fill="#6366f1" fontWeight="800">
          BEP ({Math.round(bepX)} {unit})
        </text>
        <text x={xBep} y={y0 + 16} textAnchor="middle" fontSize="10" fill="#6366f1" fontWeight="700">
          {Math.round(bepX).toLocaleString('de-DE')}
        </text>
        <text x={x0 - 6} y={yBep + 4} textAnchor="end" fontSize="10" fill="#6366f1" fontWeight="700">
          {Math.round(bepY).toLocaleString('de-DE')}
        </text>
        <text x={x0 - 6} y={yKf + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
          {kf.toLocaleString('de-DE')}
        </text>

        {/* Nhãn trục */}
        <text x={xMax} y={y0 + 30} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="700">
          Menge x ({unit}) →
        </text>
        <text x={x0 - 6} y={padT - 6} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="700">
          {currency} ↑
        </text>
      </svg>
    </div>
  );
}

// Biểu đồ Cung - Cầu / Giá cân bằng (Angebot & Nachfrage / Preisbildung)
function SupplyDemandChart({ diagram }) {
  const eqPrice = Number(diagram.eqPrice) || 50;
  const eqQty = Number(diagram.eqQty) || 500;
  const maxPrice = Number(diagram.maxPrice) || eqPrice * 2;
  const maxQty = Number(diagram.maxQty) || eqQty * 2;
  const priceLine = diagram.priceLine || null;

  const W = 520;
  const H = 260;
  const padL = 62;
  const padR = 32;
  const padT = 22;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (q) => padL + (q / maxQty) * plotW;
  const toY = (p) => padT + plotH - (p / maxPrice) * plotH;

  const x0 = toX(0);
  const y0 = toY(0);
  const xMax = toX(maxQty);
  const xEq = toX(eqQty);
  const yEq = toY(eqPrice);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
          {diagram.title || 'Marktpreisbildung (Angebot & Nachfrage)'}
        </h4>
        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
          GG: p* = {eqPrice.toLocaleString('de-DE')} · x* = {eqQty.toLocaleString('de-DE')}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <line x1={x0} y1={padT} x2={x0} y2={y0} stroke="#64748b" strokeWidth="1.5" />
        <line x1={x0} y1={y0} x2={xMax} y2={y0} stroke="#64748b" strokeWidth="1.5" />

        {/* Đường Cung (Angebot A) đi lên */}
        <line
          x1={toX(maxQty * 0.08)}
          y1={toY(maxPrice * 0.08)}
          x2={toX(maxQty * 0.92)}
          y2={toY(maxPrice * 0.92)}
          stroke="#10b981"
          strokeWidth="2.5"
        />
        <text x={toX(maxQty * 0.93)} y={toY(maxPrice * 0.92) + 4} fontSize="11" fill="#10b981" fontWeight="800">
          A (Angebot)
        </text>

        {/* Đường Cầu (Nachfrage N) đi xuống */}
        <line
          x1={toX(maxQty * 0.08)}
          y1={toY(maxPrice * 0.92)}
          x2={toX(maxQty * 0.92)}
          y2={toY(maxPrice * 0.08)}
          stroke="#f43f5e"
          strokeWidth="2.5"
        />
        <text x={toX(maxQty * 0.93)} y={toY(maxPrice * 0.08) + 4} fontSize="11" fill="#f43f5e" fontWeight="800">
          N (Nachfrage)
        </text>

        {/* Đường Giá trần / Giá sàn (Mindestpreis / Höchstpreis) nếu có */}
        {priceLine && Number.isFinite(Number(priceLine.value)) && (
          <>
            <line
              x1={x0}
              y1={toY(Number(priceLine.value))}
              x2={xMax}
              y2={toY(Number(priceLine.value))}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <text
              x={xMax - 4}
              y={toY(Number(priceLine.value)) - 6}
              textAnchor="end"
              fontSize="10"
              fill="#d97706"
              fontWeight="800"
            >
              {priceLine.label || 'Preisgrenze'} ({Number(priceLine.value).toLocaleString('de-DE')})
            </text>
          </>
        )}

        {/* Điểm cân bằng (Gleichgewicht GG) */}
        <line x1={xEq} y1={yEq} x2={xEq} y2={y0} stroke="#6366f1" strokeWidth="1.4" strokeDasharray="4 3" />
        <line x1={x0} y1={yEq} x2={xEq} y2={yEq} stroke="#6366f1" strokeWidth="1.4" strokeDasharray="4 3" />
        <circle cx={xEq} cy={yEq} r="5.5" fill="#6366f1" stroke="#ffffff" strokeWidth="2" />
        <text x={xEq + 8} y={yEq - 8} fontSize="11" fill="#6366f1" fontWeight="800">
          GG (Gleichgewicht)
        </text>
        <text x={xEq} y={y0 + 15} textAnchor="middle" fontSize="10" fill="#6366f1" fontWeight="700">
          x* = {eqQty}
        </text>
        <text x={x0 - 6} y={yEq + 4} textAnchor="end" fontSize="10" fill="#6366f1" fontWeight="700">
          p* = {eqPrice}
        </text>

        <text x={xMax} y={y0 + 30} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="700">
          {diagram.xLabel || 'Menge (x)'} →
        </text>
        <text x={x0 - 6} y={padT - 6} textAnchor="end" fontSize="10" fill="#64748b" fontWeight="700">
          {diagram.yLabel || 'Preis (p)'} ↑
        </text>
      </svg>
    </div>
  );
}

export default function DiagramRenderer({ diagram }) {
  if (!diagram || typeof diagram !== 'object' || !diagram.type) return null;

  // 1. Single T-Konto / Bilanz / GuV
  if (diagram.type === 't_konto' || diagram.type === 'bilanz') {
    return (
      <div className="my-3 space-y-2">
        {diagram.title && (
          <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {diagram.title}
          </p>
        )}
        <SingleTKonto
          account={diagram.account || diagram.title || 'Konto'}
          leftHeader={diagram.leftHeader || (diagram.type === 'bilanz' ? 'Aktiva' : 'Soll')}
          rightHeader={diagram.rightHeader || (diagram.type === 'bilanz' ? 'Passiva' : 'Haben')}
          soll={diagram.soll || diagram.aktiva || []}
          haben={diagram.haben || diagram.passiva || []}
          totalLeft={diagram.totalLeft}
          totalRight={diagram.totalRight}
        />
      </div>
    );
  }

  // 2. Multi T-Konto Grid (Hauptbuch: nhiều tài khoản chữ T cùng lúc)
  if (diagram.type === 'multi_t_konto' && Array.isArray(diagram.accounts) && diagram.accounts.length > 0) {
    return (
      <div className="my-3 space-y-2.5">
        {diagram.title && (
          <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {diagram.title}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {diagram.accounts.map((acc, idx) => (
            <SingleTKonto
              key={idx}
              compact
              account={acc.account || `Konto ${idx + 1}`}
              leftHeader={acc.leftHeader || 'Soll'}
              rightHeader={acc.rightHeader || 'Haben'}
              soll={acc.soll || acc.aktiva || []}
              haben={acc.haben || acc.passiva || []}
              totalLeft={acc.totalLeft}
              totalRight={acc.totalRight}
            />
          ))}
        </div>
      </div>
    );
  }

  // 3. Break-even-Point
  if (diagram.type === 'break_even') {
    return (
      <div className="my-3">
        <BreakEvenChart diagram={diagram} />
      </div>
    );
  }

  // 4. Supply & Demand / Preisbildung
  if (diagram.type === 'supply_demand') {
    return (
      <div className="my-3">
        <SupplyDemandChart diagram={diagram} />
      </div>
    );
  }

  // 5. Flow / Process / Netzplan / Geschäftsgang Steps
  if (diagram.type === 'flow' && Array.isArray(diagram.steps) && diagram.steps.length > 0) {
    return (
      <div className="my-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-3">
        {diagram.title && (
          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">{diagram.title}</h4>
        )}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch gap-2.5">
          {diagram.steps.map((st, idx) => (
            <React.Fragment key={idx}>
              <div className="flex-1 min-w-[140px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 space-y-1 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  {st.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {st.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white pt-0.5">{st.title}</p>
                {st.subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{st.subtitle}</p>}
              </div>
              {idx < diagram.steps.length - 1 && (
                <div className="flex items-center justify-center text-indigo-400 font-black text-sm select-none">
                  <span className="hidden sm:inline">→</span>
                  <span className="sm:hidden">↓</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // 6. Bar Chart
  if (diagram.type === 'bar' && Array.isArray(diagram.items) && diagram.items.length > 0) {
    const unit = diagram.unit || '';
    const maxVal = Math.max(...diagram.items.map((it) => Number(it.value) || 0), 1);
    return (
      <div className="my-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        {diagram.title && (
          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">{diagram.title}</h4>
        )}
        <div className="space-y-2.5">
          {diagram.items.map((it, idx) => {
            const val = Number(it.value) || 0;
            const pct = Math.max(4, Math.round((val / maxVal) * 100));
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{it.label}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {val.toLocaleString('de-DE')} {unit}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

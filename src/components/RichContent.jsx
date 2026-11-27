import React from 'react';

// ==================== ZERO-DEPENDENCY LATEX MATH RENDERER ====================
const LATEX_SYMBOLS = {
  cdot: ' · ',
  times: ' × ',
  div: ' ÷ ',
  pm: ' ± ',
  mp: ' ∓ ',
  approx: ' ≈ ',
  neq: ' ≠ ',
  ne: ' ≠ ',
  le: ' ≤ ',
  leq: ' ≤ ',
  ge: ' ≥ ',
  geq: ' ≥ ',
  Rightarrow: ' ⇒ ',
  implies: ' ⇒ ',
  rightarrow: ' → ',
  to: ' → ',
  leftarrow: ' ← ',
  leftrightarrow: ' ↔ ',
  Leftrightarrow: ' ⇔ ',
  iff: ' ⇔ ',
  Delta: 'Δ',
  delta: 'δ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  Sigma: '∑',
  sum: '∑',
  infty: '∞',
  euro: '€',
  '%': '%',
  '{': '{',
  '}': '}',
  '&': '&',
  ',': ' ',
  ';': ' ',
  ':': ' ',
  ' ': ' ',
  quad: '\u00A0\u00A0',
  qquad: '\u00A0\u00A0\u00A0\u00A0',
};

// Danh sách từ tiếng Việt không dấu viết hoa đầu câu (tránh nhận nhầm là danh từ tiếng Đức trong chế độ mixedGerman)
const VN_PLAIN_CAP_WORDS = new Set([
  'Anh', 'Ba', 'Ban', 'Bao', 'Bay', 'Ben', 'Biet', 'Binh', 'Bo', 'Bon', 'Buoc',
  'Cac', 'Cach', 'Can', 'Cao', 'Cau', 'Cham', 'Chan', 'Chay', 'Chi', 'Chia', 'Chinh',
  'Cho', 'Chon', 'Chu', 'Chua', 'Chuan', 'Chuyen', 'Co', 'Con', 'Cong', 'Cua', 'Cung', 'Cuoi',
  'Da', 'Dan', 'Dang', 'Danh', 'Dau', 'Day', 'De', 'Dem', 'Den', 'Di', 'Dich', 'Diem', 'Dieu',
  'Dinh', 'Do', 'Doc', 'Doi', 'Dong', 'Du', 'Dung', 'Duoc', 'Duoi',
  'Em', 'Ghi', 'Gia', 'Giai', 'Giam', 'Gian', 'Giao', 'Giay', 'Giu', 'Giup', 'Goi', 'Gom',
  'Hai', 'Han', 'Hang', 'Hay', 'Het', 'Hien', 'Hieu', 'Hinh', 'Ho', 'Hoa', 'Hoac', 'Hoan', 'Hoc', 'Hoi', 'Hon', 'Hop', 'Huong',
  'It', 'Ke', 'Kem', 'Ket', 'Kha', 'Khac', 'Khach', 'Khai', 'Khi', 'Kho', 'Khoa', 'Khoan', 'Khoang', 'Khong', 'Khu', 'Kiem', 'Kien', 'Kieu', 'Ky',
  'La', 'Lai', 'Lam', 'Lan', 'Lap', 'Lay', 'Len', 'Lich', 'Lien', 'Liet', 'Loai', 'Loi', 'Lon', 'Luat', 'Luc', 'Luong', 'Luu', 'Ly',
  'Ma', 'Mai', 'Man', 'Mat', 'Mau', 'May', 'Meo', 'Mien', 'Minh', 'Mo', 'Moi', 'Mon', 'Mot', 'Mua', 'Muc', 'Muon', 'Muoi',
  'Nam', 'Nang', 'Nao', 'Nay', 'Nen', 'Neu', 'Ngan', 'Nganh', 'Ngay', 'Nghe', 'Nghi', 'Nghia', 'Ngoai', 'Nguoi', 'Nguyen',
  'Nha', 'Nhac', 'Nhan', 'Nhanh', 'Nhap', 'Nhat', 'Nhe', 'Nhieu', 'Nhin', 'Nho', 'Nhom', 'Nhu', 'Nhung',
  'Noi', 'Nop', 'Nuoc', 'Phan', 'Phai', 'Phat', 'Phep', 'Phi', 'Phim', 'Phong', 'Phu', 'Phuong', 'Phut',
  'Qua', 'Quan', 'Quay', 'Quen', 'Quyet', 'Ra', 'Rat', 'Rieng', 'Ro', 'Roi', 'Rut',
  'Sai', 'San', 'Sang', 'Sao', 'Sau', 'Se', 'Sinh', 'So', 'Soi', 'Song', 'Su', 'Sua', 'Suy',
  'Ta', 'Tac', 'Tai', 'Tam', 'Tang', 'Tao', 'Tap', 'Tat', 'Ten', 'Thang', 'Thanh', 'Thap', 'That', 'Thay',
  'The', 'Them', 'Theo', 'Thi', 'Thich', 'Thieu', 'Thoi', 'Thong', 'Thu', 'Thua', 'Thuc', 'Thue', 'Thuong',
  'Tien', 'Tieng', 'Tiep', 'Tieu', 'Tim', 'Tin', 'Tinh', 'To', 'Toan', 'Toi', 'Tom', 'Tong', 'Tot',
  'Tra', 'Trai', 'Trang', 'Tren', 'Trich', 'Trinh', 'Trong', 'Tru', 'Truc', 'Trung', 'Truoc', 'Truong',
  'Tu', 'Tuan', 'Tung', 'Tuong', 'Tuy', 'Va', 'Vai', 'Van', 'Vao', 'Vay', 'Ve', 'Vi', 'Viec', 'Viet', 'Voi', 'Vua', 'Vuot',
  'Xa', 'Xac', 'Xay', 'Xem', 'Xep', 'Xin', 'Xoa', 'Xu', 'Xuat', 'Xung', 'Yeu',
  'Casio', 'Mio', 'Mrd', 'Eur', 'Euro', 'Admin', 'OneNote', 'PDF', 'Note', 'Test', 'Flashcard', 'Flashcards', 'App', 'Web', 'Cloud', 'AI', 'SRS',
]);

function readMathGroup(str, start) {
  let i = start;
  while (i < str.length && str[i] === ' ') i++;
  if (i >= str.length) return { content: '', next: i };

  if (str[i] === '{') {
    let depth = 0;
    const begin = i + 1;
    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
        i += 2;
        continue;
      }
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) {
          return { content: str.slice(begin, i), next: i + 1 };
        }
      }
      i++;
    }
    return { content: str.slice(begin), next: str.length };
  }

  if (str[i] === '\\') {
    let j = i + 1;
    if (j < str.length && /[A-Za-z]/.test(str[j])) {
      while (j < str.length && /[A-Za-z]/.test(str[j])) j++;
    } else if (j < str.length) {
      j++;
    }
    return { content: str.slice(i, j), next: j };
  }

  return { content: str[i], next: i + 1 };
}

function renderMathNodes(expr, keyPrefix = 'm') {
  if (!expr) return null;
  const out = [];
  let i = 0;
  let k = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Grouped braces {...}
    if (ch === '{') {
      const grp = readMathGroup(expr, i);
      out.push(<React.Fragment key={`${keyPrefix}-${k++}`}>{renderMathNodes(grp.content, `${keyPrefix}g${k}`)}</React.Fragment>);
      i = grp.next;
      continue;
    }

    // Subscript _
    if (ch === '_') {
      const grp = readMathGroup(expr, i + 1);
      out.push(
        <sub key={`${keyPrefix}-${k++}`} className="text-[0.72em] leading-none font-sans not-italic ml-[0.5px]">
          {renderMathNodes(grp.content, `${keyPrefix}sub${k}`)}
        </sub>
      );
      i = grp.next;
      continue;
    }

    // Superscript ^
    if (ch === '^') {
      const grp = readMathGroup(expr, i + 1);
      out.push(
        <sup key={`${keyPrefix}-${k++}`} className="text-[0.72em] leading-none font-sans not-italic ml-[0.5px]">
          {renderMathNodes(grp.content, `${keyPrefix}sup${k}`)}
        </sup>
      );
      i = grp.next;
      continue;
    }

    // LaTeX commands \...
    if (ch === '\\') {
      let j = i + 1;
      let cmd = '';
      if (j < expr.length && /[A-Za-z]/.test(expr[j])) {
        while (j < expr.length && /[A-Za-z]/.test(expr[j])) j++;
        cmd = expr.slice(i + 1, j);
      } else if (j < expr.length) {
        cmd = expr[j];
        j++;
      }

      if (cmd === 'left' || cmd === 'right') {
        i = j;
        continue;
      }

      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const num = readMathGroup(expr, j);
        const den = readMathGroup(expr, num.next);
        out.push(
          <span
            key={`${keyPrefix}-${k++}`}
            className="inline-flex flex-col items-center align-middle mx-1.5 leading-tight"
          >
            <span className="px-1.5 pb-0.5 border-b border-current text-[0.92em]">
              {renderMathNodes(num.content, `${keyPrefix}fn${k}`)}
            </span>
            <span className="px-1.5 pt-0.5 text-[0.92em]">
              {renderMathNodes(den.content, `${keyPrefix}fd${k}`)}
            </span>
          </span>
        );
        i = den.next;
        continue;
      }

      if (cmd === 'sqrt') {
        const inner = readMathGroup(expr, j);
        out.push(
          <span key={`${keyPrefix}-${k++}`} className="inline-flex items-baseline mx-0.5">
            <span className="mr-0.5">√</span>
            <span className="border-t border-current px-0.5">
              {renderMathNodes(inner.content, `${keyPrefix}sq${k}`)}
            </span>
          </span>
        );
        i = inner.next;
        continue;
      }

      if (cmd === 'text' || cmd === 'mathrm' || cmd === 'operatorname') {
        const inner = readMathGroup(expr, j);
        out.push(
          <span key={`${keyPrefix}-${k++}`} className="font-sans not-italic">
            {inner.content}
          </span>
        );
        i = inner.next;
        continue;
      }

      if (cmd === 'mathbf' || cmd === 'textbf' || cmd === 'boldsymbol') {
        const inner = readMathGroup(expr, j);
        out.push(
          <strong key={`${keyPrefix}-${k++}`} className="font-bold not-italic text-slate-900 dark:text-white">
            {renderMathNodes(inner.content, `${keyPrefix}bf${k}`)}
          </strong>
        );
        i = inner.next;
        continue;
      }

      if (cmd === 'mathit' || cmd === 'textit') {
        const inner = readMathGroup(expr, j);
        out.push(
          <em key={`${keyPrefix}-${k++}`} className="italic">
            {renderMathNodes(inner.content, `${keyPrefix}it${k}`)}
          </em>
        );
        i = inner.next;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(LATEX_SYMBOLS, cmd)) {
        out.push(<React.Fragment key={`${keyPrefix}-${k++}`}>{LATEX_SYMBOLS[cmd]}</React.Fragment>);
        i = j;
        continue;
      }

      // Unknown command: render cleanly without raw backslash
      out.push(<React.Fragment key={`${keyPrefix}-${k++}`}>{cmd}</React.Fragment>);
      i = j;
      continue;
    }

    // Variable letters (italic math style for short algebraic symbols like p, x, K, k, db)
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z]/.test(expr[j])) j++;
      const word = expr.slice(i, j);
      out.push(
        <span key={`${keyPrefix}-${k++}`} className={word.length <= 3 ? 'font-serif italic' : 'font-sans not-italic'}>
          {word}
        </span>
      );
      i = j;
      continue;
    }

    // Numbers, operators, punctuation, spaces
    let j = i;
    while (j < expr.length && !/[{}_^\\A-Za-z]/.test(expr[j])) j++;
    const rawChunk = expr.slice(i, j).replace(/\s*-\s*/g, (m) => (m.includes(' ') ? ' − ' : '−'));
    out.push(
      <span key={`${keyPrefix}-${k++}`} className="font-sans not-italic">
        {rawChunk}
      </span>
    );
    i = j;
  }

  return out;
}

function MathExpr({ expr, display = false }) {
  const cleaned = String(expr || '').trim();
  if (!cleaned) return null;

  if (display) {
    return (
      <div className="my-2 px-4 py-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 overflow-x-auto text-center text-base sm:text-lg text-slate-900 dark:text-indigo-100">
        <span className="inline-flex items-center flex-wrap justify-center gap-y-1">
          {renderMathNodes(cleaned, 'dm')}
        </span>
      </div>
    );
  }

  const hasFraction = /\\(?:d|t)?frac\b/.test(cleaned);
  return (
    <span
      className={
        hasFraction
          ? 'inline-flex items-center flex-wrap align-middle px-1.5 py-0.5 rounded bg-slate-100/80 dark:bg-slate-800/80 text-slate-900 dark:text-indigo-100 font-medium'
          : 'inline px-1 py-0.5 rounded bg-slate-100/80 dark:bg-slate-800/80 text-slate-900 dark:text-indigo-100 font-medium'
      }
    >
      {renderMathNodes(cleaned, 'im')}
    </span>
  );
}

// ==================== CLICKABLE GERMAN WORD RENDERER (FULL GERMAN + MIXED VIETNAMESE/GERMAN) ====================
function isClickableToken(tok, clickMode) {
  if (!tok || tok.length < 2) return false;
  // Phải là từ thuần chữ cái Đức (không chứa dấu tiếng Việt như ă, â, đ, ê, ô, ơ, ư, sắc, huyền, hỏi, ngã, nặng)
  if (!/^[A-Za-zÄÖÜäöüß]{2,}(?:-[A-Za-zÄÖÜäöüß]+)*$/.test(tok)) return false;

  if (clickMode === 'full') return true;

  // Chế độ 'mixed': chỉ gắn bấm-dịch cho từ/thuật ngữ tiếng Đức lẫn trong câu giải thích tiếng Việt
  if (/[ÄÖÜäöüß]/.test(tok)) return true;
  if (tok.includes('-') && tok.length >= 4) return true;
  if (/^[A-Z]{2,6}$/.test(tok) && !VN_PLAIN_CAP_WORDS.has(tok)) return true; // BGB, KSVG, GEMA, USt, GuV...
  if (/^[A-Z][a-z]{2,}$/.test(tok) && !VN_PLAIN_CAP_WORDS.has(tok)) return true; // Dreisatz, Verwerter, Vertrag...
  if (tok.length >= 7) return true; // động từ/tính từ tiếng Đức dài như verpflichtet, berechnen, mittels...
  return false;
}

function renderClickablePlainText(text, clickMode, onWordClick, contextText, keyPrefix = 'w') {
  if (!text) return null;
  if (!clickMode || !onWordClick) return text;

  // Dùng Unicode letter (\p{L}) để KHÔNG BAO GIỜ cắt vụn từ có dấu tiếng Việt như "Phương", "Điểm", "Tính"
  const tokens = text.split(/([\p{L}]+(?:-[\p{L}]+)*)/gu);
  return tokens.map((tok, tIdx) => {
    if (!isClickableToken(tok, clickMode)) {
      return <React.Fragment key={`${keyPrefix}-${tIdx}`}>{tok}</React.Fragment>;
    }
    return (
      <span
        key={`${keyPrefix}-${tIdx}`}
        data-word-token="true"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onWordClick(tok, contextText || text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onWordClick(tok, contextText || text);
          }
        }}
        className="cursor-pointer rounded px-0.5 -mx-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 hover:text-indigo-800 dark:hover:text-indigo-200 underline decoration-dotted decoration-indigo-300 dark:decoration-indigo-700 underline-offset-4 transition-colors"
        title={`Bấm để dịch từ "${tok}"`}
      >
        {tok}
      </span>
    );
  });
}

// ==================== RECURSIVE INLINE PARSER (MATH + CODE + BOLD + ITALIC + CLICKABLE WORDS) ====================
function findClosingDollar(str, startIdx) {
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      i++;
      continue;
    }
    if (str[i] === '$') {
      if (str[i + 1] === '$') return -1;
      if (i > startIdx && str[i - 1] !== ' ') return i;
      return -1;
    }
  }
  return -1;
}

function renderClickableInline(text, clickMode, onWordClick, contextText, keyPrefix = 'in') {
  if (!text) return null;
  const nodes = [];
  let plainBuf = '';
  let i = 0;
  let k = 0;

  const flushPlain = () => {
    if (!plainBuf) return;
    nodes.push(
      <React.Fragment key={`${keyPrefix}-p${k++}`}>
        {renderClickablePlainText(plainBuf, clickMode, onWordClick, contextText || text, `${keyPrefix}w${k}`)}
      </React.Fragment>
    );
    plainBuf = '';
  };

  while (i < text.length) {
    // 1. Inline display math $$...$$
    if (text[i] === '$' && text[i + 1] === '$') {
      const closeIdx = text.indexOf('$$', i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        flushPlain();
        nodes.push(<MathExpr key={`${keyPrefix}-dm${k++}`} expr={text.slice(i + 2, closeIdx)} display />);
        i = closeIdx + 2;
        continue;
      }
    }

    // 2. Inline math $...$
    if (text[i] === '$' && text[i + 1] !== '$' && text[i + 1] !== ' ' && i + 1 < text.length) {
      const closeIdx = findClosingDollar(text, i + 1);
      if (closeIdx !== -1) {
        const inner = text.slice(i + 1, closeIdx);
        const looksLikeCurrencyPair = /^\d[\d.,]*\s+[A-Za-z]/.test(inner) && !/[=+\-*\/\\^_€]/.test(inner);
        if (!looksLikeCurrencyPair) {
          flushPlain();
          nodes.push(<MathExpr key={`${keyPrefix}-im${k++}`} expr={inner} />);
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // 3. Inline LaTeX \(...\)
    if (text[i] === '\\' && text[i + 1] === '(') {
      const closeIdx = text.indexOf('\\)', i + 2);
      if (closeIdx !== -1) {
        flushPlain();
        nodes.push(<MathExpr key={`${keyPrefix}-lm${k++}`} expr={text.slice(i + 2, closeIdx)} />);
        i = closeIdx + 2;
        continue;
      }
    }

    // 4. Inline code / Casio keystrokes `...`
    if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        flushPlain();
        nodes.push(
          <code
            key={`${keyPrefix}-c${k++}`}
            className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[0.86em] font-semibold text-indigo-700 dark:text-indigo-300"
          >
            {text.slice(i + 1, closeIdx)}
          </code>
        );
        i = closeIdx + 1;
        continue;
      }
    }

    // 5. Bold **...**
    if (text[i] === '*' && text[i + 1] === '*') {
      const closeIdx = text.indexOf('**', i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        flushPlain();
        const inner = text.slice(i + 2, closeIdx);
        nodes.push(
          <strong key={`${keyPrefix}-b${k++}`} className="font-bold text-slate-900 dark:text-white">
            {renderClickableInline(inner, clickMode, onWordClick, contextText || text, `${keyPrefix}b${k}`)}
          </strong>
        );
        i = closeIdx + 2;
        continue;
      }
    }

    // 6. Italic *...* (must not be followed by space or another *)
    if (text[i] === '*' && text[i + 1] !== '*' && text[i + 1] !== ' ' && i + 1 < text.length) {
      let closeIdx = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '*' && text[j - 1] !== ' ' && text[j + 1] !== '*' && text[j - 1] !== '*') {
          closeIdx = j;
          break;
        }
      }
      if (closeIdx !== -1) {
        flushPlain();
        const inner = text.slice(i + 1, closeIdx);
        nodes.push(
          <em key={`${keyPrefix}-em${k++}`} className="italic text-slate-600 dark:text-slate-300">
            {renderClickableInline(inner, clickMode, onWordClick, contextText || text, `${keyPrefix}em${k}`)}
          </em>
        );
        i = closeIdx + 1;
        continue;
      }
    }

    plainBuf += text[i];
    i++;
  }

  flushPlain();
  return nodes;
}

// ==================== TEXT NORMALIZER (CHỮA GẠCH ĐẦU DÒNG BỊ DÍNH 1 HÀNG TRONG NHẬN XÉT AI) ====================
function normalizeMarkdownText(raw) {
  let s = String(raw || '').replace(/\r\n/g, '\n');
  // Tách các gạch đầu dòng bị AI viết dính trên cùng 1 hàng (VD: "Nhận xét: * **Điểm...** ... . * **Chỗ làm đúng...**")
  s = s.replace(/([:.!?])\s+\*\s+(?=\*\*)/g, '$1\n- ');
  s = s.replace(/^\s*\*\s+(?=\*\*)/gm, '- ');
  // Tách $$...$$ có dấu chấm ngay sau thành khối sạch không bị rớt dấu chấm mồ côi sang dòng mới
  s = s.replace(/\$\$\s*\.\s*\n/g, '$$\n');
  return s;
}

// ==================== BLOCK PARSERS (TABLES, HEADINGS, MATH, LISTS, QUOTES) ====================
function parseTableBlock(lines) {
  const rows = lines
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > 0);

  if (rows.length < 2) return null;
  const isSeparator = rows[1].every((c) => /^:?-+:?$/.test(c));
  const headers = rows[0];
  const bodyRows = isSeparator ? rows.slice(2) : rows.slice(1);
  return { headers, bodyRows };
}

export default function RichContent({
  text,
  isGerman = false,
  mixedGerman = false,
  dictMode = false,
  onWordClick = null,
  className = '',
}) {
  if (!text) return null;

  const normalized = normalizeMarkdownText(text);
  const lines = normalized.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Display Math block: $$...$$ (single-line or multi-line, cho phép dấu chấm/phẩy cuối dòng)
    if (trimmed.startsWith('$$')) {
      const strippedEnd = trimmed.replace(/[.,;]+$/, '');
      if (strippedEnd.length > 4 && strippedEnd.endsWith('$$')) {
        blocks.push({ type: 'math', expr: strippedEnd.slice(2, -2).trim() });
        i++;
        continue;
      }
      const mathLines = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const cur = lines[i].trim().replace(/[.,;]+$/, '');
        if (cur.endsWith('$$')) {
          mathLines.push(cur.slice(0, -2));
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'math', expr: mathLines.join(' ').trim() });
      continue;
    }

    // Display Math block: \[ ... \]
    if (trimmed.startsWith('\\[')) {
      const strippedEnd = trimmed.replace(/[.,;]+$/, '');
      if (strippedEnd.endsWith('\\]') && strippedEnd.length > 4) {
        blocks.push({ type: 'math', expr: strippedEnd.slice(2, -2).trim() });
        i++;
        continue;
      }
      const mathLines = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const cur = lines[i].trim().replace(/[.,;]+$/, '');
        if (cur.endsWith('\\]')) {
          mathLines.push(cur.slice(0, -2));
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'math', expr: mathLines.join(' ').trim() });
      continue;
    }

    // Horizontal rule (--- or ***)
    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ''))) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Markdown Heading (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    // Markdown table block
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseTableBlock(tableLines);
      if (parsed) {
        blocks.push({ type: 'table', data: parsed });
        continue;
      }
    }

    // Bullet list (- , • , * )
    if (/^\s*[-•*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Numbered item (1. ..., 2. ...)
    const numMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (numMatch) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(\d+)\.\s+(.+)$/);
        if (!m) break;
        items.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    // Regular paragraph line (bỏ dấu chấm dư đầu dòng nếu AI lỡ dính sau công thức)
    const cleanParagraph = trimmed.startsWith('. ') && trimmed.length > 3 ? trimmed.slice(2) : line;
    blocks.push({ type: 'paragraph', text: cleanParagraph });
    i++;
  }

  const clickMode = dictMode && Boolean(onWordClick) ? (isGerman ? 'full' : mixedGerman ? 'mixed' : null) : null;

  return (
    <div className={`space-y-2.5 ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'math') {
          return <MathExpr key={bIdx} expr={block.expr} display />;
        }

        if (block.type === 'hr') {
          return <hr key={bIdx} className="border-slate-200 dark:border-slate-700 my-2" />;
        }

        if (block.type === 'heading') {
          const sizeCls =
            block.level <= 2
              ? 'text-base sm:text-lg font-extrabold text-slate-900 dark:text-white pt-1'
              : 'text-sm sm:text-base font-extrabold text-indigo-700 dark:text-indigo-300 pt-1';
          return (
            <h3 key={bIdx} className={`${sizeCls} leading-snug`}>
              {renderClickableInline(block.text, clickMode, onWordClick, block.text, `h${bIdx}`)}
            </h3>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={bIdx}
              className="border-l-4 border-amber-400 bg-amber-50/60 dark:bg-amber-950/30 rounded-r-xl px-3.5 py-2.5 text-xs sm:text-sm space-y-1"
            >
              {block.lines.map((ql, qIdx) => (
                <p key={qIdx} className="leading-relaxed">
                  {renderClickableInline(ql, clickMode, onWordClick, ql, `q${bIdx}-${qIdx}`)}
                </p>
              ))}
            </blockquote>
          );
        }

        if (block.type === 'table') {
          return (
            <div
              key={bIdx}
              className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 my-2"
            >
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    {block.data.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-slate-100">
                        {renderClickableInline(h, clickMode, onWordClick, text, `th${bIdx}-${hIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/60">
                  {block.data.bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200 align-top">
                          {renderClickableInline(cell, clickMode, onWordClick, text, `td${bIdx}-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={bIdx} className="list-disc pl-5 space-y-1.5">
              {block.items.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {renderClickableInline(item, clickMode, onWordClick, item, `li${bIdx}-${idx}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered') {
          return (
            <div key={bIdx} className="space-y-1.5">
              {block.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 min-w-[1.35rem]">
                    {item.num}.
                  </span>
                  <div className="flex-1 min-w-0">
                    {renderClickableInline(item.text, clickMode, onWordClick, item.text, `ol${bIdx}-${idx}`)}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        return (
          <p key={bIdx} className="leading-relaxed">
            {renderClickableInline(block.text, clickMode, onWordClick, block.text, `p${bIdx}`)}
          </p>
        );
      })}
    </div>
  );
}

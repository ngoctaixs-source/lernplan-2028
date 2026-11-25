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

// ==================== CLICKABLE GERMAN WORD RENDERER ====================
function renderClickablePlainText(text, dictMode, onWordClick, contextText, keyPrefix = 'w') {
  if (!text) return null;
  if (!dictMode || !onWordClick) return text;

  // Tokenize into German word tokens (including Umlauts & ß & hyphenated compounds) vs separators
  const tokens = text.split(/([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*)/g);
  return tokens.map((tok, tIdx) => {
    const isGermanWord = /^[A-Za-zÄÖÜäöüß]{2,}(?:-[A-Za-zÄÖÜäöüß]+)*$/.test(tok);
    if (!isGermanWord) {
      return <React.Fragment key={`${keyPrefix}-${tIdx}`}>{tok}</React.Fragment>;
    }
    return (
      <span
        key={`${keyPrefix}-${tIdx}`}
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
      // Avoid matching $$ as single $
      if (str[i + 1] === '$') return -1;
      // Closing $ must not be preceded by whitespace
      if (i > startIdx && str[i - 1] !== ' ') return i;
      return -1;
    }
  }
  return -1;
}

function renderClickableInline(text, dictMode, onWordClick, contextText, keyPrefix = 'in') {
  if (!text) return null;
  const nodes = [];
  let plainBuf = '';
  let i = 0;
  let k = 0;

  const flushPlain = () => {
    if (!plainBuf) return;
    nodes.push(
      <React.Fragment key={`${keyPrefix}-p${k++}`}>
        {renderClickablePlainText(plainBuf, dictMode, onWordClick, contextText || text, `${keyPrefix}w${k}`)}
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
        // Guard against stray currency pairs unless math-like
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
            {renderClickableInline(inner, dictMode, onWordClick, contextText || text, `${keyPrefix}b${k}`)}
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
            {renderClickableInline(inner, dictMode, onWordClick, contextText || text, `${keyPrefix}em${k}`)}
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
  dictMode = false,
  onWordClick = null,
  className = '',
}) {
  if (!text) return null;

  const lines = String(text).split('\n');
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

    // Display Math block: $$...$$ (single-line or multi-line)
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        blocks.push({ type: 'math', expr: trimmed.slice(2, -2).trim() });
        i++;
        continue;
      }
      const mathLines = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const cur = lines[i].trim();
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
      if (trimmed.endsWith('\\]') && trimmed.length > 4) {
        blocks.push({ type: 'math', expr: trimmed.slice(2, -2).trim() });
        i++;
        continue;
      }
      const mathLines = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const cur = lines[i].trim();
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

    // Numbered item (1. ..., 2. ...) — keeps exact original number even when separated by formulas
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

    // Regular paragraph line
    blocks.push({ type: 'paragraph', text: line });
    i++;
  }

  const enableClick = isGerman && dictMode && Boolean(onWordClick);

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
              {renderClickableInline(block.text, enableClick, onWordClick, block.text, `h${bIdx}`)}
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
                  {renderClickableInline(ql, enableClick, onWordClick, ql, `q${bIdx}-${qIdx}`)}
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
                        {renderClickableInline(h, enableClick, onWordClick, text, `th${bIdx}-${hIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/60">
                  {block.data.bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200 align-top">
                          {renderClickableInline(cell, enableClick, onWordClick, text, `td${bIdx}-${rIdx}-${cIdx}`)}
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
                  {renderClickableInline(item, enableClick, onWordClick, item, `li${bIdx}-${idx}`)}
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
                    {renderClickableInline(item.text, enableClick, onWordClick, item.text, `ol${bIdx}-${idx}`)}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        return (
          <p key={bIdx} className="leading-relaxed">
            {renderClickableInline(block.text, enableClick, onWordClick, block.text, `p${bIdx}`)}
          </p>
        );
      })}
    </div>
  );
}

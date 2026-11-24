import React from 'react';

// Render clickable German words inside inline text (preserving punctuation & **bold**)
function renderClickableInline(text, dictMode, onWordClick, contextText) {
  if (!text) return null;
  const boldSegments = text.split(/(\*\*[^*]+\*\*)/g);

  return boldSegments.map((seg, sIdx) => {
    const isBold = seg.startsWith('**') && seg.endsWith('**') && seg.length > 4;
    const inner = isBold ? seg.slice(2, -2) : seg;

    if (!dictMode || !onWordClick) {
      return isBold ? (
        <strong key={sIdx} className="font-bold text-slate-900 dark:text-white">
          {inner}
        </strong>
      ) : (
        <React.Fragment key={sIdx}>{inner}</React.Fragment>
      );
    }

    // Tokenize into German word tokens (including Umlauts & ß & hyphenated compounds) vs separators
    const tokens = inner.split(/([A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*)/g);
    const renderedTokens = tokens.map((tok, tIdx) => {
      const isGermanWord = /^[A-Za-zÄÖÜäöüß]{2,}(?:-[A-Za-zÄÖÜäöüß]+)*$/.test(tok);
      if (!isGermanWord) {
        return <React.Fragment key={tIdx}>{tok}</React.Fragment>;
      }
      return (
        <span
          key={tIdx}
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

    return isBold ? (
      <strong key={sIdx} className="font-bold text-slate-900 dark:text-white">
        {renderedTokens}
      </strong>
    ) : (
      <React.Fragment key={sIdx}>{renderedTokens}</React.Fragment>
    );
  });
}

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

    // Detect Markdown table block
    if (line.trim().startsWith('|') && line.includes('|', 1)) {
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

    // Detect bullet list
    if (/^\s*[-•*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
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
                        {renderClickableInline(h, enableClick, onWordClick, text)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/60">
                  {block.data.bodyRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200 align-top">
                          {renderClickableInline(cell, enableClick, onWordClick, text)}
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
                  {renderClickableInline(item, enableClick, onWordClick, item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={bIdx} className="leading-relaxed">
            {renderClickableInline(block.text, enableClick, onWordClick, block.text)}
          </p>
        );
      })}
    </div>
  );
}

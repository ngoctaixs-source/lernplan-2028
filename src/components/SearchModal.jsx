import React, { useState, useMemo } from 'react';
import { Search, X, BookOpen, BookMarked, Layers, ChevronRight } from 'lucide-react';

export default function SearchModal({
  subjects,
  lessons,
  sections,
  vocabularies,
  flashcards,
  onClose,
  onOpenLesson,
  onGoToVocab,
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;

    const matchedLessons = lessons
      .filter(
        (l) =>
          (l.title_de || '').toLowerCase().includes(q) ||
          (l.title_vn || '').toLowerCase().includes(q) ||
          (l.overview_de || '').toLowerCase().includes(q)
      )
      .slice(0, 6);

    const matchedSections = sections
      .filter(
        (s) =>
          (s.heading_de || '').toLowerCase().includes(q) ||
          (s.content_de || '').toLowerCase().includes(q) ||
          (s.content_vn || '').toLowerCase().includes(q)
      )
      .slice(0, 8);

    const matchedVocab = vocabularies
      .filter(
        (v) =>
          (v.word_de || '').toLowerCase().includes(q) ||
          (v.meaning_vn || '').toLowerCase().includes(q)
      )
      .slice(0, 8);

    const matchedCards = flashcards
      .filter(
        (c) =>
          (c.front_de || '').toLowerCase().includes(q) ||
          (c.back_de || '').toLowerCase().includes(q) ||
          (c.back_vn || '').toLowerCase().includes(q)
      )
      .slice(0, 6);

    return { matchedLessons, matchedSections, matchedVocab, matchedCards };
  }, [query, lessons, sections, vocabularies, flashcards]);

  const lessonMap = useMemo(() => {
    const m = {};
    lessons.forEach((l) => (m[l.id] = l));
    return m;
  }, [lessons]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 backdrop-blur-sm p-4 pt-12 sm:pt-20 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhanh điều luật (§ 631, § 145), thuật ngữ (GEMA, Break-even), từ vựng..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
          />
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-5">
          {!results ? (
            <p className="text-xs text-center text-slate-400 py-8">
              Gõ ít nhất 2 ký tự (VD: <code>§ 631</code>, <code>Break-even</code>, <code>GEMA</code>, <code>Abnahme</code>...)
            </p>
          ) : results.matchedLessons.length === 0 &&
            results.matchedSections.length === 0 &&
            results.matchedVocab.length === 0 &&
            results.matchedCards.length === 0 ? (
            <p className="text-sm text-center text-slate-500 py-8">Không tìm thấy kết quả nào cho “{query}”.</p>
          ) : (
            <>
              {results.matchedLessons.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Bài học ({results.matchedLessons.length})
                  </p>
                  {results.matchedLessons.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        onOpenLesson(l.id);
                        onClose();
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center justify-between gap-2 transition"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{l.title_de}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{l.title_vn}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.matchedSections.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Nội dung trong bài ({results.matchedSections.length})
                  </p>
                  {results.matchedSections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onOpenLesson(s.lesson_id);
                        onClose();
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition space-y-0.5"
                    >
                      <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{s.heading_de}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{s.content_de}</p>
                      <p className="text-[11px] text-slate-400">Thuộc bài: {lessonMap[s.lesson_id]?.title_de}</p>
                    </button>
                  ))}
                </div>
              )}

              {results.matchedVocab.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookMarked className="w-3.5 h-3.5" /> Từ vựng ({results.matchedVocab.length})
                  </p>
                  {results.matchedVocab.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        onGoToVocab();
                        onClose();
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center justify-between gap-2 transition"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {v.article ? `${v.article} ` : ''}
                          {v.word_de} <span className="text-xs font-normal text-slate-400">({v.word_type})</span>
                        </p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400">{v.meaning_vn}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.matchedCards.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Flashcards ({results.matchedCards.length})
                  </p>
                  {results.matchedCards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onOpenLesson(c.lesson_id, 'cards');
                        onClose();
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
                    >
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{c.front_de}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{c.back_vn}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

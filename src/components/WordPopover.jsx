import React from 'react';
import { X, Volume2, Loader2, BookmarkPlus, Check, AlertCircle } from 'lucide-react';
import { speakGerman } from '../lib/tts';
import { ARTICLE_STYLE } from '../lib/seedData';

export default function WordPopover({
  lookupState, // { word, loading, data, error, saved }
  ttsRate,
  isAdmin,
  canSaveToLesson,
  onClose,
  onSaveToVocab,
}) {
  if (!lookupState) return null;

  const { word, loading, data, error, saved } = lookupState;
  const articleKey = (data?.article || '').toLowerCase();
  const articleClass = ARTICLE_STYLE[articleKey] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-lg">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-indigo-500/40 dark:border-indigo-500/50 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-50/80 dark:bg-indigo-950/60 border-b border-indigo-100 dark:border-indigo-900">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Từ điển nhanh DE → VN
            </span>
            {data?.word_type && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {data.word_type}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="py-5 flex items-center justify-center gap-2.5 text-sm text-indigo-700 dark:text-indigo-300 font-medium">
              <Loader2 className="w-5 h-5 animate-spin" />
              Đang tra từ “{word}” theo ngữ cảnh...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {data.article && (
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-extrabold border ${articleClass}`}>
                        {data.article}
                      </span>
                    )}
                    <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {data.lemma_de || word}
                    </h4>
                    {data.plural && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        (Pl.: {data.plural})
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    {data.meaning_vn}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    speakGerman(data.article ? `${data.article} ${data.lemma_de}` : data.lemma_de || word, ttsRate)
                  }
                  className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 transition shrink-0"
                  title="Nghe phát âm tiếng Đức"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              {data.grammar_note_vn && (
                <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2">
                  <strong>Ngữ pháp:</strong> {data.grammar_note_vn}
                </p>
              )}

              {(data.example_de || data.example_vn) && (
                <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl px-3.5 py-2.5 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{data.example_de}</p>
                    {data.example_de && (
                      <button
                        type="button"
                        onClick={() => speakGerman(data.example_de, ttsRate)}
                        className="text-slate-400 hover:text-indigo-600 shrink-0"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {data.example_vn && (
                    <p className="text-slate-500 dark:text-slate-400 italic">{data.example_vn}</p>
                  )}
                </div>
              )}

              {isAdmin && canSaveToLesson && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    disabled={saved}
                    onClick={() => onSaveToVocab?.(data)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                      saved
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {saved ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Đã lưu vào mục Từ vựng
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" /> Lưu vào Từ vựng bài này
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, BarChart3, Volume2, RotateCcw, Award } from 'lucide-react';
import { speakGerman } from '../lib/tts';
import RichContent from './RichContent';

export default function MistakesAnalyticsView({
  wrongQuestions,
  subjects,
  lessons,
  flashcards,
  progressMap,
  quizAttempts,
  showVn,
  ttsRate,
  dictMode,
  onWordClick,
  onToggleResolveMistake,
  onOpenLesson,
}) {
  const activeMistakes = wrongQuestions.filter((m) => !m.resolved);
  const resolvedMistakes = wrongQuestions.filter((m) => m.resolved);

  // Per-subject strength analytics
  const subjectStats = useMemo(() => {
    return subjects
      .map((s) => {
        const subLessonIds = new Set(lessons.filter((l) => l.subject_id === s.id).map((l) => l.id));
        const subCards = flashcards.filter((c) => c.subject_id === s.id);
        const mastered = subCards.filter((c) => progressMap[c.id]?.status === 'mastered').length;
        const cardPct = subCards.length ? Math.round((mastered / subCards.length) * 100) : 0;

        const subAttempts = quizAttempts.filter((a) => subLessonIds.has(a.lesson_id));
        const avgQuiz = subAttempts.length
          ? Math.round(subAttempts.reduce((acc, a) => acc + Number(a.score_percent || 0), 0) / subAttempts.length)
          : null;

        const subMistakes = activeMistakes.filter((m) => m.subject_id === s.id).length;

        // Overall readiness score (0-100)
        const readiness = avgQuiz !== null ? Math.round((cardPct + avgQuiz) / 2) : cardPct;
        return { subject: s, cardPct, mastered, totalCards: subCards.length, avgQuiz, subMistakes, readiness };
      })
      .sort((a, b) => a.readiness - b.readiness); // Weakest first!
  }, [subjects, lessons, flashcards, progressMap, quizAttempts, activeMistakes]);

  return (
    <div className="space-y-6">
      {/* Analytics Section: Weakest Subjects First */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Thống kê độ vững kiến thức theo môn (Môn yếu xếp trên)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tự động tổng hợp từ tỷ lệ thuộc Flashcard SRS và điểm Bài Test từng môn để biết cần ưu tiên cày môn nào trước.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {subjectStats.map((st) => {
            const barColor =
              st.readiness >= 75 ? 'bg-emerald-500' : st.readiness >= 45 ? 'bg-amber-500' : 'bg-rose-500';
            return (
              <div
                key={st.subject.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{st.subject.title_de}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{st.subject.title_vn}</p>
                  </div>
                  <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">{st.readiness}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${st.readiness}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Flashcard: {st.mastered}/{st.totalCards} ({st.cardPct}%)</span>
                  <span>Test TB: {st.avgQuiz !== null ? `${st.avgQuiz}%` : 'Chưa thi'}</span>
                  <span className={st.subMistakes > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                    Câu sai: {st.subMistakes}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mistake Bank */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            Kho câu từng làm sai ({activeMistakes.length} câu cần ôn lại)
          </h2>
          {resolvedMistakes.length > 0 && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Đã khắc phục: {resolvedMistakes.length} câu
            </span>
          )}
        </div>

        {activeMistakes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
            <Award className="w-12 h-12 text-emerald-500 mx-auto" />
            <p className="text-base font-bold text-slate-900 dark:text-white">Kho câu sai đang trống sạch!</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mỗi khi bạn làm sai câu trắc nghiệm hoặc tự luận dưới 70% trong Bài Test / Phòng thi thử, câu đó sẽ tự động được gom về đây để ôn dồn trước kỳ thi.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeMistakes.map((m) => {
              const q = m.question_snapshot || {};
              return (
                <div
                  key={m.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60 p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                          {q.q_type === 'mc' ? 'Trắc nghiệm sai' : 'Tự luận < 70%'}
                        </span>
                        {m.lesson_id && onOpenLesson && (
                          <button
                            onClick={() => onOpenLesson(m.lesson_id)}
                            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Mở lại bài học gốc →
                          </button>
                        )}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        <RichContent text={q.question_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                      </div>
                      {showVn && q.question_vn && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{q.question_vn}</p>
                      )}
                    </div>
                    <button
                      onClick={() => speakGerman(q.question_de, ttsRate)}
                      className="p-2 text-slate-400 hover:text-indigo-600 shrink-0"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-3 border border-rose-100 dark:border-rose-900">
                      <p className="font-bold text-rose-700 dark:text-rose-300 mb-1">Lần trước bạn trả lời:</p>
                      <p className="text-slate-800 dark:text-slate-200">{m.user_answer || '(Bỏ trống)'}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900">
                      <p className="font-bold text-emerald-700 dark:text-emerald-300 mb-1">Đáp án chuẩn IHK:</p>
                      <p className="text-slate-800 dark:text-slate-200">
                        {q.q_type === 'mc'
                          ? q.options?.[q.correct_index]?.de || ''
                          : q.model_answer_de || ''}
                      </p>
                    </div>
                  </div>

                  {m.feedback_vn && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 rounded-xl">
                      <strong>Ghi chú sửa lỗi:</strong> {m.feedback_vn}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => onToggleResolveMistake?.(m.id, true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đánh dấu đã hiểu & thuộc câu này
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {resolvedMistakes.length > 0 && (
          <details className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <summary className="text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
              Xem {resolvedMistakes.length} câu sai đã khắc phục
            </summary>
            <div className="mt-3 space-y-2">
              {resolvedMistakes.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs py-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400 truncate">{m.question_snapshot?.question_de}</span>
                  <button
                    onClick={() => onToggleResolveMistake?.(m.id, false)}
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" /> Đưa lại vào kho ôn
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

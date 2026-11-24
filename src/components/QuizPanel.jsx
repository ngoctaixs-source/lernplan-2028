import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Volume2,
  Loader2,
  Award,
  RotateCcw,
  Send,
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';
import { speakGerman } from '../lib/tts';
import { calcIhkGrade } from '../lib/seedData';

export default function QuizPanel({
  questions,
  showVn,
  ttsRate,
  isAdmin,
  onSaveAttempt,
  onGenerateNewQuiz,
}) {
  const [mcAnswers, setMcAnswers] = useState({});
  const [essayAnswers, setEssayAnswers] = useState({});
  const [grading, setGrading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setGrading(true);
    try {
      const mcQuestions = questions.filter((q) => q.q_type === 'mc');
      const essayQuestions = questions.filter((q) => q.q_type === 'essay');

      let totalPoints = 0;
      const mcFeedback = {};

      mcQuestions.forEach((q) => {
        const chosen = mcAnswers[q.id];
        const isCorrect = chosen === q.correct_index;
        if (isCorrect) totalPoints += 100;
        mcFeedback[q.id] = { isCorrect, chosen };
      });

      const essayFeedback = {};
      if (essayQuestions.length > 0) {
        const essaysToGrade = essayQuestions.map((q) => ({
          question_id: q.id,
          question_de: q.question_de,
          model_answer_de: q.model_answer_de,
          user_answer: (essayAnswers[q.id] || '').trim() || '(Keine Antwort abgegeben)',
        }));

        try {
          const graded = await callGeminiApi('grade_quiz', { essays: essaysToGrade });
          (graded?.results || []).forEach((item) => {
            essayFeedback[item.question_id] = item;
            totalPoints += Number(item.score || 0);
          });
        } catch (aiErr) {
          // Fallback if offline / AI error: show model answer cleanly
          setError(`Không chấm tự động phần tự luận bằng AI được (${aiErr.message}). Đã hiển thị đáp án mẫu IHK để bạn tự đối chiếu.`);
          essayQuestions.forEach((q) => {
            const hasAns = Boolean((essayAnswers[q.id] || '').trim());
            const fallbackScore = hasAns ? 50 : 0;
            totalPoints += fallbackScore;
            essayFeedback[q.id] = {
              question_id: q.id,
              score: fallbackScore,
              feedback_de: hasAns
                ? 'Bitte vergleichen Sie Ihre Antwort direkt mit der IHK-Musterlösung.'
                : 'Sie haben keine Antwort eingegeben.',
              feedback_vn: hasAns
                ? 'Hãy đối chiếu trực tiếp câu trả lời của bạn với bài mẫu IHK bên dưới.'
                : 'Bạn chưa nhập câu trả lời cho câu tự luận này.',
              musterloesung_de: q.model_answer_de,
              musterloesung_vn: q.model_answer_vn,
            };
          });
        }
      }

      const finalPercent = questions.length > 0 ? Math.round(totalPoints / questions.length) : 0;
      const finalResult = {
        percent: finalPercent,
        grade: calcIhkGrade(finalPercent),
        mcFeedback,
        essayFeedback,
      };
      setResult(finalResult);
      onSaveAttempt?.(finalPercent, finalResult);
    } finally {
      setGrading(false);
    }
  };

  const handleReset = () => {
    setMcAnswers({});
    setEssayAnswers({});
    setResult(null);
    setError('');
  };

  const handleGenerate = async () => {
    if (!onGenerateNewQuiz) return;
    setGenerating(true);
    setError('');
    try {
      await onGenerateNewQuiz();
      handleReset();
    } catch (err) {
      setError(err.message || 'Không tạo được đề mới.');
    } finally {
      setGenerating(false);
    }
  };

  if (!questions.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
        <p className="text-slate-600 text-sm">Bài học này chưa có câu hỏi kiểm tra.</p>
        {isAdmin && onGenerateNewQuiz && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Tạo bộ đề IHK bằng AI
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Bài kiểm tra tổng hợp ({questions.length} câu — Trắc nghiệm & Tự luận tình huống)
          </h3>
          <p className="text-xs text-slate-500">
            Với câu tự luận, bạn có thể trả lời bằng tiếng Đức (khuyên dùng để luyện thi IHK) hoặc tiếng Việt/song ngữ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Làm lại
            </button>
          )}
          {isAdmin && onGenerateNewQuiz && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Tạo đề mới bằng AI
            </button>
          )}
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center shrink-0">
              <span className="text-xl font-extrabold leading-none">{result.percent}%</span>
              <span className="text-[10px] text-indigo-200 font-semibold mt-0.5">ĐIỂM SỐ</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Award className="w-5 h-5 text-indigo-600" />
                <span className="text-base font-bold text-slate-900">Kết quả chấm điểm chuẩn IHK</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${result.grade.color}`}>
                  IHK-Note: {result.grade.note}
                </span>
                <span className="text-xs text-slate-500">
                  Xem chi tiết sửa lỗi và Musterlösung ở từng câu bên dưới
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
          >
            Thử làm lại đề này
          </button>
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Question Cards */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isMc = q.q_type === 'mc';
          const mcState = result?.mcFeedback?.[q.id];
          const essayState = result?.essayFeedback?.[q.id];

          return (
            <div key={q.id} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white">
                      Câu {idx + 1}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isMc ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isMc ? 'Trắc nghiệm (Multiple Choice)' : 'Tự luận tình huống (Praxisfall)'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-slate-900 leading-relaxed">{q.question_de}</p>
                  {showVn && q.question_vn && (
                    <p className="text-sm text-slate-600 bg-slate-50 border-l-2 border-indigo-400 px-3.5 py-2 rounded-r-lg">
                      {q.question_vn}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => speakGerman(q.question_de, ttsRate)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition shrink-0"
                  title="Nghe câu hỏi tiếng Đức"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* MULTIPLE CHOICE */}
              {isMc ? (
                <div className="space-y-2.5">
                  {(q.options || []).map((opt, oIdx) => {
                    const selected = mcAnswers[q.id] === oIdx;
                    let cardStyle = 'border-slate-200 hover:border-indigo-300 bg-white';
                    if (result) {
                      if (oIdx === q.correct_index) {
                        cardStyle = 'border-emerald-500 bg-emerald-50/70';
                      } else if (selected && oIdx !== q.correct_index) {
                        cardStyle = 'border-rose-400 bg-rose-50/70';
                      } else {
                        cardStyle = 'border-slate-200 bg-slate-50/50 opacity-70';
                      }
                    } else if (selected) {
                      cardStyle = 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600';
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={Boolean(result)}
                        onClick={() => setMcAnswers({ ...mcAnswers, [q.id]: oIdx })}
                        className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${cardStyle}`}
                      >
                        <span
                          className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                            selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900">{opt.de}</p>
                          {showVn && opt.vn && <p className="text-xs text-slate-600">{opt.vn}</p>}
                        </div>
                      </button>
                    );
                  })}

                  {/* MC Feedback */}
                  {mcState && (
                    <div
                      className={`mt-3 rounded-xl p-4 border text-sm space-y-1.5 ${
                        mcState.isCorrect
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <p className="font-bold flex items-center gap-1.5">
                        {mcState.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Chính xác! (100%)
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-rose-600" /> Chưa chính xác — Đáp án đúng là{' '}
                            {String.fromCharCode(65 + q.correct_index)}
                          </>
                        )}
                      </p>
                      {q.explanation_de && <p className="text-xs leading-relaxed">{q.explanation_de}</p>}
                      {showVn && q.explanation_vn && (
                        <p className="text-xs opacity-90 pt-1 border-t border-black/10">{q.explanation_vn}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ESSAY QUESTION */
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    disabled={Boolean(result)}
                    value={essayAnswers[q.id] || ''}
                    onChange={(e) => setEssayAnswers({ ...essayAnswers, [q.id]: e.target.value })}
                    placeholder="Viết câu trả lời của bạn (tiếng Đức hoặc tiếng Việt)... Gợi ý: nhắc rõ thuật ngữ & điều luật IHK để đạt điểm tối đa."
                    className="w-full p-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white disabled:opacity-75"
                  />

                  {/* Essay AI Grading Feedback */}
                  {essayState && (
                    <div className="space-y-3 pt-1">
                      <div
                        className={`rounded-xl p-4 border space-y-2 ${
                          essayState.score >= 70
                            ? 'bg-emerald-50 border-emerald-200'
                            : essayState.score >= 40
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-rose-50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                            Đánh giá & Sửa lỗi chi tiết
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-white border border-slate-200 text-slate-900">
                            {essayState.score}%
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 leading-relaxed">{essayState.feedback_de}</p>
                        {showVn && essayState.feedback_vn && (
                          <p className="text-xs text-slate-700 pt-1.5 border-t border-black/10 leading-relaxed">
                            {essayState.feedback_vn}
                          </p>
                        )}
                      </div>

                      {/* Musterlösung */}
                      <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                            IHK-Musterlösung (Bài mẫu chuẩn đi thi)
                          </span>
                          <button
                            type="button"
                            onClick={() => speakGerman(essayState.musterloesung_de || q.model_answer_de, ttsRate)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-100">
                          {essayState.musterloesung_de || q.model_answer_de}
                        </p>
                        {showVn && (essayState.musterloesung_vn || q.model_answer_vn) && (
                          <p className="text-xs text-indigo-200 bg-white/10 px-3 py-2 rounded-lg leading-relaxed">
                            {essayState.musterloesung_vn || q.model_answer_vn}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit Button */}
      {!result && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={grading}
            className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {grading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI đang chấm điểm & sửa lỗi chi tiết...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Nộp bài & Chấm điểm ngay
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

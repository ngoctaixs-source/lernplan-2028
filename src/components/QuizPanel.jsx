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
  Camera,
  Trash2,
} from 'lucide-react';
import { callGeminiApi, compressImageToBase64 } from '../lib/api';
import { speakGerman } from '../lib/tts';
import { calcIhkGrade } from '../lib/seedData';
import RichContent from './RichContent';
import DiagramRenderer from './DiagramRenderer';

export default function QuizPanel({
  questions,
  showVn,
  ttsRate,
  dictMode,
  onWordClick,
  isAdmin,
  onSaveAttempt,
  onLogMistakes,
  onAppendMoreQuiz,
}) {
  const [mcAnswers, setMcAnswers] = useState({});
  const [essayAnswers, setEssayAnswers] = useState({});
  const [essayImages, setEssayImages] = useState({}); // { [qId]: { base64, mimeType, previewUrl } }
  const [grading, setGrading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleUploadPaper = async (qId, file) => {
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file, 1400, 0.8);
      setEssayImages((prev) => ({ ...prev, [qId]: compressed }));
    } catch (err) {
      setError(err.message || 'Không đọc được ảnh bài giải.');
    }
  };

  const handleSubmit = async () => {
    setError('');
    setGrading(true);
    try {
      const mcQuestions = questions.filter((q) => q.q_type === 'mc');
      const essayQuestions = questions.filter((q) => q.q_type === 'essay');

      let totalPoints = 0;
      const mcFeedback = {};
      const mistakes = [];

      mcQuestions.forEach((q) => {
        const chosen = mcAnswers[q.id];
        const isCorrect = chosen === q.correct_index;
        if (isCorrect) {
          totalPoints += 100;
        } else {
          mistakes.push({
            question: q,
            userAnswer: chosen !== undefined ? q.options?.[chosen]?.de || `Option ${chosen + 1}` : '(Bỏ trống)',
            feedbackVn: q.explanation_vn || 'Trả lời sai câu trắc nghiệm.',
          });
        }
        mcFeedback[q.id] = { isCorrect, chosen };
      });

      const essayFeedback = {};
      if (essayQuestions.length > 0) {
        const essaysToGrade = essayQuestions.map((q) => {
          const img = essayImages[q.id];
          return {
            question_id: q.id,
            question_de: q.question_de,
            model_answer_de: q.model_answer_de,
            user_answer: (essayAnswers[q.id] || '').trim(),
            image_base64: img?.base64 || '',
            image_mime_type: img?.mimeType || 'image/jpeg',
          };
        });

        try {
          const graded = await callGeminiApi('grade_quiz', { essays: essaysToGrade });
          (graded?.results || []).forEach((item) => {
            essayFeedback[item.question_id] = item;
            const sc = Number(item.score || 0);
            totalPoints += sc;
            if (sc < 70) {
              const qObj = essayQuestions.find((q) => q.id === item.question_id);
              if (qObj) {
                mistakes.push({
                  question: qObj,
                  userAnswer: essayAnswers[qObj.id] || (essayImages[qObj.id] ? '[Đã nộp ảnh giấy nháp]' : '(Bỏ trống)'),
                  feedbackVn: item.feedback_vn || 'Cần ôn lại câu tự luận này.',
                });
              }
            }
          });
        } catch (aiErr) {
          setError(`AI chưa chấm tự động được (${aiErr.message}). Đã hiện bài mẫu IHK để bạn tự đối chiếu.`);
          essayQuestions.forEach((q) => {
            const hasAns = Boolean((essayAnswers[q.id] || '').trim() || essayImages[q.id]);
            const fallbackScore = hasAns ? 50 : 0;
            totalPoints += fallbackScore;
            essayFeedback[q.id] = {
              question_id: q.id,
              score: fallbackScore,
              feedback_de: 'Bitte vergleichen Sie Ihre Lösung mit der IHK-Musterlösung.',
              feedback_vn: 'Hãy đối chiếu bài làm của bạn với bài mẫu IHK bên dưới.',
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
      if (mistakes.length > 0) {
        onLogMistakes?.(mistakes);
      }
    } finally {
      setGrading(false);
    }
  };

  const handleReset = () => {
    setMcAnswers({});
    setEssayAnswers({});
    setEssayImages({});
    setResult(null);
    setError('');
  };

  const handleGenerateMore = async () => {
    if (!onAppendMoreQuiz) return;
    setGenerating(true);
    setError('');
    try {
      await onAppendMoreQuiz();
    } catch (err) {
      setError(err.message || 'Không tạo thêm được câu hỏi.');
    } finally {
      setGenerating(false);
    }
  };

  if (!questions.length) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
        <p className="text-slate-600 dark:text-slate-400 text-sm">Bài học này chưa có câu hỏi kiểm tra.</p>
        {isAdmin && onAppendMoreQuiz && (
          <button
            onClick={handleGenerateMore}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Tạo bộ câu hỏi IHK bằng AI
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Bài kiểm tra bao quát ({questions.length} câu — Trắc nghiệm, Tự luận & Chụp ảnh giấy nháp)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Câu tính toán / vẽ biểu đồ bạn có thể viết ra giấy rồi bấm nút <strong>Chụp ảnh giấy nháp</strong> để AI chấm trực tiếp!
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Làm lại
            </button>
          )}
          {isAdmin && onAppendMoreQuiz && (
            <button
              onClick={handleGenerateMore}
              disabled={generating}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl transition disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              + Tạo thêm 5 câu mới
            </button>
          )}
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center shrink-0">
              <span className="text-xl font-extrabold leading-none">{result.percent}%</span>
              <span className="text-[10px] text-indigo-200 font-semibold mt-0.5">ĐIỂM SỐ</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-base font-bold text-slate-900 dark:text-white">Kết quả chấm điểm chuẩn IHK</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${result.grade.color}`}>
                  IHK-Note: {result.grade.note}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Các câu làm sai đã tự động lưu vào Kho câu sai để ôn lại!
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 rounded-xl"
          >
            Làm lại đề này
          </button>
        </div>
      )}

      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl p-3.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Question List */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isMc = q.q_type === 'mc';
          const mcState = result?.mcFeedback?.[q.id];
          const essayState = result?.essayFeedback?.[q.id];
          const paperImg = essayImages[q.id];

          return (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 dark:bg-indigo-600 text-white">
                      Câu {idx + 1}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isMc
                          ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                          : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {isMc ? 'Trắc nghiệm' : 'Tự luận / Tính toán / Vẽ hình'}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    <RichContent text={q.question_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                  </div>
                  {showVn && q.question_vn && (
                    <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 border-l-4 border-indigo-400 px-3.5 py-2 rounded-r-lg">
                      <RichContent text={q.question_vn} />
                    </div>
                  )}
                  {q.diagram_json && <DiagramRenderer diagram={q.diagram_json} />}
                </div>
                <button
                  type="button"
                  onClick={() => speakGerman(q.question_de, ttsRate)}
                  className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl transition shrink-0"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {isMc ? (
                <div className="space-y-2.5">
                  {(q.options || []).map((opt, oIdx) => {
                    const selected = mcAnswers[q.id] === oIdx;
                    let cardStyle =
                      'border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900';
                    if (result) {
                      if (oIdx === q.correct_index) {
                        cardStyle = 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40';
                      } else if (selected && oIdx !== q.correct_index) {
                        cardStyle = 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40';
                      } else {
                        cardStyle = 'border-slate-200 dark:border-slate-800 opacity-65';
                      }
                    } else if (selected) {
                      cardStyle = 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/50 ring-1 ring-indigo-600';
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
                            selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.de}</p>
                          {showVn && opt.vn && <p className="text-xs text-slate-600 dark:text-slate-400">{opt.vn}</p>}
                        </div>
                      </button>
                    );
                  })}

                  {mcState && (
                    <div
                      className={`mt-3 rounded-xl p-4 border text-sm space-y-1.5 ${
                        mcState.isCorrect
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      <p className="font-bold flex items-center gap-1.5">
                        {mcState.isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Chính xác! (100%)
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-rose-600" /> Sai — Đáp án đúng là{' '}
                            {String.fromCharCode(65 + q.correct_index)}
                          </>
                        )}
                      </p>
                      {q.explanation_de && <p className="text-xs leading-relaxed">{q.explanation_de}</p>}
                      {showVn && q.explanation_vn && (
                        <p className="text-xs opacity-90 pt-1 border-t border-black/10 dark:border-white/10">{q.explanation_vn}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    disabled={Boolean(result)}
                    value={essayAnswers[q.id] || ''}
                    onChange={(e) => setEssayAnswers({ ...essayAnswers, [q.id]: e.target.value })}
                    placeholder="Gõ bài làm của bạn (tiếng Đức hoặc tiếng Việt), HOẶC viết công thức / vẽ biểu đồ ra giấy rồi bấm nút chụp ảnh ngay bên dưới..."
                    className="w-full p-3.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75"
                  />

                  {/* Handwritten Scratch Paper Photo Upload */}
                  {!result && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer transition">
                        <Camera className="w-4 h-4" />
                        {paperImg ? 'Đổi ảnh bài giải giấy nháp' : 'Chụp / Tải ảnh bài giải giấy nháp'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            handleUploadPaper(q.id, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {paperImg && (
                        <button
                          type="button"
                          onClick={() =>
                            setEssayImages((prev) => {
                              const next = { ...prev };
                              delete next[q.id];
                              return next;
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Gỡ ảnh
                        </button>
                      )}
                    </div>
                  )}

                  {paperImg && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-w-sm bg-slate-100 dark:bg-slate-800">
                      <img src={paperImg.previewUrl} alt="Bài giải viết tay" className="w-full max-h-56 object-contain" />
                    </div>
                  )}

                  {/* Essay AI Grading Result */}
                  {essayState && (
                    <div className="space-y-3 pt-1">
                      <div
                        className={`rounded-xl p-4 border space-y-2 ${
                          essayState.score >= 70
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800'
                            : essayState.score >= 40
                            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'
                            : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                            AI Chấm điểm & Sửa lỗi (kể cả ảnh giấy nháp)
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                            {essayState.score}%
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 dark:text-slate-100 leading-relaxed">{essayState.feedback_de}</p>
                        {showVn && essayState.feedback_vn && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 pt-1.5 border-t border-black/10 dark:border-white/10 leading-relaxed">
                            {essayState.feedback_vn}
                          </p>
                        )}
                      </div>

                      <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-xl p-4 space-y-2 border border-slate-800">
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
                        <RichContent
                          text={essayState.musterloesung_de || q.model_answer_de}
                          isGerman
                          dictMode={dictMode}
                          onWordClick={onWordClick}
                          className="text-sm text-slate-100"
                        />
                        {showVn && (essayState.musterloesung_vn || q.model_answer_vn) && (
                          <div className="text-xs text-indigo-200 bg-white/10 px-3 py-2 rounded-lg leading-relaxed">
                            <RichContent text={essayState.musterloesung_vn || q.model_answer_vn} />
                          </div>
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
                <Loader2 className="w-4 h-4 animate-spin" /> AI đang chấm bài & soi ảnh giấy nháp...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Nộp bài & Chấm điểm ngay
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
  Award,
  AlertCircle,
  Plus,
  Camera,
  Trash2,
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';
import { speakGerman } from '../lib/tts';
import RichContent from './RichContent';

function compressHandwrittenPhoto(file, maxWidth = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh bài làm.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Định dạng ảnh không hợp lệ.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          base64: dataUrl.split(',')[1],
          mimeType: 'image/jpeg',
          dataUrl,
          name: file.name || 'bai-lam.jpg',
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function QuizPanel({
  questions = [],
  showVn = true,
  ttsRate = 1.0,
  dictMode = true,
  onWordClick = null,
  isAdmin = false,
  onSaveAttempt = null,
  onLogMistakes = null,
  onAppendMoreQuiz = null,
}) {
  const [mcAnswers, setMcAnswers] = useState({}); // { [qId]: optionIndex }
  const [essayAnswers, setEssayAnswers] = useState({}); // { [qId]: string }
  const [essayImages, setEssayImages] = useState({}); // { [qId]: { base64, mimeType, dataUrl, name } }
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeMap, setGradeMap] = useState({}); // { [qId]: { score, feedback_de, feedback_vn, musterloesung_de, musterloesung_vn } }
  const [finalScore, setFinalScore] = useState(null);
  const [error, setError] = useState('');
  const [appending, setAppending] = useState(false);

  const handleUploadEssayPhoto = async (qId, file) => {
    if (!file) return;
    setError('');
    try {
      const compressed = await compressHandwrittenPhoto(file);
      setEssayImages((prev) => ({ ...prev, [qId]: compressed }));
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh giấy nháp.');
    }
  };

  const handleSubmit = async () => {
    if (!questions.length || grading) return;
    setError('');
    setGrading(true);

    try {
      const essayQs = questions.filter((q) => q.q_type === 'essay');
      const nextGradeMap = {};

      if (essayQs.length > 0) {
        const essaysPayload = essayQs.map((q) => ({
          question_id: String(q.id),
          question_de: q.question_de || '',
          model_answer_de: q.model_answer_de || '',
          user_answer: (essayAnswers[q.id] || '').trim(),
          image_base64: essayImages[q.id]?.base64 || null,
          image_mime_type: essayImages[q.id]?.mimeType || 'image/jpeg',
        }));

        const data = await callGeminiApi('grade_quiz', { essays: essaysPayload });
        const results = Array.isArray(data?.results) ? data.results : [];
        results.forEach((r) => {
          if (r?.question_id) {
            nextGradeMap[String(r.question_id)] = {
              score: Math.max(0, Math.min(100, Math.round(Number(r.score ?? 0)))),
              feedback_de: r.feedback_de || '',
              feedback_vn: r.feedback_vn || '',
              musterloesung_de: r.musterloesung_de || '',
              musterloesung_vn: r.musterloesung_vn || '',
            };
          }
        });
      }

      let totalPoints = 0;
      const mistakes = [];

      questions.forEach((q) => {
        if (q.q_type === 'mc') {
          const picked = mcAnswers[q.id];
          const isRight = picked !== undefined && Number(picked) === Number(q.correct_index);
          totalPoints += isRight ? 100 : 0;
          if (!isRight) {
            const pickedOpt = Array.isArray(q.options) && picked !== undefined ? q.options[picked] : null;
            mistakes.push({
              question: q,
              userAnswer: pickedOpt ? `${String.fromCharCode(65 + picked)}) ${pickedOpt.de}` : '(Chưa chọn đáp án)',
              feedbackVn: q.explanation_vn || q.explanation_de || '',
            });
          }
        } else {
          const g = nextGradeMap[String(q.id)];
          const sc = g ? g.score : 0;
          totalPoints += sc;
          if (sc < 65) {
            mistakes.push({
              question: q,
              userAnswer: (essayAnswers[q.id] || '').trim() || (essayImages[q.id] ? '(Nộp ảnh giấy nháp)' : '(Bỏ trống)'),
              feedbackVn: g?.feedback_vn || q.explanation_vn || '',
            });
          }
        }
      });

      const avgScore = Math.round(totalPoints / Math.max(1, questions.length));
      setGradeMap(nextGradeMap);
      setFinalScore(avgScore);
      setSubmitted(true);

      if (onSaveAttempt) {
        await onSaveAttempt(avgScore, {
          totalQuestions: questions.length,
          mistakesCount: mistakes.length,
        });
      }
      if (mistakes.length > 0 && onLogMistakes) {
        await onLogMistakes(mistakes);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi chấm bài. Hãy bấm Nộp bài lại.');
    } finally {
      setGrading(false);
    }
  };

  const handleRetry = () => {
    setMcAnswers({});
    setEssayAnswers({});
    setEssayImages({});
    setGradeMap({});
    setFinalScore(null);
    setSubmitted(false);
    setError('');
  };

  const handleAppendQuiz = async () => {
    if (!onAppendMoreQuiz || appending) return;
    setError('');
    setAppending(true);
    try {
      await onAppendMoreQuiz();
    } catch (err) {
      setError(err.message || 'Không tạo thêm được câu hỏi mới.');
    } finally {
      setAppending(false);
    }
  };

  if (!questions.length) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Bài học này chưa có câu hỏi Test nào.</p>
        {isAdmin && onAppendMoreQuiz && (
          <button
            type="button"
            disabled={appending}
            onClick={handleAppendQuiz}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
          >
            {appending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Tạo bộ câu hỏi Test bằng AI
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Action Bar & Result Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
            Bài kiểm tra chuẩn IHK ({questions.length} câu)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bấm trực tiếp vào bất kỳ từ tiếng Đức nào trong đề, đáp án hoặc nhận xét AI để tra từ điển tức thì
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {submitted && finalScore !== null && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${
                finalScore >= 80
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : finalScore >= 50
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              <Award className="w-4 h-4" /> Kết quả: {finalScore}%
            </span>
          )}

          {submitted && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Làm lại
            </button>
          )}

          {isAdmin && onAppendMoreQuiz && (
            <button
              type="button"
              disabled={appending || grading}
              onClick={handleAppendQuiz}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold disabled:opacity-50"
            >
              {appending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Tạo thêm 5 câu bằng AI
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Question Cards */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isMc = q.q_type === 'mc';
          const pickedIdx = mcAnswers[q.id];
          const isMcCorrect = submitted && isMc && pickedIdx !== undefined && Number(pickedIdx) === Number(q.correct_index);
          const aiGrade = !isMc ? gradeMap[String(q.id)] : null;
          const uploadedImg = essayImages[q.id];

          return (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-600 text-white">
                    Câu {idx + 1}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      isMc
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {isMc ? 'Trắc nghiệm (Single Choice)' : 'Tự luận / Tính toán / Vẽ hình'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => speakGerman(q.question_de, ttsRate)}
                  title="Nghe câu hỏi tiếng Đức"
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 shrink-0"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Question Text (DE clickable + VN) */}
              <div className="space-y-2">
                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                  <RichContent text={q.question_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                </div>
                {showVn && q.question_vn && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 border-l-4 border-indigo-400 rounded-r-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    <RichContent text={q.question_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                  </div>
                )}
              </div>

              {/* MC OPTIONS */}
              {isMc ? (
                <div className="space-y-2">
                  {(Array.isArray(q.options) ? q.options : []).map((opt, optIdx) => {
                    const selected = pickedIdx === optIdx;
                    const isRightOpt = Number(q.correct_index) === optIdx;
                    let cls =
                      'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-100';

                    if (submitted) {
                      if (isRightOpt) {
                        cls =
                          'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-950 dark:text-emerald-100';
                      } else if (selected && !isRightOpt) {
                        cls = 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 text-rose-950 dark:text-rose-100';
                      } else {
                        cls = 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60';
                      }
                    } else if (selected) {
                      cls = 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-950 dark:text-indigo-100';
                    }

                    return (
                      <div
                        key={optIdx}
                        role="button"
                        tabIndex={0}
                        onClick={() => !submitted && setMcAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !submitted) {
                            e.preventDefault();
                            setMcAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
                          }
                        }}
                        className={`w-full text-left p-3.5 rounded-2xl border-2 transition flex items-start gap-3 ${
                          submitted ? 'cursor-default' : 'cursor-pointer'
                        } ${cls}`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 ${
                            submitted && isRightOpt
                              ? 'bg-emerald-600 text-white'
                              : submitted && selected && !isRightOpt
                              ? 'bg-rose-600 text-white'
                              : selected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="text-xs sm:text-sm font-semibold">
                            <RichContent text={opt.de || ''} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                          </div>
                          {showVn && opt.vn && (
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                              <RichContent text={opt.vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                            </div>
                          )}
                        </div>
                        {submitted && isRightOpt && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                        {submitted && selected && !isRightOpt && <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                      </div>
                    );
                  })}

                  {/* MC Explanation after submit */}
                  {submitted && (
                    <div
                      className={`mt-3 rounded-2xl border p-4 space-y-2 ${
                        isMcCorrect
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <div
                        className={`text-xs font-extrabold flex items-center gap-1.5 ${
                          isMcCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {isMcCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Chính xác! (100%)
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" /> Chưa chính xác — Đáp án đúng là{' '}
                            {String.fromCharCode(65 + Number(q.correct_index ?? 0))}
                          </>
                        )}
                      </div>
                      {q.explanation_de && (
                        <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                          <RichContent text={q.explanation_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                        </div>
                      )}
                      {showVn && q.explanation_vn && (
                        <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                          <RichContent text={q.explanation_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ESSAY / CALCULATION QUESTION */
                <div className="space-y-3">
                  <textarea
                    rows={4}
                    disabled={submitted || grading}
                    value={essayAnswers[q.id] || ''}
                    onChange={(e) => setEssayAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Gõ câu trả lời bằng tiếng Đức, tiếng Việt hoặc kết quả tính toán... (hoặc chụp ảnh giấy nháp bên dưới)"
                    className="w-full p-3.5 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75"
                  />

                  {/* Handwritten paper photo upload */}
                  {!submitted && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer transition">
                        <Camera className="w-4 h-4 text-indigo-500" />
                        <span>{uploadedImg ? 'Đổi ảnh giấy nháp' : 'Chụp / tải ảnh giấy nháp (T-Konto, tính toán)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleUploadEssayPhoto(q.id, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {uploadedImg && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                          <img src={uploadedImg.dataUrl} alt="Giấy nháp" className="w-8 h-8 rounded object-cover" />
                          <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 max-w-[160px] truncate">
                            {uploadedImg.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEssayImages((prev) => {
                                const next = { ...prev };
                                delete next[q.id];
                                return next;
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Grading Feedback Box — RENDERED WITH RICHCONTENT (NO MORE RAW ** / $$ / ` BUGS!) */}
                  {submitted && aiGrade && (
                    <div
                      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                        aiGrade.score >= 80
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                          : aiGrade.score >= 50
                          ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                          : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          AI Chấm điểm & Sửa lỗi (kể cả ảnh giấy nháp)
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-900 dark:bg-slate-800 text-white">
                          {aiGrade.score}%
                        </span>
                      </div>

                      {aiGrade.feedback_de && (
                        <div className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-medium">
                          <RichContent text={aiGrade.feedback_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                        </div>
                      )}

                      {showVn && aiGrade.feedback_vn && (
                        <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                          <RichContent text={aiGrade.feedback_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* IHK Musterlösung Box */}
                  {submitted && (aiGrade?.musterloesung_de || q.model_answer_de) && (
                    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-950/30 p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                          IHK-Musterlösung (Bài mẫu chuẩn đi thi)
                        </span>
                        <button
                          type="button"
                          onClick={() => speakGerman(aiGrade?.musterloesung_de || q.model_answer_de, ttsRate)}
                          className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300"
                          title="Nghe bài mẫu tiếng Đức"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        <RichContent
                          text={aiGrade?.musterloesung_de || q.model_answer_de}
                          isGerman
                          dictMode={dictMode}
                          onWordClick={onWordClick}
                        />
                      </div>
                      {showVn && (aiGrade?.musterloesung_vn || q.model_answer_vn) && (
                        <div className="pt-2.5 border-t border-indigo-200/70 dark:border-indigo-800/60 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                          <RichContent
                            text={aiGrade?.musterloesung_vn || q.model_answer_vn}
                            mixedGerman
                            dictMode={dictMode}
                            onWordClick={onWordClick}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit CTA */}
      {!submitted && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={grading}
            onClick={handleSubmit}
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-extrabold shadow-md inline-flex items-center gap-2 transition"
          >
            {grading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> AI đang chấm điểm chuẩn Teilpunkte IHK...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Nộp bài & Chấm điểm AI
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

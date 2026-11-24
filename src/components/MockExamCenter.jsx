import React, { useState, useEffect, useRef } from 'react';
import {
  FileCheck2,
  Timer,
  Plus,
  Sparkles,
  Upload,
  Trash2,
  Play,
  ArrowLeft,
  Camera,
  Send,
  Loader2,
  Award,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Shuffle,
} from 'lucide-react';
import { callGeminiApi, compressImageToBase64 } from '../lib/api';
import { speakGerman } from '../lib/tts';
import { calcIhkGrade } from '../lib/seedData';
import RichContent from './RichContent';
import DiagramRenderer from './DiagramRenderer';

function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function MockExamCenter({
  mockExams,
  mockExamQuestions,
  allQuizQuestions,
  subjects,
  lessons,
  isAdmin,
  showVn,
  ttsRate,
  dictMode,
  onWordClick,
  onCreateExam,
  onAppendExamQuestions,
  onDeleteExam,
  onLogMistakes,
}) {
  // Active exam session state
  const [activeExam, setActiveExam] = useState(null); // { id, title_de, duration_minutes, questions: [] }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [mcAnswers, setMcAnswers] = useState({});
  const [essayAnswers, setEssayAnswers] = useState({});
  const [essayImages, setEssayImages] = useState({});
  const [grading, setGrading] = useState(false);
  const [examResult, setExamResult] = useState(null);
  const [error, setError] = useState('');

  // Create new exam form (Admin)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newExam, setNewExam] = useState({
    title_de: '',
    title_vn: '',
    year_label: 'IHK Sommer 2025',
    duration_minutes: 90,
    description_vn: '',
  });

  // Batch upload pages into existing exam (Admin)
  const [importingExamId, setImportingExamId] = useState(null);
  const [batchText, setBatchText] = useState('');
  const [batchImages, setBatchImages] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const batchFileRef = useRef(null);
  const autoSubmittedRef = useRef(false);

  // Countdown timer
  useEffect(() => {
    if (!activeExam || examResult) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleSubmitExam();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeExam, examResult]);

  const startExam = (examObj, qList) => {
    autoSubmittedRef.current = false;
    setActiveExam({ ...examObj, questions: qList });
    setSecondsLeft((Number(examObj.duration_minutes) || 60) * 60);
    setMcAnswers({});
    setEssayAnswers({});
    setEssayImages({});
    setExamResult(null);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startRandomMixedExam = (minutes = 45, count = 8) => {
    if (!allQuizQuestions.length) {
      setError('Chưa có câu hỏi nào trong các môn học để trộn đề.');
      return;
    }
    const shuffled = [...allQuizQuestions].sort(() => Math.random() - 0.5).slice(0, count);
    const prepared = shuffled.map((q, idx) => ({
      ...q,
      section_label: `Aufgabe ${idx + 1} · Đề trộn tổng hợp`,
      points: q.q_type === 'essay' ? 15 : 10,
    }));
    startExam(
      {
        id: `mixed-${Date.now()}`,
        title_de: `Prüfungssimulation (${prepared.length} Aufgaben gemischt)`,
        duration_minutes: minutes,
      },
      prepared
    );
  };

  const handlePaperPhoto = async (qId, file) => {
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file, 1400, 0.8);
      setEssayImages((prev) => ({ ...prev, [qId]: compressed }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmitExam = async () => {
    if (!activeExam || grading) return;
    setGrading(true);
    setError('');
    try {
      const qs = activeExam.questions || [];
      let totalPossible = 0;
      let earnedPoints = 0;
      const mcFeedback = {};
      const essayFeedback = {};
      const mistakes = [];

      const mcQs = qs.filter((q) => q.q_type === 'mc');
      const essayQs = qs.filter((q) => q.q_type === 'essay');

      mcQs.forEach((q) => {
        const pts = Number(q.points || 10);
        totalPossible += pts;
        const chosen = mcAnswers[q.id];
        const isCorrect = chosen === q.correct_index;
        if (isCorrect) {
          earnedPoints += pts;
        } else {
          mistakes.push({
            question: q,
            userAnswer: chosen !== undefined ? q.options?.[chosen]?.de || `Option ${chosen + 1}` : '(Bỏ trống)',
            feedbackVn: q.explanation_vn || 'Sai câu trắc nghiệm trong đề thi thử.',
          });
        }
        mcFeedback[q.id] = { isCorrect, chosen, pts };
      });

      if (essayQs.length > 0) {
        const essaysPayload = essayQs.map((q) => ({
          question_id: q.id,
          question_de: q.question_de,
          model_answer_de: q.model_answer_de,
          user_answer: (essayAnswers[q.id] || '').trim(),
          image_base64: essayImages[q.id]?.base64 || '',
          image_mime_type: essayImages[q.id]?.mimeType || 'image/jpeg',
        }));

        try {
          const graded = await callGeminiApi('grade_quiz', { essays: essaysPayload });
          (graded?.results || []).forEach((item) => {
            const qObj = essayQs.find((q) => q.id === item.question_id);
            const pts = Number(qObj?.points || 10);
            totalPossible += pts;
            const sc = Number(item.score || 0);
            earnedPoints += (sc / 100) * pts;
            essayFeedback[item.question_id] = item;
            if (sc < 70 && qObj) {
              mistakes.push({
                question: qObj,
                userAnswer: essayAnswers[qObj.id] || (essayImages[qObj.id] ? '[Ảnh giấy nháp]' : '(Bỏ trống)'),
                feedbackVn: item.feedback_vn || 'Cần ôn lại bài tự luận trong đề thi thử.',
              });
            }
          });
        } catch (aiErr) {
          setError(`Không chấm tự động phần tự luận bằng AI được (${aiErr.message}). Đã hiện Musterlösung để tự chấm.`);
          essayQs.forEach((q) => {
            const pts = Number(q.points || 10);
            totalPossible += pts;
            const hasAns = Boolean((essayAnswers[q.id] || '').trim() || essayImages[q.id]);
            const sc = hasAns ? 50 : 0;
            earnedPoints += (sc / 100) * pts;
            essayFeedback[q.id] = {
              question_id: q.id,
              score: sc,
              feedback_de: 'Bitte selbst mit der Musterlösung vergleichen.',
              feedback_vn: 'Đối chiếu bài làm của bạn với bài mẫu IHK bên dưới.',
              musterloesung_de: q.model_answer_de,
              musterloesung_vn: q.model_answer_vn,
            };
          });
        }
      }

      const percent = totalPossible > 0 ? Math.round((earnedPoints / totalPossible) * 100) : 0;
      setExamResult({
        percent,
        earned: Math.round(earnedPoints * 10) / 10,
        totalPossible,
        grade: calcIhkGrade(percent),
        mcFeedback,
        essayFeedback,
      });

      if (mistakes.length > 0) {
        onLogMistakes?.(mistakes, 'exam');
      }
    } finally {
      setGrading(false);
    }
  };

  const handleCreateExamSubmit = async (e) => {
    e.preventDefault();
    if (!newExam.title_de.trim()) return;
    await onCreateExam?.(newExam);
    setNewExam({
      title_de: '',
      title_vn: '',
      year_label: 'IHK Sommer 2025',
      duration_minutes: 90,
      description_vn: '',
    });
    setShowCreateForm(false);
  };

  const handleBatchFiles = async (fileList) => {
    if (!fileList?.length) return;
    const slots = Math.max(0, 3 - batchImages.length);
    const chosen = Array.from(fileList).slice(0, slots);
    const out = [];
    for (const f of chosen) {
      const c = await compressImageToBase64(f, 1400, 0.78);
      out.push({ ...c, name: f.name });
    }
    setBatchImages((prev) => [...prev, ...out]);
  };

  const handleImportBatchSubmit = async () => {
    const exam = mockExams.find((e) => e.id === importingExamId);
    if (!exam) return;
    if (!batchText.trim() && batchImages.length === 0) {
      setError('Vui lòng dán đề thi hoặc tải 1–3 ảnh trang đề thi.');
      return;
    }

    setBatchLoading(true);
    setError('');
    try {
      const existingCount = mockExamQuestions.filter((q) => q.exam_id === exam.id).length;
      const data = await callGeminiApi('import_exam_batch', {
        rawText: batchText.trim(),
        images: batchImages.map((i) => ({ base64: i.base64, mimeType: i.mimeType })),
        examTitle: exam.title_de,
        startNumber: existingCount + 1,
      });

      const qs = data?.questions || [];
      if (!qs.length) throw new Error('AI không đọc được câu hỏi nào từ trang này.');
      await onAppendExamQuestions?.(exam.id, qs, existingCount);
      setBatchText('');
      setBatchImages([]);
      setImportingExamId(null);
    } catch (err) {
      setError(err.message || 'Lỗi khi nạp trang đề thi cũ.');
    } finally {
      setBatchLoading(false);
    }
  };

  // ==================== ACTIVE TIMED EXAM ROOM ====================
  if (activeExam) {
    const isDangerTime = secondsLeft > 0 && secondsLeft <= 300;
    return (
      <div className="space-y-5">
        {/* Sticky Exam Timer Bar */}
        <div className="sticky top-16 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 p-4 shadow-md flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (!examResult && !window.confirm('Thoát phòng thi sẽ mất bài đang làm dở. Bạn chắc chứ?')) return;
                setActiveExam(null);
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {activeExam.title_de}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeExam.questions.length} câu hỏi · Tự động thu bài khi hết giờ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!examResult && (
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-base font-black border ${
                  isDangerTime
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-slate-900 dark:bg-indigo-950 text-white border-slate-800 dark:border-indigo-700'
                }`}
              >
                <Timer className="w-4 h-4" />
                {formatClock(secondsLeft)}
              </div>
            )}
            {!examResult && (
              <button
                onClick={handleSubmitExam}
                disabled={grading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-60"
              >
                {grading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Nộp bài
              </button>
            )}
          </div>
        </div>

        {/* Result Banner */}
        {examResult && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-400 dark:border-emerald-700 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center shrink-0">
                <span className="text-2xl font-black">{examResult.percent}%</span>
                <span className="text-[10px] text-indigo-200 font-bold">
                  {examResult.earned}/{examResult.totalPossible} Đ
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" /> Kết quả thi thử IHK
                </h3>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${examResult.grade.color}`}>
                  IHK-Note: {examResult.grade.note}
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveExam(null)}
              className="px-4 py-2.5 bg-slate-900 dark:bg-indigo-600 text-white text-xs font-bold rounded-xl"
            >
              Về danh sách đề thi
            </button>
          </div>
        )}

        {error && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl p-3.5">
            {error}
          </div>
        )}

        {/* Questions */}
        <div className="space-y-4">
          {activeExam.questions.map((q, idx) => {
            const isMc = q.q_type === 'mc';
            const mcState = examResult?.mcFeedback?.[q.id];
            const essayState = examResult?.essayFeedback?.[q.id];
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
                        {q.section_label || `Aufgabe ${idx + 1}`}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        {q.points || 10} Punkte
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
                    className="p-2 text-slate-400 hover:text-indigo-600 shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {isMc ? (
                  <div className="space-y-2">
                    {(q.options || []).map((opt, oIdx) => {
                      const selected = mcAnswers[q.id] === oIdx;
                      let cls = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900';
                      if (examResult) {
                        if (oIdx === q.correct_index) cls = 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40';
                        else if (selected) cls = 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40';
                      } else if (selected) {
                        cls = 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/50 ring-1 ring-indigo-600';
                      }
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={Boolean(examResult)}
                          onClick={() => setMcAnswers({ ...mcAnswers, [q.id]: oIdx })}
                          className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${cls}`}
                        >
                          <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.de}</p>
                            {showVn && opt.vn && <p className="text-xs text-slate-500 dark:text-slate-400">{opt.vn}</p>}
                          </div>
                        </button>
                      );
                    })}
                    {mcState && (
                      <div className={`rounded-xl p-3.5 text-xs border ${mcState.isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800'}`}>
                        <p className="font-bold flex items-center gap-1.5">
                          {mcState.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                          {mcState.isCorrect ? 'Đúng!' : `Sai — Đáp án đúng là ${String.fromCharCode(65 + q.correct_index)}`}
                        </p>
                        {q.explanation_vn && <p className="mt-1">{q.explanation_vn}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      rows={5}
                      disabled={Boolean(examResult)}
                      value={essayAnswers[q.id] || ''}
                      onChange={(e) => setEssayAnswers({ ...essayAnswers, [q.id]: e.target.value })}
                      placeholder="Nhập bài làm hoặc chụp ảnh tờ giấy giải toán / vẽ biểu đồ bên dưới..."
                      className="w-full p-3.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                    {!examResult && (
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer">
                          <Camera className="w-4 h-4" />
                          {paperImg ? 'Đổi ảnh giấy nháp' : 'Chụp / Tải ảnh giấy nháp'}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              handlePaperPhoto(q.id, e.target.files?.[0]);
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
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Gỡ ảnh
                          </button>
                        )}
                      </div>
                    )}
                    {paperImg && (
                      <img
                        src={paperImg.previewUrl}
                        alt="Bài làm giấy nháp"
                        className="max-h-56 rounded-xl border border-slate-200 dark:border-slate-700"
                      />
                    )}
                    {essayState && (
                      <div className="space-y-2.5">
                        <div className="rounded-xl p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1.5">
                          <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                            <span>Chấm điểm AI:</span>
                            <span>{essayState.score}%</span>
                          </div>
                          <p className="text-slate-800 dark:text-slate-200">{essayState.feedback_de}</p>
                          {showVn && <p className="text-slate-600 dark:text-slate-400">{essayState.feedback_vn}</p>}
                        </div>
                        <div className="rounded-xl p-4 bg-slate-900 text-white text-xs space-y-1.5">
                          <p className="font-bold text-indigo-300 uppercase">IHK-Musterlösung:</p>
                          <RichContent text={essayState.musterloesung_de || q.model_answer_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                          {showVn && (essayState.musterloesung_vn || q.model_answer_vn) && (
                            <p className="text-indigo-200 pt-1">{essayState.musterloesung_vn || q.model_answer_vn}</p>
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
      </div>
    );
  }

  // ==================== EXAM LIBRARY LIST ====================
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-bold">
            <FileCheck2 className="w-3.5 h-3.5" /> Phòng thi thử & Kho Altklausuren IHK
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold">Luyện đề thi cũ các năm — Đếm giờ như thi thật</h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Nạp đề thi cũ nhiều trang theo từng đợt (1–3 ảnh/lần), bấm giờ đếm ngược 60–90 phút, hỗ trợ chụp giấy nháp giải toán & vẽ đồ thị.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={() => startRandomMixedExam(45, 8)}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition"
          >
            <Shuffle className="w-4 h-4" /> Trộn đề ngẫu nhiên (45p)
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm((s) => !s)}
              className="px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg transition"
            >
              <Plus className="w-4 h-4" /> Tạo bộ đề thi cũ mới
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs rounded-xl p-3.5">
          {error}
        </div>
      )}

      {/* Admin Create Exam Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateExamSubmit}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5 space-y-4 shadow-sm"
        >
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Tạo vỏ bộ đề thi cũ (Altklausur)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên bộ đề tiếng Đức *</label>
              <input
                required
                value={newExam.title_de}
                onChange={(e) => setNewExam({ ...newExam, title_de: e.target.value })}
                placeholder="VD: IHK Abschlussprüfung Sommer 2024 – Veranstaltungskonzeption"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên tiếng Việt</label>
              <input
                value={newExam.title_vn}
                onChange={(e) => setNewExam({ ...newExam, title_vn: e.target.value })}
                placeholder="VD: Đề thi tốt nghiệp Hè 2024 — Lập kế hoạch sự kiện"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kỳ thi / Năm</label>
              <input
                value={newExam.year_label}
                onChange={(e) => setNewExam({ ...newExam, year_label: e.target.value })}
                placeholder="VD: Sommer 2024"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời gian làm bài (phút)</label>
              <input
                type="number"
                min={5}
                max={240}
                value={newExam.duration_minutes}
                onChange={(e) => setNewExam({ ...newExam, duration_minutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <input
                value={newExam.description_vn}
                onChange={(e) => setNewExam({ ...newExam, description_vn: e.target.value })}
                placeholder="Ghi chú ngắn về bộ đề này..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-xs text-slate-500">
              Hủy
            </button>
            <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl">
              Tạo bộ đề
            </button>
          </div>
        </form>
      )}

      {/* Batch Upload Modal / Drawer for an Exam */}
      {importingExamId && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-indigo-400 dark:border-indigo-700 p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Nạp thêm trang đề thi vào: {mockExams.find((e) => e.id === importingExamId)?.title_de}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mỗi đợt tải lên 1–3 ảnh trang đề thi (hoặc dán chữ) — AI sẽ tự số hóa nối tiếp vào đề này!
              </p>
            </div>
            <button onClick={() => setImportingExamId(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Đóng
            </button>
          </div>

          <input
            ref={batchFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleBatchFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => batchFileRef.current?.click()}
              className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Chọn 1–3 ảnh trang đề thi ({batchImages.length}/3)
            </button>
          </div>

          {batchImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {batchImages.map((img, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={img.previewUrl} alt="" className="w-full h-24 object-cover" />
                  <button
                    onClick={() => setBatchImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-md"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            rows={4}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder="(Hoặc dán văn bản copy từ file PDF đề thi cũ vào đây...)"
            className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleImportBatchSubmit}
              disabled={batchLoading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 disabled:opacity-60"
            >
              {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {batchLoading ? 'AI đang số hóa trang đề...' : 'Quét & Nối vào bộ đề'}
            </button>
          </div>
        </div>
      )}

      {/* Exam Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockExams.map((exam) => {
          const qs = mockExamQuestions
            .filter((q) => q.exam_id === exam.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          const totalPoints = qs.reduce((acc, q) => acc + Number(q.points || 10), 0);

          return (
            <div
              key={exam.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {exam.year_label || 'Altklausur'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <Timer className="w-3.5 h-3.5 text-amber-500" /> {exam.duration_minutes} phút · {qs.length} câu ({totalPoints} đ)
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">{exam.title_de}</h3>
                {exam.title_vn && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{exam.title_vn}</p>}
                {exam.description_vn && <p className="text-xs text-slate-500 dark:text-slate-400">{exam.description_vn}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setImportingExamId(exam.id);
                          setBatchText('');
                          setBatchImages([]);
                        }}
                        className="px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Nạp thêm trang đề
                      </button>
                      <button
                        onClick={() => onDeleteExam?.(exam.id, exam.title_de)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-xl"
                        title="Xóa đề thi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                <button
                  disabled={qs.length === 0}
                  onClick={() => startExam(exam, qs)}
                  className="px-4 py-2 bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" /> Bắt đầu thi
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

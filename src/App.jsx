import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  Layers,
  GraduationCap,
  Plus,
  Volume2,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  ShieldCheck,
  Download,
  Upload,
  ChevronRight,
  ArrowLeft,
  Lightbulb,
  Sparkles,
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
  Award,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { supabase, isSupabaseConfigured, ADMIN_EMAIL } from './lib/supabase';
import { callGeminiApi } from './lib/api';
import { speakGerman } from './lib/tts';
import { LEVEL_META } from './lib/seedData';
import AuthModal from './components/AuthModal';
import ImportModal from './components/ImportModal';
import FlashcardDeck from './components/FlashcardDeck';
import QuizPanel from './components/QuizPanel';

const LOCAL_PROGRESS_KEY = 'lernplan2028_guest_progress_v1';

export default function App() {
  // Auth state
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Curriculum data from Supabase
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [sections, setSections] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);

  // User progress
  const [progressMap, setProgressMap] = useState({}); // { [flashcardId]: 'new'|'learning'|'mastered' }
  const [quizAttempts, setQuizAttempts] = useState([]);

  // Navigation & UI state
  const [view, setView] = useState('home'); // 'home' | 'lesson' | 'global-cards'
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [lessonTab, setLessonTab] = useState('study'); // 'study' | 'cards' | 'quiz'
  const [globalSubjectFilter, setGlobalSubjectFilter] = useState('all');
  const [showVn, setShowVn] = useState(true);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [showImportModal, setShowImportModal] = useState(false);

  // Per-section explanation state
  const [openExplainIds, setOpenExplainIds] = useState({});
  const [loadingExplainId, setLoadingExplainId] = useState(null);

  // Toast notification
  const [toast, setToast] = useState(null);
  const importJsonRef = useRef(null);

  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Days until IHK Abschlussprüfung Summer 2028 (approx May 1, 2028)
  const daysToExam = useMemo(() => {
    const examDate = new Date('2028-05-01T08:00:00Z');
    const diff = Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, []);

  // Load Auth Session
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // Load Shared Curriculum from Supabase
  const loadCurriculum = async () => {
    if (!supabase) {
      setLoadingData(false);
      setDataError('Chưa kết nối Supabase (thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY).');
      return;
    }
    setLoadingData(true);
    setDataError('');
    try {
      const [subRes, lesRes, secRes, fcRes, qRes] = await Promise.all([
        supabase.from('subjects').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('lessons').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('lesson_sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('flashcards').select('*').order('created_at', { ascending: true }),
        supabase.from('quiz_questions').select('*').order('sort_order', { ascending: true }),
      ]);

      const firstErr = subRes.error || lesRes.error || secRes.error || fcRes.error || qRes.error;
      if (firstErr) throw firstErr;

      setSubjects(subRes.data || []);
      setLessons(lesRes.data || []);
      setSections(secRes.data || []);
      setFlashcards(fcRes.data || []);
      setQuizQuestions(qRes.data || []);
    } catch (err) {
      setDataError(
        err.message ||
          'Chưa đọc được dữ liệu từ Supabase. Hãy chắc chắn bạn đã chạy file supabase_setup.sql trong SQL Editor.'
      );
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadCurriculum();
  }, []);

  // Load User Progress (Supabase when logged in, localStorage for guest)
  useEffect(() => {
    const loadProgress = async () => {
      if (user && supabase) {
        const [fcProg, qaRes] = await Promise.all([
          supabase.from('user_flashcard_progress').select('flashcard_id, status').eq('user_id', user.id),
          supabase
            .from('user_quiz_attempts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        const map = {};
        (fcProg.data || []).forEach((row) => {
          map[row.flashcard_id] = row.status;
        });
        setProgressMap(map);
        setQuizAttempts(qaRes.data || []);
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}');
          setProgressMap(saved.progressMap || {});
          setQuizAttempts(saved.quizAttempts || []);
        } catch {
          setProgressMap({});
          setQuizAttempts([]);
        }
      }
    };
    loadProgress();
  }, [user]);

  // Derived lookup maps
  const subjectMap = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      m[s.id] = s.title_de;
    });
    return m;
  }, [subjects]);

  const activeLesson = useMemo(() => lessons.find((l) => l.id === activeLessonId) || null, [lessons, activeLessonId]);
  const activeSubject = useMemo(
    () => subjects.find((s) => s.id === activeLesson?.subject_id) || null,
    [subjects, activeLesson]
  );
  const activeSections = useMemo(
    () => sections.filter((sec) => sec.lesson_id === activeLessonId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [sections, activeLessonId]
  );
  const activeCards = useMemo(() => flashcards.filter((c) => c.lesson_id === activeLessonId), [flashcards, activeLessonId]);
  const activeQuiz = useMemo(
    () => quizQuestions.filter((q) => q.lesson_id === activeLessonId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [quizQuestions, activeLessonId]
  );

  const totalDueCards = useMemo(
    () => flashcards.filter((c) => progressMap[c.id] !== 'mastered').length,
    [flashcards, progressMap]
  );

  const avgQuizScore = useMemo(() => {
    if (!quizAttempts.length) return null;
    const sum = quizAttempts.reduce((acc, a) => acc + Number(a.score_percent || 0), 0);
    return Math.round(sum / quizAttempts.length);
  }, [quizAttempts]);

  // Update flashcard mastery
  const handleSetMastery = async (flashcardId, status) => {
    const nextMap = { ...progressMap, [flashcardId]: status };
    setProgressMap(nextMap);

    if (user && supabase) {
      await supabase.from('user_flashcard_progress').upsert(
        {
          user_id: user.id,
          flashcard_id: flashcardId,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,flashcard_id' }
      );
    } else {
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ progressMap: nextMap, quizAttempts }));
    }
  };

  // Save quiz attempt
  const handleSaveQuizAttempt = async (scorePercent, details) => {
    if (!activeLessonId) return;
    const newAttempt = {
      id: `local-${Date.now()}`,
      lesson_id: activeLessonId,
      score_percent: scorePercent,
      details,
      created_at: new Date().toISOString(),
    };
    const nextAttempts = [newAttempt, ...quizAttempts];
    setQuizAttempts(nextAttempts);

    if (user && supabase) {
      const { data } = await supabase
        .from('user_quiz_attempts')
        .insert({
          user_id: user.id,
          lesson_id: activeLessonId,
          score_percent: scorePercent,
          details,
        })
        .select()
        .single();
      if (data) {
        setQuizAttempts([data, ...quizAttempts]);
      }
    } else {
      localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify({ progressMap, quizAttempts: nextAttempts }));
    }
  };

  // Toggle or generate Section Explanation ("Giải thích dễ hiểu & Ví dụ")
  const handleToggleExplain = async (sec) => {
    if (openExplainIds[sec.id]) {
      setOpenExplainIds((prev) => ({ ...prev, [sec.id]: false }));
      return;
    }

    // Already saved in DB -> open instantly!
    if (sec.explanation_de || sec.explanation_vn) {
      setOpenExplainIds((prev) => ({ ...prev, [sec.id]: true }));
      return;
    }

    setLoadingExplainId(sec.id);
    try {
      const data = await callGeminiApi('explain_section', {
        lessonTitle: activeLesson?.title_de || '',
        headingDe: sec.heading_de,
        contentDe: sec.content_de,
      });

      const updatedFields = {
        explanation_de: data.explanation_de || '',
        explanation_vn: data.explanation_vn || '',
        example_de: data.example_de || '',
        example_vn: data.example_vn || '',
        exam_tip_vn: data.exam_tip_vn || '',
      };

      // Update local state immediately
      setSections((prev) => prev.map((item) => (item.id === sec.id ? { ...item, ...updatedFields } : item)));
      setOpenExplainIds((prev) => ({ ...prev, [sec.id]: true }));

      // Persist to Supabase if Admin
      if (isAdmin && supabase) {
        await supabase.from('lesson_sections').update(updatedFields).eq('id', sec.id);
      }
    } catch (err) {
      showToast(err.message || 'Không tạo được giải thích AI.', 'error');
    } finally {
      setLoadingExplainId(null);
    }
  };

  // Save AI-Imported OneNote Curriculum to Supabase
  const handleSaveImportedData = async (aiResult) => {
    if (!supabase || !isAdmin) {
      throw new Error('Chỉ Admin mới có quyền lưu dữ liệu vào Supabase.');
    }

    let subjectId = aiResult.existing_subject_id;
    const exists = subjects.some((s) => s.id === subjectId);

    if (!subjectId || !exists) {
      const { data: newSub, error: subErr } = await supabase
        .from('subjects')
        .insert({
          title_de: aiResult.subject?.title_de || 'Neues Fach',
          title_vn: aiResult.subject?.title_vn || 'Môn học mới',
          description_de: aiResult.subject?.description_de || '',
          description_vn: aiResult.subject?.description_vn || '',
          sort_order: subjects.length + 1,
        })
        .select()
        .single();
      if (subErr) throw subErr;
      subjectId = newSub.id;
    }

    const existingLessonCount = lessons.filter((l) => l.subject_id === subjectId).length;
    let firstCreatedLessonId = null;

    for (let i = 0; i < aiResult.lessons.length; i++) {
      const les = aiResult.lessons[i];
      const level = ['foundation', 'connected', 'advanced'].includes(les.level) ? les.level : 'foundation';

      const { data: createdLesson, error: lesErr } = await supabase
        .from('lessons')
        .insert({
          subject_id: subjectId,
          title_de: les.title_de,
          title_vn: les.title_vn || '',
          level,
          sort_order: existingLessonCount + i + 1,
          overview_de: les.overview_de || '',
          overview_vn: les.overview_vn || '',
        })
        .select()
        .single();
      if (lesErr) throw lesErr;
      if (!firstCreatedLessonId) firstCreatedLessonId = createdLesson.id;

      // Insert sections
      if (Array.isArray(les.sections) && les.sections.length > 0) {
        const secRows = les.sections.map((s, idx) => ({
          lesson_id: createdLesson.id,
          sort_order: idx + 1,
          heading_de: s.heading_de || `Abschnitt ${idx + 1}`,
          heading_vn: s.heading_vn || '',
          content_de: s.content_de || '',
          content_vn: s.content_vn || '',
        }));
        const { error: secErr } = await supabase.from('lesson_sections').insert(secRows);
        if (secErr) throw secErr;
      }

      // Insert flashcards
      if (Array.isArray(les.flashcards) && les.flashcards.length > 0) {
        const fcRows = les.flashcards.map((f) => ({
          lesson_id: createdLesson.id,
          subject_id: subjectId,
          category: f.category || 'Fachbegriff',
          front_de: f.front_de || '',
          hint_vn: f.hint_vn || '',
          back_de: f.back_de || '',
          back_vn: f.back_vn || '',
          example_de: f.example_de || '',
          example_vn: f.example_vn || '',
        }));
        const { error: fcErr } = await supabase.from('flashcards').insert(fcRows);
        if (fcErr) throw fcErr;
      }

      // Insert quiz questions
      if (Array.isArray(les.quiz_questions) && les.quiz_questions.length > 0) {
        const qRows = les.quiz_questions.map((q, idx) => ({
          lesson_id: createdLesson.id,
          sort_order: idx + 1,
          q_type: q.q_type === 'essay' ? 'essay' : 'mc',
          question_de: q.question_de || '',
          question_vn: q.question_vn || '',
          options: q.q_type === 'mc' ? q.options || [] : [],
          correct_index: q.q_type === 'mc' ? Number(q.correct_index ?? 0) : null,
          model_answer_de: q.model_answer_de || '',
          model_answer_vn: q.model_answer_vn || '',
          explanation_de: q.explanation_de || '',
          explanation_vn: q.explanation_vn || '',
        }));
        const { error: qErr } = await supabase.from('quiz_questions').insert(qRows);
        if (qErr) throw qErr;
      }
    }

    await loadCurriculum();
    showToast(`Đã thêm thành công ${aiResult.lessons.length} bài học mới kèm Flashcard & Bài Test!`);
    if (firstCreatedLessonId) {
      setActiveLessonId(firstCreatedLessonId);
      setLessonTab('study');
      setView('lesson');
    }
  };

  // Admin: Generate more flashcards for current lesson
  const handleGenerateMoreCards = async () => {
    if (!activeLesson || !supabase) return;
    try {
      const sectionsText = activeSections.map((s) => `${s.heading_de}\n${s.content_de}`).join('\n\n');
      const data = await callGeminiApi('generate_more_cards', {
        lessonTitle: activeLesson.title_de,
        sectionsText,
        existingFronts: activeCards.map((c) => c.front_de),
      });

      const rows = (data?.flashcards || []).map((f) => ({
        lesson_id: activeLesson.id,
        subject_id: activeLesson.subject_id,
        category: f.category || 'Fachbegriff',
        front_de: f.front_de,
        hint_vn: f.hint_vn || '',
        back_de: f.back_de,
        back_vn: f.back_vn || '',
        example_de: f.example_de || '',
        example_vn: f.example_vn || '',
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from('flashcards').insert(rows);
        if (error) throw error;
        await loadCurriculum();
        showToast(`Đã tạo thêm ${rows.length} thẻ Flashcard mới!`);
      }
    } catch (err) {
      showToast(err.message || 'Không tạo được thẻ mới.', 'error');
    }
  };

  // Admin: Add manual flashcard
  const handleAddManualCard = async (card) => {
    if (!activeLesson || !supabase) return;
    const { error } = await supabase.from('flashcards').insert({
      ...card,
      lesson_id: activeLesson.id,
      subject_id: activeLesson.subject_id,
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    await loadCurriculum();
    showToast('Đã lưu thẻ Flashcard mới!');
  };

  // Admin: Delete flashcard
  const handleDeleteCard = async (cardId) => {
    if (!supabase || !window.confirm('Xóa thẻ Flashcard này?')) return;
    const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
    showToast('Đã xóa thẻ.');
  };

  // Admin: Generate fresh quiz for current lesson
  const handleGenerateNewQuiz = async () => {
    if (!activeLesson || !supabase) return;
    const sectionsText = activeSections.map((s) => `${s.heading_de}\n${s.content_de}`).join('\n\n');
    const data = await callGeminiApi('generate_more_quiz', {
      lessonTitle: activeLesson.title_de,
      sectionsText,
    });

    const newQs = data?.quiz_questions || [];
    if (!newQs.length) throw new Error('AI không trả về câu hỏi mới.');

    // Replace existing quiz questions for this lesson
    await supabase.from('quiz_questions').delete().eq('lesson_id', activeLesson.id);
    const rows = newQs.map((q, idx) => ({
      lesson_id: activeLesson.id,
      sort_order: idx + 1,
      q_type: q.q_type === 'essay' ? 'essay' : 'mc',
      question_de: q.question_de,
      question_vn: q.question_vn || '',
      options: q.q_type === 'mc' ? q.options || [] : [],
      correct_index: q.q_type === 'mc' ? Number(q.correct_index ?? 0) : null,
      model_answer_de: q.model_answer_de || '',
      model_answer_vn: q.model_answer_vn || '',
      explanation_de: q.explanation_de || '',
      explanation_vn: q.explanation_vn || '',
    }));

    const { error } = await supabase.from('quiz_questions').insert(rows);
    if (error) throw error;
    await loadCurriculum();
    showToast(`Đã tạo bộ đề mới gồm ${rows.length} câu hỏi chuẩn IHK!`);
  };

  // Admin: Delete lesson
  const handleDeleteLesson = async (lessonId, lessonTitle) => {
    if (!supabase || !window.confirm(`Bạn chắc chắn muốn xóa bài học "${lessonTitle}"?`)) return;
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (activeLessonId === lessonId) {
      setView('home');
      setActiveLessonId(null);
    }
    await loadCurriculum();
    showToast('Đã xóa bài học.');
  };

  // Export JSON Backup
  const handleExportJson = () => {
    const backup = {
      exported_at: new Date().toISOString(),
      app: 'LernPlan 2028 — Veranstaltungskaufmann',
      subjects,
      lessons,
      lesson_sections: sections,
      flashcards,
      quiz_questions: quizQuestions,
      progressMap,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lernplan-2028-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải file sao lưu JSON về máy!');
  };

  // Import JSON Backup (Admin restores curriculum into Supabase)
  const handleImportJsonFile = async (file) => {
    if (!file) return;
    if (!isAdmin || !supabase) {
      showToast('Chỉ Admin đã đăng nhập mới có thể khôi phục kho bài từ file JSON.', 'error');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.subjects)) {
        throw new Error('File JSON không đúng định dạng sao lưu của LernPlan 2028.');
      }

      if (parsed.subjects.length) await supabase.from('subjects').upsert(parsed.subjects);
      if (parsed.lessons?.length) await supabase.from('lessons').upsert(parsed.lessons);
      if (parsed.lesson_sections?.length) await supabase.from('lesson_sections').upsert(parsed.lesson_sections);
      if (parsed.flashcards?.length) await supabase.from('flashcards').upsert(parsed.flashcards);
      if (parsed.quiz_questions?.length) await supabase.from('quiz_questions').upsert(parsed.quiz_questions);

      await loadCurriculum();
      showToast('Đã khôi phục dữ liệu từ file sao lưu JSON thành công!');
    } catch (err) {
      showToast(err.message || 'Không thể nhập file JSON.', 'error');
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    showToast('Đã đăng xuất.');
  };

  const openLesson = (lessonId) => {
    setActiveLessonId(lessonId);
    setLessonTab('study');
    setOpenExplainIds({});
    setView('lesson');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const globalFilteredCards = useMemo(() => {
    if (globalSubjectFilter === 'all') return flashcards;
    return flashcards.filter((c) => c.subject_id === globalSubjectFilter);
  }, [flashcards, globalSubjectFilter]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm ">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Hidden JSON File Input */}
      <input
        ref={importJsonRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          handleImportJsonFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Brand */}
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2.5 text-left group shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white font-extrabold text-sm flex items-center justify-center shadow-sm">
              LP
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-extrabold text-slate-900 leading-tight group-hover:text-indigo-700 transition">
                LernPlan 2028
              </div>
              <div className="text-[11px] text-slate-500 font-medium">Veranstaltungskaufmann · IHK</div>
            </div>
          </button>

          {/* Center Nav */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setView('home')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                view === 'home' || view === 'lesson'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Môn học</span>
            </button>
            <button
              onClick={() => setView('global-cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                view === 'global-cards'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ôn Flashcard</span>
              <span className="sm:hidden">Thẻ</span>
              {totalDueCards > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full leading-none">
                  {totalDueCards}
                </span>
              )}
            </button>
          </nav>

          {/* Right Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Toggle Vietnamese */}
            <button
              onClick={() => setShowVn((v) => !v)}
              title="Hiện hoặc ẩn toàn bộ bản dịch tiếng Việt để tự kiểm tra đọc hiểu tiếng Đức"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                showVn
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {showVn ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{showVn ? 'Ẩn dịch VN' : 'Hiện dịch VN'}</span>
              <span className="md:hidden">VN</span>
            </button>

            {/* TTS Speed Toggle */}
            <button
              onClick={() => setTtsRate((r) => (r === 1.0 ? 0.85 : 1.0))}
              title="Tốc độ đọc tiếng Đức (0.85x chậm / 1.0x chuẩn)"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {ttsRate}x
            </button>

            {/* Auth Button */}
            {user ? (
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <span
                    title={`Admin: ${user.email}`}
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin
                  </span>
                )}
                <button
                  onClick={handleSignOut}
                  title={`Đăng xuất (${user.email})`}
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Supabase Config Warning */}
        {!isSupabaseConfigured && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Chưa cấu hình biến môi trường Supabase trên Vercel</p>
              <p className="mt-0.5">
                Vào Vercel → Settings → Environment Variables và thêm đủ 3 biến:{' '}
                <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code> và <code>GEMINI_API_KEY</code> rồi Redeploy.
              </p>
            </div>
          </div>
        )}

        {dataError && isSupabaseConfigured && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{dataError}</span>
            </div>
            <button
              onClick={loadCurriculum}
              className="px-3 py-1.5 bg-white border border-rose-200 rounded-lg font-semibold hover:bg-rose-100 shrink-0 flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Thử lại
            </button>
          </div>
        )}

        {/* ==================== VIEW 1: HOME DASHBOARD ==================== */}
        {view === 'home' && (
          <div className="space-y-6">
            {/* Hero Action Panel */}
            <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2.5 max-w-xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    Còn khoảng {daysToExam} ngày tới IHK Abschlussprüfung 2028
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                    Hôm nay bạn muốn học môn nào?
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Kho kiến thức song ngữ Đức–Việt chuẩn văn phong gốc IHK từ OneNote. Học liền mạch từ{' '}
                    <span className="text-emerald-300 font-semibold">Nền tảng</span> →{' '}
                    <span className="text-indigo-300 font-semibold">Liên kết</span> →{' '}
                    <span className="text-amber-300 font-semibold">Mở rộng</span>.
                  </p>
                </div>

                {/* Primary CTA: "+ Bạn muốn thêm gì vào trang web?" */}
                <div className="flex flex-col gap-2.5 shrink-0">
                  <button
                    onClick={() => {
                      if (isAdmin) {
                        setShowImportModal(true);
                      } else {
                        setShowAuthModal(true);
                        showToast(`Đăng nhập tài khoản Admin (${ADMIN_EMAIL}) để thêm kiến thức mới.`, 'error');
                      }
                    }}
                    className="px-5 py-3.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-500/30 transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Bạn muốn thêm gì vào trang web?
                  </button>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleExportJson}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-white/10 hover:bg-white/15 rounded-xl transition"
                    >
                      <Download className="w-3.5 h-3.5" /> Sao lưu JSON
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => importJsonRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-white/10 hover:bg-white/15 rounded-xl transition"
                      >
                        <Upload className="w-3.5 h-3.5" /> Nhập JSON
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Compact Stats Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <p className="text-xs text-slate-400">Môn học</p>
                  <p className="text-xl font-extrabold mt-0.5">{subjects.length}</p>
                </div>
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <p className="text-xs text-slate-400">Phần kiến thức</p>
                  <p className="text-xl font-extrabold mt-0.5">{lessons.length}</p>
                </div>
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <p className="text-xs text-slate-400">Flashcards đã thuộc</p>
                  <p className="text-xl font-extrabold text-emerald-400 mt-0.5">
                    {flashcards.length - totalDueCards}/{flashcards.length}
                  </p>
                </div>
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <p className="text-xs text-slate-400">Điểm Test TB</p>
                  <p className="text-xl font-extrabold text-indigo-300 mt-0.5">
                    {avgQuizScore !== null ? `${avgQuizScore}%` : '—'}
                  </p>
                </div>
              </div>
            </section>

            {/* Subject Cards */}
            {loadingData ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium">Đang tải kho kiến thức từ Supabase...</p>
              </div>
            ) : subjects.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
                <GraduationCap className="w-12 h-12 text-indigo-500 mx-auto" />
                <h2 className="text-lg font-bold text-slate-900">Chưa có môn học nào</h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Hãy chạy file <code>supabase_setup.sql</code> trong Supabase SQL Editor để nạp sẵn 2 môn mẫu, hoặc bấm{' '}
                  <strong>"+ Bạn muốn thêm gì vào trang web?"</strong> để nạp bài từ OneNote.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {subjects.map((sub) => {
                  const subLessons = lessons
                    .filter((l) => l.subject_id === sub.id)
                    .sort((a, b) => {
                      const order = { foundation: 1, connected: 2, advanced: 3 };
                      return (order[a.level] || 9) - (order[b.level] || 9) || (a.sort_order || 0) - (b.sort_order || 0);
                    });
                  const subCards = flashcards.filter((c) => c.subject_id === sub.id);
                  const subMastered = subCards.filter((c) => progressMap[c.id] === 'mastered').length;
                  const subPct = subCards.length ? Math.round((subMastered / subCards.length) * 100) : 0;

                  return (
                    <section
                      key={sub.id}
                      className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
                    >
                      {/* Subject Header */}
                      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{sub.title_de}</h2>
                            <button
                              onClick={() => speakGerman(sub.title_de, ttsRate)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Nghe tên môn tiếng Đức"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                          {showVn && sub.title_vn && (
                            <p className="text-sm font-semibold text-indigo-600">{sub.title_vn}</p>
                          )}
                          {sub.description_de && (
                            <p className="text-xs text-slate-500 leading-relaxed pt-0.5">
                              {sub.description_de}
                              {showVn && sub.description_vn ? ` — ${sub.description_vn}` : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-700">
                              {subMastered}/{subCards.length} Flashcards
                            </p>
                            <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${subPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Ordered Lessons List */}
                      <div className="divide-y divide-slate-100">
                        {subLessons.map((les, idx) => {
                          const meta = LEVEL_META[les.level] || LEVEL_META.foundation;
                          const lesCardCount = flashcards.filter((c) => c.lesson_id === les.id).length;
                          const lesQuizCount = quizQuestions.filter((q) => q.lesson_id === les.id).length;
                          const latestAttempt = quizAttempts.find((a) => a.lesson_id === les.id);

                          return (
                            <div
                              key={les.id}
                              onClick={() => openLesson(les.id)}
                              className="p-4 sm:px-6 sm:py-4 hover:bg-indigo-50/40 transition cursor-pointer flex items-center justify-between gap-4 group"
                            >
                              <div className="flex items-start gap-3.5 min-w-0">
                                <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 transition">
                                  {idx + 1}
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}>
                                      {meta.label}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-medium">
                                      {lesCardCount} thẻ · {lesQuizCount} câu test
                                    </span>
                                    {latestAttempt && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                                        <Award className="w-3 h-3" /> {latestAttempt.score_percent}%
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-700 transition leading-snug">
                                    {les.title_de}
                                  </h3>
                                  {showVn && les.title_vn && (
                                    <p className="text-xs text-slate-500 leading-snug">{les.title_vn}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteLesson(les.id, les.title_de);
                                    }}
                                    title="Xóa bài học"
                                    className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== VIEW 2: LESSON STUDY VIEW ==================== */}
        {view === 'lesson' && activeLesson && (
          <div className="space-y-6">
            {/* Breadcrumb Back */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setView('home')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-700 bg-white border border-slate-200 px-3.5 py-2 rounded-xl transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Quay lại danh sách môn học
              </button>
              {activeSubject && (
                <span className="text-xs font-semibold text-slate-500 truncate">{activeSubject.title_de}</span>
              )}
            </div>

            {/* Prominent Lesson Title & General Overview */}
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${
                      (LEVEL_META[activeLesson.level] || LEVEL_META.foundation).badgeClass
                    }`}
                  >
                    {(LEVEL_META[activeLesson.level] || LEVEL_META.foundation).label} ·{' '}
                    {(LEVEL_META[activeLesson.level] || LEVEL_META.foundation).de}
                  </span>
                  <button
                    onClick={() => speakGerman(`${activeLesson.title_de}. ${activeLesson.overview_de}`, ttsRate)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 text-xs font-semibold transition"
                  >
                    <Volume2 className="w-4 h-4" /> Nghe khái quát
                  </button>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  {activeLesson.title_de}
                </h1>
                {showVn && activeLesson.title_vn && (
                  <p className="text-base font-semibold text-indigo-600">{activeLesson.title_vn}</p>
                )}
              </div>

              {/* Overview Box */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Khái quát chung từ tài liệu gốc (Überblick)
                </div>
                <p className="text-sm sm:text-base text-slate-800 leading-relaxed font-medium">
                  {activeLesson.overview_de}
                </p>
                {showVn && activeLesson.overview_vn && (
                  <div className="bg-white border-l-2 border-indigo-400 rounded-r-xl px-4 py-3 text-sm text-slate-600 leading-relaxed">
                    {activeLesson.overview_vn}
                  </div>
                )}
              </div>

              {/* Clean Non-Overlapping 3-Tab Switcher */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {[
                  { id: 'study', label: '1. Học bài', count: `${activeSections.length} mục` },
                  { id: 'cards', label: '2. Flashcards', count: `${activeCards.length} thẻ` },
                  { id: 'quiz', label: '3. Bài Test', count: `${activeQuiz.length} câu` },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setLessonTab(t.id)}
                    className={`py-3 px-3 rounded-2xl text-center border transition ${
                      lessonTab === t.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">{t.label}</div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        lessonTab === t.id ? 'text-indigo-200' : 'text-slate-400'
                      }`}
                    >
                      {t.count}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* TAB 1: DEEP-DIVE SECTIONS + EXPLANATION */}
            {lessonTab === 'study' && (
              <div className="space-y-4">
                {activeSections.map((sec) => {
                  const isExplainOpen = Boolean(openExplainIds[sec.id]);
                  const isExplaining = loadingExplainId === sec.id;

                  return (
                    <article
                      key={sec.id}
                      className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-4"
                    >
                      {/* Section Heading */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h2 className="text-lg font-extrabold text-slate-900 leading-snug">{sec.heading_de}</h2>
                          {showVn && sec.heading_vn && (
                            <p className="text-sm font-semibold text-indigo-600">{sec.heading_vn}</p>
                          )}
                        </div>
                        <button
                          onClick={() => speakGerman(`${sec.heading_de}. ${sec.content_de}`, ttsRate)}
                          title="Nghe đoạn kiến thức gốc tiếng Đức"
                          className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 transition shrink-0"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Original German Text (IHK Wording) */}
                      <div className="text-[15px] sm:text-base text-slate-800 leading-relaxed whitespace-pre-line">
                        {sec.content_de}
                      </div>

                      {/* Vietnamese Translation Underneath */}
                      {showVn && sec.content_vn && (
                        <div className="bg-slate-50 border-l-4 border-l-indigo-400 border border-slate-200/70 rounded-r-2xl px-4 py-3.5 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                          {sec.content_vn}
                        </div>
                      )}

                      {/* "Giải thích dễ hiểu & Ví dụ" Button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleToggleExplain(sec)}
                          disabled={isExplaining}
                          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                            isExplainOpen
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isExplaining ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              AI đang tạo giải thích & ví dụ thực tế...
                            </>
                          ) : (
                            <>
                              <Lightbulb className="w-4 h-4" />
                              {isExplainOpen ? 'Ẩn phần giải thích' : 'Giải thích dễ hiểu & Ví dụ thực tế'}
                            </>
                          )}
                        </button>
                      </div>

                      {/* Expanded Easy Explanation & Example Box */}
                      {isExplainOpen && (sec.explanation_de || sec.explanation_vn) && (
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Giải thích dễ hiểu (Einfach erklärt)
                              </span>
                              {sec.explanation_de && (
                                <button
                                  onClick={() => speakGerman(sec.explanation_de, ttsRate)}
                                  className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-emerald-700"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {sec.explanation_de && (
                              <p className="text-sm font-medium text-slate-900 leading-relaxed">{sec.explanation_de}</p>
                            )}
                            {showVn && sec.explanation_vn && (
                              <p className="text-sm text-emerald-950/90 bg-white/80 border-l-2 border-emerald-500 rounded-r-xl px-3.5 py-2.5 leading-relaxed">
                                {sec.explanation_vn}
                              </p>
                            )}
                          </div>

                          {(sec.example_de || sec.example_vn) && (
                            <div className="pt-3 border-t border-emerald-200/80 space-y-1.5">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-teal-800">
                                Ví dụ thực tế ngành sự kiện (Praxisbeispiel)
                              </span>
                              {sec.example_de && (
                                <p className="text-sm text-slate-800 leading-relaxed">{sec.example_de}</p>
                              )}
                              {showVn && sec.example_vn && (
                                <p className="text-xs text-slate-600 italic leading-relaxed">{sec.example_vn}</p>
                              )}
                            </div>
                          )}

                          {sec.exam_tip_vn && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed">
                              <strong className="font-bold">Mẹo đi thi IHK:</strong> {sec.exam_tip_vn}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}

                {/* Next Step Prompt */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-indigo-950">Đã đọc xong phần lý thuyết?</p>
                    <p className="text-xs text-indigo-700">
                      Chuyển sang lật Flashcard để ghi nhớ thuật ngữ tiếng Đức rồi làm Bài Test kiểm tra điểm số ngay!
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setLessonTab('cards');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-4 py-2.5 bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold rounded-xl transition"
                    >
                      Ôn Flashcards ({activeCards.length})
                    </button>
                    <button
                      onClick={() => {
                        setLessonTab('quiz');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
                    >
                      Làm Bài Test →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: LESSON FLASHCARDS */}
            {lessonTab === 'cards' && (
              <FlashcardDeck
                cards={activeCards}
                progressMap={progressMap}
                onSetMastery={handleSetMastery}
                showVn={showVn}
                ttsRate={ttsRate}
                isAdmin={isAdmin}
                onGenerateMoreCards={handleGenerateMoreCards}
                onAddManualCard={handleAddManualCard}
                onDeleteCard={handleDeleteCard}
              />
            )}

            {/* TAB 3: LESSON QUIZ */}
            {lessonTab === 'quiz' && (
              <QuizPanel
                questions={activeQuiz}
                showVn={showVn}
                ttsRate={ttsRate}
                isAdmin={isAdmin}
                onSaveAttempt={handleSaveQuizAttempt}
                onGenerateNewQuiz={handleGenerateNewQuiz}
              />
            )}
          </div>
        )}

        {/* ==================== VIEW 3: GLOBAL FLASHCARD CENTER ==================== */}
        {view === 'global-cards' && (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">Ôn Flashcard tổng hợp</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tổng hợp toàn bộ thuật ngữ, điều luật và công thức IHK từ tất cả các môn học
                </p>
              </div>
              <select
                value={globalSubjectFilter}
                onChange={(e) => setGlobalSubjectFilter(e.target.value)}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả môn học ({flashcards.length} thẻ)</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title_de} ({flashcards.filter((c) => c.subject_id === s.id).length} thẻ)
                  </option>
                ))}
              </select>
            </div>

            <FlashcardDeck
              cards={globalFilteredCards}
              progressMap={progressMap}
              onSetMastery={handleSetMastery}
              showVn={showVn}
              ttsRate={ttsRate}
              isAdmin={isAdmin}
              onDeleteCard={handleDeleteCard}
              subjectMap={subjectMap}
            />
          </div>
        )}
      </main>

      {/* MODALS */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => showToast('Đăng nhập thành công!')}
        />
      )}

      {showImportModal && (
        <ImportModal
          subjects={subjects}
          onClose={() => setShowImportModal(false)}
          onSaveImportedData={handleSaveImportedData}
        />
      )}
    </div>
  );
}

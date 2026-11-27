import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home,
  BookOpen,
  BookMarked,
  Layers,
  FileCheck2,
  AlertTriangle,
  Search,
  Settings,
  Menu,
  X,
  Plus,
  Volume2,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  ShieldCheck,
  ChevronRight,
  ChevronUp,
  ChevronDown,
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
  Moon,
  Sun,
  Languages,
  Image as ImageIcon,
  PlayCircle,
  ExternalLink,
  Edit3,
  Save,
  StickyNote,
  FolderInput,
  GraduationCap,
  GitMerge,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  Maximize2,
  RotateCw,
  Bot,
  MessageCircle,
  CornerDownRight,
  FileText,
  Tag,
  ArrowUp,
} from 'lucide-react';
import { supabase, isSupabaseConfigured, ADMIN_EMAIL } from './lib/supabase';
import { callGeminiApi } from './lib/api';
import { speakGerman } from './lib/tts';
import {
  LEVEL_META,
  calculateNextSrs,
  isCardDue,
  extractYouTubeId,
} from './lib/seedData';
import RichContent from './components/RichContent';
import WordPopover from './components/WordPopover';
import DiagramRenderer from './components/DiagramRenderer';
import AuthModal from './components/AuthModal';
import ImportModal from './components/ImportModal';
import VocabView from './components/VocabView';
import FlashcardDeck from './components/FlashcardDeck';
import QuizPanel from './components/QuizPanel';
import MockExamCenter from './components/MockExamCenter';
import MistakesAnalyticsView from './components/MistakesAnalyticsView';
import SearchModal from './components/SearchModal';
import SettingsView from './components/SettingsView';
import SectionAiChat from './components/SectionAiChat';
import LessonUpgradeModal from './components/LessonUpgradeModal';

const LOCAL_PREFS_KEY = 'lernplan2028_prefs_v2';
const LOCAL_GUEST_KEY = 'lernplan2028_guest_v2';
const LOCAL_DICT_CACHE_KEY = 'lernplan2028_dict_cache_v2';
const LOCAL_AI_CHATS_KEY = 'lernplan2028_ai_chats_v3';

// Bộ môn chuẩn theo khung Berufsschule (đã lược bỏ sạch tên viết tắt giáo viên như _ZeH, _HsA, _GeM, _MuC, _DoR...)
const SCHOOL_SUBJECT_PRESETS = [
  {
    code: 'VKO',
    title_de: 'VKO · Veranstaltungskonzeption & -organisation',
    title_vn: 'Thiết kế & Tổ chức sự kiện',
    description_de: 'Konzeption, Planung, Durchführung und Nachbereitung von Veranstaltungen',
    description_vn: 'Lên ý tưởng, lập kế hoạch, vận hành và tổng kết sự kiện',
  },
  {
    code: 'BWT',
    title_de: 'BWT · Betriebswirtschaftliche Themen',
    title_vn: 'Kinh tế doanh nghiệp & Quản trị',
    description_de: 'Betriebswirtschaftliche Prozesse, Kalkulation und Unternehmenssteuerung',
    description_vn: 'Quy trình kinh tế doanh nghiệp, quản trị và điều hành',
  },
  {
    code: 'RW',
    title_de: 'RW · Rechnungswesen',
    title_vn: 'Kế toán & Sổ sách (Bilanz, T-Konto, GuV)',
    description_de: 'Buchführung, Eröffnungsbilanz, Bestandskonten, Erfolgskonten, GuV und Schlussbilanz',
    description_vn: 'Hạch toán, Bảng cân đối, Tài khoản chữ T, GuV và Thuế USt/VSt',
  },
  {
    code: 'BuB',
    title_de: 'BuB · Recht & Betriebliche Grundlagen',
    title_vn: 'Luật sự kiện, BGB & Pháp lý doanh nghiệp',
    description_de: 'Rechtsbereiche, Verträge (BGB), Rechtsformen, Handelsregister und Aufbauorganisation',
    description_vn: 'Các lĩnh vực pháp luật, hợp đồng BGB, loại hình doanh nghiệp và cơ cấu tổ chức',
  },
  {
    code: 'IuF',
    title_de: 'IuF · Information & Finanzierung',
    title_vn: 'Thông tin, Đầu tư & Tài chính',
    description_de: 'Informationsverarbeitung, Finanzierung, Investition und Controlling',
    description_vn: 'Xử lý thông tin, nguồn vốn, đầu tư và tài chính sự kiện',
  },
  {
    code: 'Mt',
    title_de: 'Mt · Märkte & Marketing',
    title_vn: 'Thị trường, Giá cả & Marketing',
    description_de: 'Preisbildung, Preiselastizität, Marktformen und Event-Marketing',
    description_vn: 'Hình thành giá, độ co giãn của cầu, mô hình thị trường và Marketing',
  },
  {
    code: 'PuG',
    title_de: 'PuG · Politik und Gesellschaft',
    title_vn: 'Chính trị & Xã hội Đức',
    description_de: 'Strukturprinzipien der BRD, Grundgesetz, Demokratie, Sozialstaat und Wirtschaftspolitik',
    description_vn: 'Hiến pháp Đức (GG), nguyên tắc nhà nước, chính trị và xã hội',
  },
  {
    code: 'D',
    title_de: 'D · Deutsch & Kommunikation',
    title_vn: 'Tiếng Đức & Giao tiếp chuyên môn',
    description_de: 'Geschäftskorrespondenz, Textanalyse, Präsentation und berufliche Kommunikation',
    description_vn: 'Soạn thảo văn bản hành chính, thuyết trình và giao tiếp nghề nghiệp',
  },
];

function parseSubjectTitle(titleDe = '') {
  const raw = String(titleDe || '').trim();
  const match = raw.match(/^([A-Za-zÄÖÜäöüß0-9]{1,6})\s*[·:\-|]\s*(.+)$/);
  if (match) {
    return { code: match[1].trim(), name: match[2].trim() };
  }
  return { code: '', name: raw };
}

// Hỗ trợ lưu & đọc NHIỀU ảnh bản gốc + TÊN FILE GỐC OneNote/PDF trong cùng cột source_image_url (không cần sửa bảng Supabase)
function normalizePhotoList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item, idx) => {
        if (typeof item === 'string' && item.trim()) return { url: item.trim(), label: `Trang ${idx + 1}` };
        if (item && typeof item === 'object' && item.url) return { url: item.url, label: item.label || `Trang ${idx + 1}` };
        return null;
      })
      .filter(Boolean);
  }
  const str = String(input).trim();
  if (!str) return [];
  return [{ url: str, label: 'Trang 1' }];
}

function normalizeSourceFilesList(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const clean = String(item || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  });
  return out;
}

function parseLessonSourceMeta(raw) {
  if (!raw) return { photos: [], sourceFiles: [] };
  if (Array.isArray(raw)) {
    return { photos: normalizePhotoList(raw), sourceFiles: [] };
  }
  if (typeof raw === 'object') {
    return {
      photos: normalizePhotoList(raw.photos),
      sourceFiles: normalizeSourceFilesList(raw.sourceFiles || (raw.sourceFile ? [raw.sourceFile] : [])),
    };
  }
  const str = String(raw).trim();
  if (!str) return { photos: [], sourceFiles: [] };
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return { photos: normalizePhotoList(parsed), sourceFiles: [] };
      }
      if (parsed && typeof parsed === 'object') {
        return {
          photos: normalizePhotoList(parsed.photos),
          sourceFiles: normalizeSourceFilesList(parsed.sourceFiles || (parsed.sourceFile ? [parsed.sourceFile] : [])),
        };
      }
    } catch {
      // fallback single image string
    }
  }
  return { photos: [{ url: str, label: 'Trang 1' }], sourceFiles: [] };
}

function serializeLessonSourceMeta({ photos = [], sourceFiles = [] } = {}) {
  const cleanPhotos = normalizePhotoList(photos);
  const cleanFiles = normalizeSourceFilesList(sourceFiles);
  if (cleanFiles.length === 0) {
    if (cleanPhotos.length === 0) return '';
    if (cleanPhotos.length === 1 && cleanPhotos[0].label === 'Trang 1') {
      return cleanPhotos[0].url;
    }
    return JSON.stringify(cleanPhotos);
  }
  return JSON.stringify({
    v: 2,
    sourceFiles: cleanFiles,
    photos: cleanPhotos,
  });
}

function parseSourceImages(raw) {
  return parseLessonSourceMeta(raw).photos;
}

export default function App() {
  // User Preferences (Dark Mode, Font Scale, Dict Mode, TTS, VN)
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || '{}').darkMode ?? false;
    } catch {
      return false;
    }
  });
  const [fontScale, setFontScale] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || '{}').fontScale || 'md';
    } catch {
      return 'md';
    }
  });
  // Chạm vào bất kỳ từ tiếng Đức nào để tra từ điển luôn bật mặc định
  const dictMode = true;
  const setDictMode = () => {};
  const [showVn, setShowVn] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || '{}').showVn ?? true;
    } catch {
      return true;
    }
  });
  const [ttsRate, setTtsRate] = useState(1.0);

  // Apply Dark Mode & Font Scale to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');

    root.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg');
    root.classList.add(`font-scale-${fontScale}`);

    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify({ darkMode, fontScale, showVn }));
  }, [darkMode, fontScale, showVn]);

  // Auth
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Navigation & Menus
  // Views: 'home' | 'subjects' | 'lesson' | 'vocab' | 'flashcards' | 'exams' | 'mistakes' | 'settings'
  const [view, setView] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUpgradeLessonModal, setShowUpgradeLessonModal] = useState(false);

  // Active lesson state
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [lessonTab, setLessonTab] = useState('study'); // 'study' | 'vocab' | 'cards' | 'quiz'
  const [globalCardSubjectFilter, setGlobalCardSubjectFilter] = useState('all');

  // Shared Curriculum Data
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [sections, setSections] = useState([]);
  const [vocabularies, setVocabularies] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [mockExams, setMockExams] = useState([]);
  const [mockExamQuestions, setMockExamQuestions] = useState([]);

  // Private User Data
  const [progressMap, setProgressMap] = useState({}); // { [cardId]: { status, interval_days, next_review_at, repetitions, ease_factor } }
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [sectionNotes, setSectionNotes] = useState({}); // { [sectionId]: string }
  const [wrongQuestions, setWrongQuestions] = useState([]);
  // Hội thoại Gia sư AI lưu riêng biệt theo từng contextKey (section:<id>, quiz:<lessonId>, mistakes:global)
  const [aiChatsMap, setAiChatsMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_AI_CHATS_KEY) || '{}') || {};
    } catch {
      return {};
    }
  });
  const [aiChatCloudReady, setAiChatCloudReady] = useState(false);
  const [openChatKeys, setOpenChatKeys] = useState({});
  const [pendingChatQuotes, setPendingChatQuotes] = useState({});
  const [lessonSelectionPopup, setLessonSelectionPopup] = useState(null); // null | { sectionId, text, top, left }
  const [examChatExamId, setExamChatExamId] = useState('all');

  // Dictionary Cache & Popover State (lưu sẵn localStorage để tra lại mất 0ms)
  const [dictCache, setDictCache] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_DICT_CACHE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }); // { [wordKey]: entry }
  const [wordLookup, setWordLookup] = useState(null); // { word, loading, data, error, saved }

  // Lesson Study UI State
  const [showBoardPhoto, setShowBoardPhoto] = useState(false);
  const [boardLightboxIndex, setBoardLightboxIndex] = useState(null); // null | number
  const [boardLightboxZoom, setBoardLightboxZoom] = useState(1);
  const [boardLightboxRotate, setBoardLightboxRotate] = useState(0);
  const [boardDragOffsetY, setBoardDragOffsetY] = useState(0);
  const [boardIsPanning, setBoardIsPanning] = useState(false);

  // Trạng thái vuốt cạnh trái (iPhone) & nút Lên đầu trang mượt mà
  const [edgeSwipeProgress, setEdgeSwipeProgress] = useState(0); // 0 -> 1
  const [showScrollTop, setShowScrollTop] = useState(false);

  const isPoppingHistoryRef = useRef(false);
  const boardStageRef = useRef(null);
  const boardWheelFlipRef = useRef(0);
  const boardPanRef = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const boardTouchRef = useRef({ mode: null, startX: 0, startY: 0, startDist: 0, startZoom: 1, moved: false });
  const edgeSwipeRef = useRef({ active: false, startX: 0, startY: 0, triggered: false });
  const drawerTouchRef = useRef({ active: false, startX: 0, startY: 0 });
  const wordLookupSeqRef = useRef(0);
  const [openExplainIds, setOpenExplainIds] = useState({});
  const [loadingExplainId, setLoadingExplainId] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editSectionDraft, setEditSectionDraft] = useState({});
  const [videoInputSectionId, setVideoInputSectionId] = useState(null);
  const [videoDraft, setVideoDraft] = useState({ title: '', url: '' });
  const [movingLessonId, setMovingLessonId] = useState(null);
  const [editingSourceTagLessonId, setEditingSourceTagLessonId] = useState(null);
  const [editSourceTagDraft, setEditSourceTagDraft] = useState('');

  // Subject Organization & Management State
  const [importDefaultSubjectId, setImportDefaultSubjectId] = useState('');
  const [subjectFilterId, setSubjectFilterId] = useState('all');
  const [subjectLessonSearch, setSubjectLessonSearch] = useState('');
  const [collapsedSubjectIds, setCollapsedSubjectIds] = useState({});
  const [showCreateSubjectForm, setShowCreateSubjectForm] = useState(false);
  const [showPresetSubjects, setShowPresetSubjects] = useState(false);
  const [newSubjectDraft, setNewSubjectDraft] = useState({ code: '', title_de: '', title_vn: '' });
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [editSubjectDraft, setEditSubjectDraft] = useState({ code: '', title_de: '', title_vn: '' });
  const [mergingSubjectId, setMergingSubjectId] = useState(null);
  const [busySubjectAction, setBusySubjectAction] = useState(false);

  // Toast & JSON Import
  const [toast, setToast] = useState(null);
  const importJsonRef = useRef(null);

  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // ==================== LỊCH SỬ DUYỆT TRANG NATIVE (VUỐT 2 NGÓN MACBOOK BACK / FORWARD + IPHONE) ====================
  const pushAppHistory = (nextState) => {
    if (typeof window === 'undefined' || isPoppingHistoryRef.current) return;
    const cur = window.history.state;
    const payload = {
      lpNav: true,
      view: nextState.view ?? view,
      activeLessonId: nextState.activeLessonId !== undefined ? nextState.activeLessonId : activeLessonId,
      lessonTab: nextState.lessonTab ?? lessonTab,
      overlay: nextState.overlay ?? null,
    };
    if (
      cur?.lpNav &&
      cur.view === payload.view &&
      cur.activeLessonId === payload.activeLessonId &&
      cur.lessonTab === payload.lessonTab &&
      cur.overlay === payload.overlay
    ) {
      return;
    }
    try {
      window.history.pushState(payload, '');
    } catch {
      // ignore sandbox history limits
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!window.history.state?.lpNav) {
      try {
        window.history.replaceState(
          { lpNav: true, view: 'home', activeLessonId: null, lessonTab: 'study', overlay: null },
          ''
        );
      } catch {
        // ignore
      }
    }

    const onPopState = (e) => {
      const st = e.state;
      if (!st?.lpNav) return;
      isPoppingHistoryRef.current = true;

      setView(st.view || 'home');
      setActiveLessonId(st.activeLessonId || null);
      setLessonTab(st.lessonTab || 'study');

      const ov = st.overlay || null;
      setBoardLightboxIndex((prev) => (ov === 'lightbox' ? (prev ?? 0) : null));
      setShowImportModal(ov === 'import');
      setShowUpgradeLessonModal(ov === 'upgrade');
      setShowSearchModal(ov === 'search');
      setShowAuthModal(ov === 'auth');
      setMobileMenuOpen(ov === 'menu');

      setWordLookup(null);
      setLessonSelectionPopup(null);
      setBoardDragOffsetY(0);

      setTimeout(() => {
        isPoppingHistoryRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openOverlay = (overlayName, openerFn) => {
    openerFn();
    pushAppHistory({ overlay: overlayName });
  };

  const closeOverlay = (overlayName, closerFn) => {
    closerFn();
    if (typeof window !== 'undefined' && window.history.state?.lpNav && window.history.state?.overlay === overlayName) {
      window.history.back();
    }
  };

  const openBoardLightbox = (idx) => {
    setBoardLightboxZoom(1);
    setBoardLightboxRotate(0);
    setBoardDragOffsetY(0);
    openOverlay('lightbox', () => setBoardLightboxIndex(idx));
  };

  const closeBoardLightbox = () => {
    setBoardDragOffsetY(0);
    closeOverlay('lightbox', () => setBoardLightboxIndex(null));
  };

  const goBackSmart = () => {
    if (boardLightboxIndex !== null) {
      closeBoardLightbox();
      return;
    }
    if (wordLookup) {
      setWordLookup(null);
      return;
    }
    if (mobileMenuOpen) {
      closeOverlay('menu', () => setMobileMenuOpen(false));
      return;
    }
    if (showSearchModal) {
      closeOverlay('search', () => setShowSearchModal(false));
      return;
    }
    if (showAuthModal) {
      closeOverlay('auth', () => setShowAuthModal(false));
      return;
    }
    if (typeof window !== 'undefined' && window.history.state?.lpNav && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (view === 'lesson') {
      navigate('subjects');
    } else if (view !== 'home') {
      navigate('home');
    }
  };

  // Phím tắt toàn cục: Cmd+K tìm nhanh, Esc thông minh đóng lớp trên cùng
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (showSearchModal) {
          closeOverlay('search', () => setShowSearchModal(false));
        } else {
          openOverlay('search', () => setShowSearchModal(true));
        }
        return;
      }
      if (e.key === 'Escape') {
        if (boardLightboxIndex !== null) return; // Lightbox tự xử lý Esc
        if (showImportModal || showUpgradeLessonModal) return; // Modal tự xử lý Esc
        if (wordLookup) {
          e.preventDefault();
          setWordLookup(null);
        } else if (mobileMenuOpen) {
          e.preventDefault();
          closeOverlay('menu', () => setMobileMenuOpen(false));
        } else if (showSearchModal) {
          e.preventDefault();
          closeOverlay('search', () => setShowSearchModal(false));
        } else if (showAuthModal) {
          e.preventDefault();
          closeOverlay('auth', () => setShowAuthModal(false));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardLightboxIndex, wordLookup, mobileMenuOpen, showSearchModal, showAuthModal, showImportModal, showUpgradeLessonModal]);

  // Bấm vào khoảng trống bên ngoài bảng Tra từ điển (WordPopover) -> tự đóng gọn
  useEffect(() => {
    if (!wordLookup) return undefined;
    const onOutsideDown = (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.word-popover-wrap, [data-word-token="true"]')) return;
      // Nếu người dùng bấm vào một từ tiếng Đức khác (role=button có title dịch từ) thì không đóng trước
      if (target.closest('[title^="Bấm để dịch từ"]')) return;
      setWordLookup(null);
    };
    document.addEventListener('mousedown', onOutsideDown);
    return () => document.removeEventListener('mousedown', onOutsideDown);
  }, [wordLookup]);

  // Hiện nút "Lên đầu trang" khi cuộn sâu xuống dưới
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cử chỉ vuốt từ cạnh trái màn hình cảm ứng (iPhone/iPad) để Quay lại trang trước hoặc Mở menu
  useEffect(() => {
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      if (boardLightboxIndex !== null || showImportModal || showUpgradeLessonModal || showSearchModal || showAuthModal) {
        return;
      }
      const t = e.touches[0];
      if (t.clientX <= 34) {
        edgeSwipeRef.current = { active: true, startX: t.clientX, startY: t.clientY, triggered: false };
      } else {
        edgeSwipeRef.current = { active: false, startX: 0, startY: 0, triggered: false };
      }
    };
    const onTouchMove = (e) => {
      const st = edgeSwipeRef.current;
      if (!st.active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - st.startX;
      const dy = Math.abs(t.clientY - st.startY);
      if (dy > 48 && dx < 40) {
        st.active = false;
        setEdgeSwipeProgress(0);
        return;
      }
      if (dx > 12 && dx > dy * 1.35) {
        setEdgeSwipeProgress(Math.min(1, dx / 92));
      }
    };
    const onTouchEnd = (e) => {
      const st = edgeSwipeRef.current;
      if (!st.active) return;
      const t = e.changedTouches?.[0];
      const dx = t ? t.clientX - st.startX : 0;
      const dy = t ? Math.abs(t.clientY - st.startY) : 999;
      edgeSwipeRef.current = { active: false, startX: 0, startY: 0, triggered: false };
      setEdgeSwipeProgress(0);

      if (dx > 68 && dx > dy * 1.45) {
        if (view === 'home' && !mobileMenuOpen) {
          openOverlay('menu', () => setMobileMenuOpen(true));
        } else if (view !== 'home') {
          goBackSmart();
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [view, mobileMenuOpen, boardLightboxIndex, showImportModal, showUpgradeLessonModal, showSearchModal, showAuthModal]);

  // Tô đen bất kỳ đoạn chữ nào trong phần bài học -> hiện nút nổi "↳ Hỏi Gia sư AI" giống Gemini
  useEffect(() => {
    if (view !== 'lesson' || lessonTab !== 'study') {
      setLessonSelectionPopup(null);
      return undefined;
    }

    const detectSectionSelection = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setLessonSelectionPopup(null);
          return;
        }
        const selectedStr = sel.toString().replace(/\s+/g, ' ').trim();
        if (selectedStr.length < 3) {
          setLessonSelectionPopup(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        const anchorEl = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
        if (!anchorEl) {
          setLessonSelectionPopup(null);
          return;
        }

        // Bỏ qua nếu đang tô đen bên trong khung chat (khung chat có nút nổi riêng) hoặc trong ô nhập liệu
        if (anchorEl.closest('.section-ai-chat-root, input, textarea')) {
          setLessonSelectionPopup(null);
          return;
        }

        const sectionArticle = anchorEl.closest('[data-ai-section-id]');
        if (!sectionArticle) {
          setLessonSelectionPopup(null);
          return;
        }

        const sectionId = sectionArticle.getAttribute('data-ai-section-id');
        if (!sectionId) return;

        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          setLessonSelectionPopup(null);
          return;
        }

        const top = rect.top > 56 ? rect.top - 44 : rect.bottom + 8;
        const left = Math.min(Math.max(rect.left + rect.width / 2, 92), window.innerWidth - 92);
        setLessonSelectionPopup({
          sectionId,
          text: selectedStr.slice(0, 600),
          top,
          left,
        });
      }, 20);
    };

    const hidePopup = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      setLessonSelectionPopup(null);
    };

    document.addEventListener('mouseup', detectSectionSelection);
    document.addEventListener('touchend', detectSectionSelection);
    window.addEventListener('scroll', hidePopup, true);
    window.addEventListener('keydown', hidePopup);
    return () => {
      document.removeEventListener('mouseup', detectSectionSelection);
      document.removeEventListener('touchend', detectSectionSelection);
      window.removeEventListener('scroll', hidePopup, true);
      window.removeEventListener('keydown', hidePopup);
    };
  }, [view, lessonTab]);

  const handleAskTutorFromLessonHighlight = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lessonSelectionPopup?.sectionId || !lessonSelectionPopup?.text) return;
    const { sectionId, text } = lessonSelectionPopup;
    const chatKey = `section:${sectionId}`;
    setOpenChatKeys((prev) => ({ ...prev, [chatKey]: true }));
    setPendingChatQuotes((prev) => ({ ...prev, [chatKey]: text }));
    setLessonSelectionPopup(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
    setTimeout(() => {
      const anchor = document.getElementById(`ai-chat-anchor-${sectionId}`);
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const daysToExam = useMemo(() => {
    const examDate = new Date('2028-05-01T08:00:00Z');
    return Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }, []);

  // Auth listener
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data?.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user || null);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // Load All Shared Curriculum Data
  const loadCurriculum = async () => {
    if (!supabase) {
      setLoadingData(false);
      setDataError('Chưa cấu hình biến môi trường Supabase trên Vercel.');
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

      const coreErr = subRes.error || lesRes.error || secRes.error || fcRes.error || qRes.error;
      if (coreErr) throw coreErr;

      setSubjects(subRes.data || []);
      setLessons(lesRes.data || []);
      setSections(secRes.data || []);
      setFlashcards(fcRes.data || []);
      setQuizQuestions(qRes.data || []);

      // Load v2 tables gracefully (in case user hasn't run supabase_upgrade_v2.sql yet)
      const [vocRes, exRes, exQRes, dictRes] = await Promise.all([
        supabase.from('vocabularies').select('*').order('created_at', { ascending: true }),
        supabase.from('mock_exams').select('*').order('created_at', { ascending: false }),
        supabase.from('mock_exam_questions').select('*').order('sort_order', { ascending: true }),
        supabase.from('dictionary_cache').select('*').limit(1000),
      ]);

      if (!vocRes.error) setVocabularies(vocRes.data || []);
      if (!exRes.error) setMockExams(exRes.data || []);
      if (!exQRes.error) setMockExamQuestions(exQRes.data || []);
      if (!dictRes.error && dictRes.data) {
        setDictCache((prev) => {
          const merged = { ...prev };
          dictRes.data.forEach((d) => {
            if (d?.word_key) merged[d.word_key] = d;
          });
          try {
            localStorage.setItem(LOCAL_DICT_CACHE_KEY, JSON.stringify(merged));
          } catch {
            // ignore quota
          }
          return merged;
        });
      }
      if (vocRes.error || exRes.error) {
        setDataError(
          'Bạn cần chạy thêm file supabase_upgrade_v2.sql trong Supabase SQL Editor để kích hoạt bảng Từ vựng, Từ điển, Đề thi cũ và Kho câu sai!'
        );
      }
    } catch (err) {
      setDataError(err.message || 'Không thể tải dữ liệu từ Supabase.');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadCurriculum();
  }, []);

  // Load Private User Data (SRS Progress, Quiz Attempts, Personal Notes, Mistakes)
  useEffect(() => {
    const loadPrivate = async () => {
      if (user && supabase) {
        const [fcProg, qaRes, notesRes, wrongRes, chatsRes] = await Promise.all([
          supabase.from('user_flashcard_progress').select('*').eq('user_id', user.id),
          supabase.from('user_quiz_attempts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(80),
          supabase.from('user_section_notes').select('*').eq('user_id', user.id),
          supabase.from('user_wrong_questions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('user_ai_chats').select('context_key, messages, updated_at').eq('user_id', user.id),
        ]);

        const pMap = {};
        (fcProg.data || []).forEach((r) => {
          pMap[r.flashcard_id] = {
            status: r.status || 'new',
            interval_days: r.interval_days || 0,
            next_review_at: r.next_review_at || null,
            repetitions: r.repetitions || 0,
            ease_factor: r.ease_factor || 2.5,
          };
        });
        setProgressMap(pMap);
        setQuizAttempts(qaRes.data || []);

        if (!notesRes.error) {
          const nMap = {};
          (notesRes.data || []).forEach((n) => {
            nMap[n.section_id] = n.note_text || '';
          });
          setSectionNotes(nMap);
        }
        if (!wrongRes.error) {
          setWrongQuestions(wrongRes.data || []);
        }
        if (!chatsRes.error) {
          setAiChatCloudReady(true);
          setAiChatsMap((prev) => {
            const merged = { ...prev };
            (chatsRes.data || []).forEach((row) => {
              if (row?.context_key && Array.isArray(row.messages)) {
                merged[row.context_key] = row.messages;
              }
            });
            try {
              localStorage.setItem(LOCAL_AI_CHATS_KEY, JSON.stringify(merged));
            } catch {
              // ignore storage quota
            }
            return merged;
          });
        } else {
          setAiChatCloudReady(false);
        }
      } else {
        setAiChatCloudReady(false);
        try {
          const g = JSON.parse(localStorage.getItem(LOCAL_GUEST_KEY) || '{}');
          setProgressMap(g.progressMap || {});
          setQuizAttempts(g.quizAttempts || []);
          setSectionNotes(g.sectionNotes || {});
          setWrongQuestions(g.wrongQuestions || []);
        } catch {
          setProgressMap({});
          setQuizAttempts([]);
          setSectionNotes({});
          setWrongQuestions([]);
        }
      }
    };
    loadPrivate();
  }, [user]);

  const persistGuest = (partial) => {
    try {
      const current = JSON.parse(localStorage.getItem(LOCAL_GUEST_KEY) || '{}');
      localStorage.setItem(LOCAL_GUEST_KEY, JSON.stringify({ ...current, ...partial }));
    } catch {
      // ignore storage quota
    }
  };

  // Derived data
  const subjectMap = useMemo(() => {
    const m = {};
    subjects.forEach((s) => (m[s.id] = s.title_de));
    return m;
  }, [subjects]);

  const activeLesson = useMemo(() => lessons.find((l) => l.id === activeLessonId) || null, [lessons, activeLessonId]);
  const activeSubject = useMemo(
    () => subjects.find((s) => s.id === activeLesson?.subject_id) || null,
    [subjects, activeLesson]
  );
  const activeSourceMeta = useMemo(
    () => parseLessonSourceMeta(activeLesson?.source_image_url),
    [activeLesson]
  );
  const activeSourceImages = activeSourceMeta.photos;
  const activeSourceFiles = activeSourceMeta.sourceFiles;

  // Map nhanh lessonId -> danh sách tên file gốc (để hiện badge, tìm kiếm và cảnh báo nạp trùng)
  const lessonSourceFilesMap = useMemo(() => {
    const m = {};
    lessons.forEach((l) => {
      m[l.id] = parseLessonSourceMeta(l.source_image_url).sourceFiles;
    });
    return m;
  }, [lessons]);

  const existingLessonsForImport = useMemo(
    () =>
      lessons.map((l) => ({
        id: l.id,
        subject_id: l.subject_id,
        title_de: l.title_de,
        sourceFiles: lessonSourceFilesMap[l.id] || [],
      })),
    [lessons, lessonSourceFilesMap]
  );

  // Phím tắt Esc / Mũi tên / +/- / 0 / R cho Lightbox xem ảnh bản gốc toàn màn hình
  useEffect(() => {
    if (boardLightboxIndex === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeBoardLightbox();
      } else if (e.key === 'ArrowLeft' && boardLightboxIndex > 0) {
        e.preventDefault();
        setBoardLightboxZoom(1);
        setBoardLightboxRotate(0);
        setBoardLightboxIndex((idx) => (idx !== null && idx > 0 ? idx - 1 : idx));
      } else if (e.key === 'ArrowRight' && boardLightboxIndex < activeSourceImages.length - 1) {
        e.preventDefault();
        setBoardLightboxZoom(1);
        setBoardLightboxRotate(0);
        setBoardLightboxIndex((idx) => (idx !== null && idx < activeSourceImages.length - 1 ? idx + 1 : idx));
      } else if (e.key === '+' || e.key === '=') {
        setBoardLightboxZoom((z) => Math.min(3.5, Number((z + 0.4).toFixed(2))));
      } else if (e.key === '-') {
        setBoardLightboxZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))));
      } else if (e.key === '0') {
        setBoardLightboxZoom(1);
        setBoardLightboxRotate(0);
      } else if (e.key === 'r' || e.key === 'R') {
        setBoardLightboxRotate((r) => (r + 90) % 360);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boardLightboxIndex, activeSourceImages.length]);

  // MacBook Trackpad Pinch-to-Zoom (ctrl+wheel) & Vuốt ngang 2 ngón lật trang trong Lightbox xem ảnh gốc
  useEffect(() => {
    const el = boardStageRef.current;
    if (!el || boardLightboxIndex === null) return undefined;

    const onWheel = (e) => {
      // 1. Chụm / banh 2 ngón trên Trackpad MacBook -> phóng to / thu nhỏ mượt
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.012;
        setBoardLightboxZoom((z) => Math.min(3.5, Math.max(1, Number((z + delta).toFixed(2)))));
        return;
      }

      // 2. Khi ảnh đang vừa khung (zoom = 1): vuốt ngang 2 ngón lật trang trước/sau
      // (Ở Trang 1 nếu vuốt phải thì KHÔNG chặn để macOS Back tự động đóng Lightbox!)
      if (boardLightboxZoom <= 1.02 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.4 && Math.abs(e.deltaX) > 26) {
        const now = Date.now();
        const goingNext = e.deltaX > 0;
        const goingPrev = e.deltaX < 0;
        if (goingNext && boardLightboxIndex < activeSourceImages.length - 1) {
          e.preventDefault();
          if (now - boardWheelFlipRef.current > 360) {
            boardWheelFlipRef.current = now;
            setBoardLightboxZoom(1);
            setBoardLightboxRotate(0);
            setBoardLightboxIndex((idx) => Math.min(activeSourceImages.length - 1, idx + 1));
          }
        } else if (goingPrev && boardLightboxIndex > 0) {
          e.preventDefault();
          if (now - boardWheelFlipRef.current > 360) {
            boardWheelFlipRef.current = now;
            setBoardLightboxZoom(1);
            setBoardLightboxRotate(0);
            setBoardLightboxIndex((idx) => Math.max(0, idx - 1));
          }
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [boardLightboxIndex, boardLightboxZoom, activeSourceImages.length]);
  const activeSections = useMemo(
    () => sections.filter((s) => s.lesson_id === activeLessonId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [sections, activeLessonId]
  );
  const activeVocabs = useMemo(
    () => vocabularies.filter((v) => v.lesson_id === activeLessonId),
    [vocabularies, activeLessonId]
  );
  const activeCards = useMemo(() => flashcards.filter((c) => c.lesson_id === activeLessonId), [flashcards, activeLessonId]);
  const activeQuiz = useMemo(
    () => quizQuestions.filter((q) => q.lesson_id === activeLessonId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [quizQuestions, activeLessonId]
  );

  const dueCardsCount = useMemo(
    () => flashcards.filter((c) => isCardDue(progressMap[c.id])).length,
    [flashcards, progressMap]
  );
  const unresolvedMistakesCount = useMemo(
    () => wrongQuestions.filter((m) => !m.resolved).length,
    [wrongQuestions]
  );

  // ==================== CLICK-TO-TRANSLATE & FULL GERMAN-VIETNAMESE DICTIONARY ENGINE ====================
  const lookupWordCore = async (cleaned, contextSentence = '') => {
    const key = cleaned.toLowerCase();

    // Tầng 1 (0ms): Đã có trong cache bộ nhớ / localStorage / Supabase
    if (dictCache[key]) {
      return { entry: dictCache[key], alreadyInVocab: false };
    }

    // Tầng 2 (0ms): Khớp trực tiếp hoặc khớp dạng số nhiều trong kho Từ vựng IHK
    const vocabMatch = vocabularies.find((v) => {
      const w = (v.word_de || '').trim().toLowerCase();
      if (!w) return false;
      if (w === key) return true;
      const pl = (v.plural || '').replace(/^die\s+/i, '').trim().toLowerCase();
      return Boolean(pl && pl === key);
    });
    if (vocabMatch) {
      return {
        entry: {
          word_key: key,
          lemma_de: vocabMatch.word_de || cleaned,
          article: vocabMatch.article || '',
          plural: vocabMatch.plural || '',
          word_type: vocabMatch.word_type || 'Fachbegriff',
          meaning_vn: vocabMatch.meaning_vn || '',
          example_de: vocabMatch.example_de || '',
          example_vn: vocabMatch.example_vn || '',
          grammar_note_vn: vocabMatch.grammar_note_vn || '',
        },
        alreadyInVocab: true,
      };
    }

    // Tầng 3 (~0.25s): Gọi Groq Instant (có tự thử lại 1 lần nếu nghẽn mạng ngắn)
    let data = null;
    try {
      data = await callGeminiApi('lookup_word', { word: cleaned, contextSentence });
    } catch {
      await new Promise((r) => setTimeout(r, 350));
      data = await callGeminiApi('lookup_word', { word: cleaned, contextSentence });
    }

    const entry = {
      word_key: key,
      lemma_de: data?.lemma_de || cleaned,
      article: data?.article || '',
      plural: data?.plural || '',
      word_type: data?.word_type || 'Fachbegriff',
      meaning_vn: data?.meaning_vn || '',
      example_de: data?.example_de || '',
      example_vn: data?.example_vn || '',
      grammar_note_vn: data?.grammar_note_vn || '',
    };

    setDictCache((prev) => {
      const next = {
        ...prev,
        [key]: entry,
        ...(entry.lemma_de ? { [entry.lemma_de.toLowerCase()]: entry } : {}),
      };
      try {
        localStorage.setItem(LOCAL_DICT_CACHE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });

    if (supabase) {
      supabase.from('dictionary_cache').upsert(entry, { onConflict: 'word_key' }).then(() => {});
    }
    return { entry, alreadyInVocab: false };
  };

  const handleWordClick = async (rawWord, contextSentence = '') => {
    // Nếu người dùng đang kéo chuột tô đen nhiều chữ để bấm "↳ Hỏi Gia sư AI", không bật popup tra 1 từ
    if (typeof window !== 'undefined') {
      const selStr = (window.getSelection()?.toString() || '').trim();
      if (selStr.length >= 2) return;
    }
    const cleaned = String(rawWord || '').trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();

    const reqSeq = ++wordLookupSeqRef.current;

    // Trả về 0ms ngay lập tức nếu đã có sẵn trong cache
    if (dictCache[key]) {
      setWordLookup({ word: cleaned, loading: false, data: dictCache[key], error: '', saved: false });
      return;
    }

    setWordLookup({ word: cleaned, loading: true, data: null, error: '', saved: false });
    try {
      const { entry, alreadyInVocab } = await lookupWordCore(cleaned, contextSentence);
      if (wordLookupSeqRef.current !== reqSeq) return; // Tránh đè kết quả nếu user vừa bấm sang từ khác
      setWordLookup({ word: cleaned, loading: false, data: entry, error: '', saved: alreadyInVocab });
    } catch (err) {
      if (wordLookupSeqRef.current !== reqSeq) return;
      setWordLookup({
        word: cleaned,
        loading: false,
        data: null,
        error: err.message || 'Tạm chưa dịch được từ này, bạn thử bấm lại nhé.',
        saved: false,
      });
    }
  };

  // Tra cứu trực tiếp trong mục Từ điển Đức–Việt (VocabView)
  const handleDirectDictionaryLookup = async (queryText) => {
    const cleaned = String(queryText || '').trim();
    if (!cleaned) throw new Error('Vui lòng nhập từ cần tra.');
    const { entry } = await lookupWordCore(cleaned, '');
    return entry;
  };

  const handleSavePopoverWordToLessonVocab = async (entry) => {
    if (!isAdmin || !supabase || !activeLesson) return;
    const { error } = await supabase.from('vocabularies').insert({
      subject_id: activeLesson.subject_id,
      lesson_id: activeLesson.id,
      word_de: entry.lemma_de || wordLookup?.word || '',
      article: entry.article || '',
      plural: entry.plural || '',
      word_type: entry.word_type || 'Fachbegriff',
      meaning_vn: entry.meaning_vn || '',
      example_de: entry.example_de || '',
      example_vn: entry.example_vn || '',
      grammar_note_vn: entry.grammar_note_vn || '',
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setWordLookup((prev) => (prev ? { ...prev, saved: true } : null));
    await loadCurriculum();
    showToast(`Đã lưu "${entry.lemma_de}" vào mục Từ vựng của bài!`);
  };

  // ==================== FLASHCARD SRS HANDLER ====================
  const handleSetMastery = async (flashcardId, status) => {
    const nextRec = calculateNextSrs(progressMap[flashcardId], status);
    const nextMap = { ...progressMap, [flashcardId]: nextRec };
    setProgressMap(nextMap);

    if (user && supabase) {
      await supabase.from('user_flashcard_progress').upsert(
        {
          user_id: user.id,
          flashcard_id: flashcardId,
          ...nextRec,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,flashcard_id' }
      );
    } else {
      persistGuest({ progressMap: nextMap });
    }
  };

  // ==================== QUIZ ATTEMPT & MISTAKE BANK ====================
  const handleSaveQuizAttempt = async (scorePercent, details) => {
    if (!activeLessonId) return;
    const temp = {
      id: `local-${Date.now()}`,
      lesson_id: activeLessonId,
      score_percent: scorePercent,
      details,
      created_at: new Date().toISOString(),
    };
    const next = [temp, ...quizAttempts];
    setQuizAttempts(next);

    if (user && supabase) {
      const { data } = await supabase
        .from('user_quiz_attempts')
        .insert({ user_id: user.id, lesson_id: activeLessonId, score_percent: scorePercent, details })
        .select()
        .single();
      if (data) setQuizAttempts([data, ...quizAttempts]);
    } else {
      persistGuest({ quizAttempts: next });
    }
  };

  const handleLogMistakes = async (mistakes, sourceType = 'lesson') => {
    if (!mistakes?.length) return;
    const rows = mistakes.map((m) => ({
      source_type: sourceType,
      question_id: String(m.question.id),
      subject_id: activeLesson?.subject_id || null,
      lesson_id: sourceType === 'lesson' ? activeLessonId : m.question.lesson_id || null,
      question_snapshot: m.question,
      user_answer: m.userAnswer || '',
      feedback_vn: m.feedbackVn || '',
      resolved: false,
    }));

    if (user && supabase) {
      const { data } = await supabase
        .from('user_wrong_questions')
        .insert(rows.map((r) => ({ ...r, user_id: user.id })))
        .select();
      if (data) setWrongQuestions((prev) => [...data, ...prev]);
    } else {
      const guestRows = rows.map((r, i) => ({ ...r, id: `gm-${Date.now()}-${i}`, created_at: new Date().toISOString() }));
      const next = [...guestRows, ...wrongQuestions];
      setWrongQuestions(next);
      persistGuest({ wrongQuestions: next });
    }
  };

  const handleToggleResolveMistake = async (id, resolved) => {
    const next = wrongQuestions.map((m) => (m.id === id ? { ...m, resolved } : m));
    setWrongQuestions(next);
    if (user && supabase) {
      await supabase.from('user_wrong_questions').update({ resolved }).eq('id', id);
    } else {
      persistGuest({ wrongQuestions: next });
    }
  };

  // ==================== PERSONAL SECTION NOTES ====================
  const handleSaveSectionNote = async (sectionId, text) => {
    const next = { ...sectionNotes, [sectionId]: text };
    setSectionNotes(next);
    if (user && supabase) {
      await supabase.from('user_section_notes').upsert(
        { user_id: user.id, section_id: sectionId, note_text: text, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,section_id' }
      );
    } else {
      persistGuest({ sectionNotes: next });
    }
    showToast('Đã lưu ghi chú cá nhân.');
  };

  // ==================== AI TUTOR CHAT PERSISTENCE (TÁCH BIỆT THEO TỪNG MỤC HỌC) ====================
  const handleUpdateAiChat = (contextKey, nextMessages, meta = {}) => {
    const safeList = Array.isArray(nextMessages) ? nextMessages : [];
    setAiChatsMap((prev) => {
      const next = { ...prev };
      if (safeList.length === 0) {
        delete next[contextKey];
      } else {
        next[contextKey] = safeList;
      }
      try {
        localStorage.setItem(LOCAL_AI_CHATS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota
      }
      return next;
    });

    if (user && supabase) {
      if (safeList.length === 0) {
        supabase
          .from('user_ai_chats')
          .delete()
          .eq('user_id', user.id)
          .eq('context_key', contextKey)
          .then(({ error }) => {
            if (!error) setAiChatCloudReady(true);
          });
      } else {
        supabase
          .from('user_ai_chats')
          .upsert(
            {
              user_id: user.id,
              context_key: contextKey,
              context_type: meta.contextType || 'section',
              title: String(meta.title || '').slice(0, 180),
              messages: safeList,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,context_key' }
          )
          .then(({ error }) => {
            if (!error) setAiChatCloudReady(true);
          });
      }
    }
  };

  const handlePinAiReplyToSectionNote = async (sectionId, replyText) => {
    const cleanReply = String(replyText || '').trim();
    if (!cleanReply) return;
    const existing = (sectionNotes[sectionId] || '').trim();
    const combined = existing
      ? `${existing}

--- Ghi chú từ Gia sư AI ---
${cleanReply}`
      : `[Gia sư AI]:
${cleanReply}`;
    await handleSaveSectionNote(sectionId, combined);
    showToast('Đã ghim câu trả lời của Gia sư AI vào Ghi chú cá nhân!');
  };

  // ==================== SECTION EXPLANATION & INLINE ADMIN EDIT & VIDEO EMBED ====================
  const handleToggleExplain = async (sec) => {
    if (openExplainIds[sec.id]) {
      setOpenExplainIds((prev) => ({ ...prev, [sec.id]: false }));
      return;
    }
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
      const updated = {
        explanation_de: data.explanation_de || '',
        explanation_vn: data.explanation_vn || '',
        example_de: data.example_de || '',
        example_vn: data.example_vn || '',
        exam_tip_vn: data.exam_tip_vn || '',
      };
      setSections((prev) => prev.map((item) => (item.id === sec.id ? { ...item, ...updated } : item)));
      setOpenExplainIds((prev) => ({ ...prev, [sec.id]: true }));
      if (isAdmin && supabase) {
        await supabase.from('lesson_sections').update(updated).eq('id', sec.id);
      }
    } catch (err) {
      showToast(err.message || 'Không tạo được giải thích AI.', 'error');
    } finally {
      setLoadingExplainId(null);
    }
  };

  const handleSaveEditedSection = async (secId) => {
    if (!isAdmin || !supabase) return;
    const { error } = await supabase
      .from('lesson_sections')
      .update({
        heading_de: editSectionDraft.heading_de,
        heading_vn: editSectionDraft.heading_vn,
        content_de: editSectionDraft.content_de,
        content_vn: editSectionDraft.content_vn,
      })
      .eq('id', secId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === secId ? { ...s, ...editSectionDraft } : s)));
    setEditingSectionId(null);
    showToast('Đã lưu nội dung chỉnh sửa!');
  };

  const handleAddYouTubeVideo = async (sec) => {
    if (!isAdmin || !supabase) return;
    const ytId = extractYouTubeId(videoDraft.url);
    if (!ytId) {
      showToast('Link YouTube chưa hợp lệ (hỗ trợ youtube.com/watch?v=... hoặc youtu.be/...)', 'error');
      return;
    }
    const existing = Array.isArray(sec.video_urls) ? sec.video_urls : [];
    const updatedVideos = [...existing, { title: videoDraft.title.trim() || 'Video minh họa tình huống', url: videoDraft.url.trim() }];
    const { error } = await supabase.from('lesson_sections').update({ video_urls: updatedVideos }).eq('id', sec.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === sec.id ? { ...s, video_urls: updatedVideos } : s)));
    setVideoDraft({ title: '', url: '' });
    setVideoInputSectionId(null);
    showToast('Đã nhúng video YouTube vào mục học!');
  };

  const handleRemoveYouTubeVideo = async (sec, idx) => {
    if (!isAdmin || !supabase) return;
    const existing = Array.isArray(sec.video_urls) ? sec.video_urls : [];
    const updatedVideos = existing.filter((_, i) => i !== idx);
    await supabase.from('lesson_sections').update({ video_urls: updatedVideos }).eq('id', sec.id);
    setSections((prev) => prev.map((s) => (s.id === sec.id ? { ...s, video_urls: updatedVideos } : s)));
  };

  // ==================== ADMIN: IMPORT ONENOTE / PDF / HANDWRITING ====================
  const handleSaveImportedData = async (aiResult, boardPhotosInput = '', options = {}) => {
    const serializedSourceImages = serializeLessonSourceMeta({
      photos: boardPhotosInput,
      sourceFiles: options.sourceFiles || [],
    });
    if (!supabase || !isAdmin) throw new Error('Chỉ Admin mới có quyền thêm bài.');
    if (!Array.isArray(aiResult?.lessons) || aiResult.lessons.length === 0) {
      throw new Error('AI không trả về bài học nào hợp lệ.');
    }

    let subjectId = options.forcedSubjectId || aiResult.existing_subject_id;
    let subjectObj = subjects.find((s) => s.id === subjectId) || null;
    if (!subjectId || !subjectObj) {
      // Kiểm tra trong DB tránh tạo trùng môn khi nạp hàng loạt từ PDF
      const candidateDe = (aiResult.subject?.title_de || '').trim();
      if (candidateDe) {
        const { data: existingByTitle } = await supabase
          .from('subjects')
          .select('*')
          .ilike('title_de', candidateDe)
          .limit(1);
        if (existingByTitle && existingByTitle[0]) {
          subjectId = existingByTitle[0].id;
          subjectObj = existingByTitle[0];
        }
      }
    }
    if (!subjectId || !subjectObj) {
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
      subjectObj = newSub;
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
          source_image_url: serializedSourceImages,
        })
        .select()
        .single();
      if (lesErr) throw lesErr;
      if (!firstCreatedLessonId) firstCreatedLessonId = createdLesson.id;

      // Sections (with diagram_json + video_keywords)
      if (Array.isArray(les.sections) && les.sections.length > 0) {
        const secRows = les.sections.map((s, idx) => ({
          lesson_id: createdLesson.id,
          sort_order: idx + 1,
          heading_de: s.heading_de || `Abschnitt ${idx + 1}`,
          heading_vn: s.heading_vn || '',
          content_de: s.content_de || '',
          content_vn: s.content_vn || '',
          diagram_json: s.diagram_json || null,
          video_keywords: Array.isArray(s.video_keywords) ? s.video_keywords : [],
          video_urls: [],
        }));
        const { error: secErr } = await supabase.from('lesson_sections').insert(secRows);
        if (secErr) throw secErr;
      }

      // Vocabularies
      if (Array.isArray(les.vocabularies) && les.vocabularies.length > 0) {
        const vRows = les.vocabularies.map((v) => ({
          subject_id: subjectId,
          lesson_id: createdLesson.id,
          word_de: v.word_de || '',
          article: v.article || '',
          plural: v.plural || '',
          word_type: v.word_type || 'Nomen',
          meaning_vn: v.meaning_vn || '',
          example_de: v.example_de || '',
          example_vn: v.example_vn || '',
          grammar_note_vn: v.grammar_note_vn || '',
        }));
        await supabase.from('vocabularies').insert(vRows);
      }

      // Flashcards
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
        await supabase.from('flashcards').insert(fcRows);
      }

      // Adaptive Quiz Questions
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
        await supabase.from('quiz_questions').insert(qRows);
      }
    }

    if (!options.silent) {
      await loadCurriculum();
      showToast(`Đã nạp ${aiResult.lessons.length} bài học kèm Từ vựng, Flashcard & Bài Test bao quát!`);
      if (firstCreatedLessonId) {
        openLesson(firstCreatedLessonId);
      }
    }
    return {
      subjectId,
      subjectObj,
      firstCreatedLessonId,
      lessonsCount: aiResult.lessons.length,
    };
  };

  const handleBatchImportComplete = async (firstCreatedLessonId, totalLessons, failList = []) => {
    await loadCurriculum();
    if (failList.length > 0) {
      showToast(`Đã nạp ${totalLessons} bài học (${failList.length} cụm bị lỗi nhẹ).`, 'success');
    } else {
      showToast(`Đã tự động lọc & nạp thành công ${totalLessons} bài học từ file PDF!`);
    }
    if (firstCreatedLessonId) {
      openLesson(firstCreatedLessonId);
    }
  };

  // ==================== ADMIN: CẬP NHẬT / NÂNG CẤP BÀI HỌC TẠI CHỖ (KHÔNG CẦN XÓA LÀM LẠI) ====================
  const handleApplyLessonUpgrade = async ({
    lessonId,
    updateMode = 'rewrite',
    studyPackMode = 'merge',
    keepOriginalTitle = true,
    upgradedLesson,
    studyPack = null,
    newlyArchivedPhotos = [],
    addedSourceFiles = [],
  }) => {
    if (!supabase || !isAdmin) throw new Error('Chỉ Admin mới có quyền cập nhật bài học.');
    const targetLesson = lessons.find((l) => l.id === lessonId);
    if (!targetLesson) throw new Error('Không tìm thấy bài học cần cập nhật.');

    const existingLessonSections = sections
      .filter((s) => s.lesson_id === lessonId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // 1. Gộp ảnh bản gốc cũ + ảnh mới tải lên (tối đa 10 trang) VÀ giữ nguyên + nối thêm tên file gốc
    const oldMeta = parseLessonSourceMeta(targetLesson.source_image_url);
    const mergedPhotos = [...oldMeta.photos, ...normalizePhotoList(newlyArchivedPhotos)].slice(0, 10);
    const mergedSourceFiles = normalizeSourceFilesList([...oldMeta.sourceFiles, ...(addedSourceFiles || [])]);
    const serializedPhotos = serializeLessonSourceMeta({
      photos: mergedPhotos,
      sourceFiles: mergedSourceFiles,
    });

    // 2. Cập nhật metadata của chính bài học đang có (giữ nguyên ID, môn học, sort_order)
    const lessonUpdatePayload = {
      source_image_url: serializedPhotos,
    };
    if (updateMode === 'rewrite') {
      if (!keepOriginalTitle && upgradedLesson?.title_de) {
        lessonUpdatePayload.title_de = upgradedLesson.title_de;
        lessonUpdatePayload.title_vn = upgradedLesson.title_vn || targetLesson.title_vn || '';
      }
      if (upgradedLesson?.overview_de) {
        lessonUpdatePayload.overview_de = upgradedLesson.overview_de;
      }
      if (upgradedLesson?.overview_vn) {
        lessonUpdatePayload.overview_vn = upgradedLesson.overview_vn;
      }
    }
    const { error: lesUpdErr } = await supabase
      .from('lessons')
      .update(lessonUpdatePayload)
      .eq('id', lessonId);
    if (lesUpdErr) throw lesUpdErr;

    // 3. Cập nhật lesson_sections (có cơ chế di chuyển bảo toàn Ghi chú cá nhân & Lịch sử chat Gia sư AI!)
    const incomingSections = Array.isArray(upgradedLesson?.sections) ? upgradedLesson.sections : [];
    if (incomingSections.length > 0) {
      if (updateMode === 'rewrite') {
        // Sao lưu Ghi chú cá nhân và Lịch sử chat AI của từng mục cũ trước khi thay
        const savedNotesList = existingLessonSections
          .map((sec, idx) => ({
            idx,
            heading: sec.heading_de || `Mục ${idx + 1}`,
            text: (sectionNotes[sec.id] || '').trim(),
          }))
          .filter((item) => item.text);

        const savedChatsList = existingLessonSections
          .map((sec, idx) => ({
            idx,
            oldKey: `section:${sec.id}`,
            heading: sec.heading_de || `Mục ${idx + 1}`,
            messages: aiChatsMap[`section:${sec.id}`] || [],
          }))
          .filter((item) => item.messages.length > 0);

        // Xóa mục cũ & chèn mục mới chuẩn hóa
        const { error: delSecErr } = await supabase
          .from('lesson_sections')
          .delete()
          .eq('lesson_id', lessonId);
        if (delSecErr) throw delSecErr;

        const secRows = incomingSections.map((s, idx) => ({
          lesson_id: lessonId,
          sort_order: idx + 1,
          heading_de: s.heading_de || `Abschnitt ${idx + 1}`,
          heading_vn: s.heading_vn || '',
          content_de: s.content_de || '',
          content_vn: s.content_vn || '',
          diagram_json: s.diagram_json || null,
          video_keywords: Array.isArray(s.video_keywords) ? s.video_keywords : [],
          video_urls: [],
        }));

        const { data: insertedSecs, error: insSecErr } = await supabase
          .from('lesson_sections')
          .insert(secRows)
          .select()
          .order('sort_order', { ascending: true });
        if (insSecErr) throw insSecErr;

        // Khôi phục Ghi chú cá nhân & Lịch sử chat Gia sư AI sang ID mục mới
        if (Array.isArray(insertedSecs) && insertedSecs.length > 0) {
          const noteBuckets = {};
          savedNotesList.forEach((item) => {
            const targetSec = insertedSecs[Math.min(item.idx, insertedSecs.length - 1)];
            if (!targetSec) return;
            noteBuckets[targetSec.id] = noteBuckets[targetSec.id]
              ? `${noteBuckets[targetSec.id]}

[${item.heading}]:
${item.text}`
              : item.text;
          });
          for (const [newSecId, noteText] of Object.entries(noteBuckets)) {
            await handleSaveSectionNote(newSecId, noteText);
          }

          const chatBuckets = {};
          savedChatsList.forEach((item) => {
            const targetSec = insertedSecs[Math.min(item.idx, insertedSecs.length - 1)];
            if (!targetSec) return;
            const newKey = `section:${targetSec.id}`;
            if (!chatBuckets[newKey]) {
              chatBuckets[newKey] = {
                title: targetSec.heading_de || targetLesson.title_de,
                messages: [],
              };
            }
            chatBuckets[newKey].messages.push(...item.messages);
            // Xóa khóa cũ đã mồ côi
            handleUpdateAiChat(item.oldKey, [], { contextType: 'section' });
          });
          for (const [newKey, bundle] of Object.entries(chatBuckets)) {
            handleUpdateAiChat(newKey, bundle.messages, {
              contextType: 'section',
              title: bundle.title,
            });
          }
        }
      } else {
        // Chế độ NỐI THÊM vào cuối bài -> giữ nguyên 100% các mục cũ, ghi chú & chat cũ
        const baseOrder = existingLessonSections.length;
        const secRows = incomingSections.map((s, idx) => ({
          lesson_id: lessonId,
          sort_order: baseOrder + idx + 1,
          heading_de: s.heading_de || `Abschnitt ${baseOrder + idx + 1}`,
          heading_vn: s.heading_vn || '',
          content_de: s.content_de || '',
          content_vn: s.content_vn || '',
          diagram_json: s.diagram_json || null,
          video_keywords: Array.isArray(s.video_keywords) ? s.video_keywords : [],
          video_urls: [],
        }));
        const { error: appendSecErr } = await supabase.from('lesson_sections').insert(secRows);
        if (appendSecErr) throw appendSecErr;
      }
    }

    // 4. Cập nhật Từ vựng, Flashcards & Bài Test theo chế độ người dùng chọn
    let addedVocab = 0;
    let addedCards = 0;
    let addedQuiz = 0;

    if (studyPackMode !== 'keep_only' && studyPack) {
      const subjectId = targetLesson.subject_id;
      const newVocabsRaw = Array.isArray(studyPack.vocabularies) ? studyPack.vocabularies : [];
      const newCardsRaw = Array.isArray(studyPack.flashcards) ? studyPack.flashcards : [];
      const newQuizRaw = Array.isArray(studyPack.quiz_questions) ? studyPack.quiz_questions : [];

      if (studyPackMode === 'replace') {
        await Promise.all([
          supabase.from('vocabularies').delete().eq('lesson_id', lessonId),
          supabase.from('flashcards').delete().eq('lesson_id', lessonId),
          supabase.from('quiz_questions').delete().eq('lesson_id', lessonId),
        ]);

        if (newVocabsRaw.length > 0) {
          await supabase.from('vocabularies').insert(
            newVocabsRaw.map((v) => ({
              subject_id: subjectId,
              lesson_id: lessonId,
              word_de: v.word_de || '',
              article: v.article || '',
              plural: v.plural || '',
              word_type: v.word_type || 'Nomen',
              meaning_vn: v.meaning_vn || '',
              example_de: v.example_de || '',
              example_vn: v.example_vn || '',
              grammar_note_vn: v.grammar_note_vn || '',
            }))
          );
          addedVocab = newVocabsRaw.length;
        }
        if (newCardsRaw.length > 0) {
          await supabase.from('flashcards').insert(
            newCardsRaw.map((f) => ({
              lesson_id: lessonId,
              subject_id: subjectId,
              category: f.category || 'Fachbegriff',
              front_de: f.front_de || '',
              hint_vn: f.hint_vn || '',
              back_de: f.back_de || '',
              back_vn: f.back_vn || '',
              example_de: f.example_de || '',
              example_vn: f.example_vn || '',
            }))
          );
          addedCards = newCardsRaw.length;
        }
        if (newQuizRaw.length > 0) {
          await supabase.from('quiz_questions').insert(
            newQuizRaw.map((q, idx) => ({
              lesson_id: lessonId,
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
            }))
          );
          addedQuiz = newQuizRaw.length;
        }
      } else {
        // Chế độ MERGE: giữ nguyên cũ (bảo toàn 100% SRS Flashcards) & chỉ chèn thêm mục chưa trùng
        const existingVocabSet = new Set(
          vocabularies.filter((v) => v.lesson_id === lessonId).map((v) => (v.word_de || '').trim().toLowerCase())
        );
        const existingCardSet = new Set(
          flashcards.filter((c) => c.lesson_id === lessonId).map((c) => (c.front_de || '').trim().toLowerCase())
        );
        const existingQuizList = quizQuestions.filter((q) => q.lesson_id === lessonId);
        const existingQuizSet = new Set(
          existingQuizList.map((q) => (q.question_de || '').trim().toLowerCase().slice(0, 70))
        );

        const vocabsToAdd = newVocabsRaw.filter(
          (v) => v.word_de && !existingVocabSet.has(v.word_de.trim().toLowerCase())
        );
        const cardsToAdd = newCardsRaw.filter(
          (f) => f.front_de && !existingCardSet.has(f.front_de.trim().toLowerCase())
        );
        const quizToAdd = newQuizRaw.filter(
          (q) => q.question_de && !existingQuizSet.has(q.question_de.trim().toLowerCase().slice(0, 70))
        );

        if (vocabsToAdd.length > 0) {
          await supabase.from('vocabularies').insert(
            vocabsToAdd.map((v) => ({
              subject_id: subjectId,
              lesson_id: lessonId,
              word_de: v.word_de || '',
              article: v.article || '',
              plural: v.plural || '',
              word_type: v.word_type || 'Nomen',
              meaning_vn: v.meaning_vn || '',
              example_de: v.example_de || '',
              example_vn: v.example_vn || '',
              grammar_note_vn: v.grammar_note_vn || '',
            }))
          );
          addedVocab = vocabsToAdd.length;
        }
        if (cardsToAdd.length > 0) {
          await supabase.from('flashcards').insert(
            cardsToAdd.map((f) => ({
              lesson_id: lessonId,
              subject_id: subjectId,
              category: f.category || 'Fachbegriff',
              front_de: f.front_de || '',
              hint_vn: f.hint_vn || '',
              back_de: f.back_de || '',
              back_vn: f.back_vn || '',
              example_de: f.example_de || '',
              example_vn: f.example_vn || '',
            }))
          );
          addedCards = cardsToAdd.length;
        }
        if (quizToAdd.length > 0) {
          const baseOrder = existingQuizList.length;
          await supabase.from('quiz_questions').insert(
            quizToAdd.map((q, idx) => ({
              lesson_id: lessonId,
              sort_order: baseOrder + idx + 1,
              q_type: q.q_type === 'essay' ? 'essay' : 'mc',
              question_de: q.question_de || '',
              question_vn: q.question_vn || '',
              options: q.q_type === 'mc' ? q.options || [] : [],
              correct_index: q.q_type === 'mc' ? Number(q.correct_index ?? 0) : null,
              model_answer_de: q.model_answer_de || '',
              model_answer_vn: q.model_answer_vn || '',
              explanation_de: q.explanation_de || '',
              explanation_vn: q.explanation_vn || '',
            }))
          );
          addedQuiz = quizToAdd.length;
        }
      }
    }

    setOpenExplainIds({});
    await loadCurriculum();
    const extraSummary =
      studyPackMode === 'keep_only'
        ? ''
        : ` · +${addedVocab} từ, +${addedCards} thẻ, +${addedQuiz} câu test`;
    showToast(
      updateMode === 'rewrite'
        ? `Đã nâng cấp bài học lên chuẩn AI mới nhất (${incomingSections.length} mục${extraSummary})!`
        : `Đã nối thêm ${incomingSections.length} mục mới vào cuối bài${extraSummary}!`
    );
  };

  // ==================== ADMIN: QUẢN LÝ MÔN HỌC CHUẨN (TẠO, SỬA, GỘP, SẮP XẾP, XÓA) ====================
  const handleCreateSubject = async ({ title_de, title_vn = '', description_de = '', description_vn = '' }) => {
    if (!isAdmin || !supabase) throw new Error('Chỉ Admin mới có quyền tạo môn học.');
    const cleanDe = String(title_de || '').trim();
    if (!cleanDe) throw new Error('Tên môn học không được để trống.');

    const { data, error } = await supabase
      .from('subjects')
      .insert({
        title_de: cleanDe,
        title_vn: String(title_vn || '').trim(),
        description_de,
        description_vn,
        sort_order: subjects.length + 1,
      })
      .select()
      .single();
    if (error) throw error;
    await loadCurriculum();
    showToast(`Đã tạo môn học "${cleanDe}"!`);
    return data;
  };

  const handleSubmitNewSubjectForm = async (e) => {
    e.preventDefault();
    const code = newSubjectDraft.code.trim();
    const nameDe = newSubjectDraft.title_de.trim();
    if (!code && !nameDe) {
      showToast('Hãy nhập Mã môn (VD: VKO, PuG, RW) hoặc Tên môn tiếng Đức.', 'error');
      return;
    }
    const fullDe = code && nameDe ? `${code} · ${nameDe}` : nameDe || code;
    setBusySubjectAction(true);
    try {
      await handleCreateSubject({
        title_de: fullDe,
        title_vn: newSubjectDraft.title_vn.trim(),
      });
      setNewSubjectDraft({ code: '', title_de: '', title_vn: '' });
      setShowCreateSubjectForm(false);
    } catch (err) {
      showToast(err.message || 'Không tạo được môn học.', 'error');
    } finally {
      setBusySubjectAction(false);
    }
  };

  const handleInitPresetSubjects = async (presetsToAdd) => {
    if (!isAdmin || !supabase || !presetsToAdd.length) return;
    setBusySubjectAction(true);
    try {
      const existingLower = new Set(subjects.map((s) => (s.title_de || '').toLowerCase()));
      const existingCodes = new Set(
        subjects.map((s) => parseSubjectTitle(s.title_de).code.toLowerCase()).filter(Boolean)
      );
      const rows = presetsToAdd
        .filter(
          (p) =>
            !existingLower.has(p.title_de.toLowerCase()) &&
            !existingCodes.has(p.code.toLowerCase())
        )
        .map((p, idx) => ({
          title_de: p.title_de,
          title_vn: p.title_vn,
          description_de: p.description_de,
          description_vn: p.description_vn,
          sort_order: subjects.length + idx + 1,
        }));

      if (!rows.length) {
        showToast('Các môn học này đều đã tồn tại trong danh sách rồi!');
        setShowPresetSubjects(false);
        return;
      }

      const { error } = await supabase.from('subjects').insert(rows);
      if (error) throw error;
      await loadCurriculum();
      setShowPresetSubjects(false);
      showToast(`Đã tạo nhanh ${rows.length} môn học chuẩn trường nghề (đã bỏ tên giáo viên)!`);
    } catch (err) {
      showToast(err.message || 'Không khởi tạo được danh sách môn.', 'error');
    } finally {
      setBusySubjectAction(false);
    }
  };

  const handleSaveEditedSubject = async (subId) => {
    if (!isAdmin || !supabase) return;
    const code = editSubjectDraft.code.trim();
    const nameDe = editSubjectDraft.title_de.trim();
    if (!code && !nameDe) {
      showToast('Tên môn tiếng Đức không được để trống.', 'error');
      return;
    }
    const fullDe = code && nameDe ? `${code} · ${nameDe}` : nameDe || code;
    setBusySubjectAction(true);
    try {
      const { error } = await supabase
        .from('subjects')
        .update({
          title_de: fullDe,
          title_vn: editSubjectDraft.title_vn.trim(),
        })
        .eq('id', subId);
      if (error) throw error;
      setEditingSubjectId(null);
      await loadCurriculum();
      showToast('Đã cập nhật tên môn học!');
    } catch (err) {
      showToast(err.message || 'Không sửa được tên môn.', 'error');
    } finally {
      setBusySubjectAction(false);
    }
  };

  const handleReorderSubject = async (idx, direction) => {
    if (!isAdmin || !supabase) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= subjects.length) return;
    const a = subjects[idx];
    const b = subjects[swapIdx];
    await Promise.all([
      supabase.from('subjects').update({ sort_order: swapIdx + 1 }).eq('id', a.id),
      supabase.from('subjects').update({ sort_order: idx + 1 }).eq('id', b.id),
    ]);
    await loadCurriculum();
  };

  const handleMergeSubject = async (sourceSubId, targetSubId) => {
    if (!isAdmin || !supabase || !sourceSubId || !targetSubId || sourceSubId === targetSubId) return;
    const sourceSub = subjects.find((s) => s.id === sourceSubId);
    const targetSub = subjects.find((s) => s.id === targetSubId);
    if (
      !window.confirm(
        `Gộp toàn bộ bài học, từ vựng và Flashcard từ "${sourceSub?.title_de}" sang "${targetSub?.title_de}", rồi xóa môn cũ "${sourceSub?.title_de}"?`
      )
    ) {
      return;
    }
    setBusySubjectAction(true);
    try {
      await Promise.all([
        supabase.from('lessons').update({ subject_id: targetSubId }).eq('subject_id', sourceSubId),
        supabase.from('flashcards').update({ subject_id: targetSubId }).eq('subject_id', sourceSubId),
        supabase.from('vocabularies').update({ subject_id: targetSubId }).eq('subject_id', sourceSubId),
        supabase.from('user_wrong_questions').update({ subject_id: targetSubId }).eq('subject_id', sourceSubId),
      ]);
      await supabase.from('subjects').delete().eq('id', sourceSubId);
      setMergingSubjectId(null);
      if (subjectFilterId === sourceSubId) setSubjectFilterId(targetSubId);
      await loadCurriculum();
      showToast(`Đã gộp sạch vào môn "${targetSub?.title_de}"!`);
    } catch (err) {
      showToast(err.message || 'Lỗi khi gộp môn học.', 'error');
    } finally {
      setBusySubjectAction(false);
    }
  };

  const handleDeleteSubject = async (sub) => {
    if (!isAdmin || !supabase) return;
    const cnt = lessons.filter((l) => l.subject_id === sub.id).length;
    const msg =
      cnt > 0
        ? `CẢNH BÁO: Môn "${sub.title_de}" đang có ${cnt} bài học! Nếu xóa môn này, toàn bộ ${cnt} bài bên trong sẽ bị xóa theo (hãy dùng nút Gộp môn nếu muốn giữ bài). Vẫn chắc chắn xóa?`
        : `Xóa môn trống "${sub.title_de}"?`;
    if (!window.confirm(msg)) return;
    setBusySubjectAction(true);
    try {
      await supabase.from('subjects').delete().eq('id', sub.id);
      if (subjectFilterId === sub.id) setSubjectFilterId('all');
      await loadCurriculum();
      showToast(`Đã xóa môn "${sub.title_de}".`);
    } catch (err) {
      showToast(err.message || 'Không xóa được môn học.', 'error');
    } finally {
      setBusySubjectAction(false);
    }
  };

  // ==================== ADMIN: LESSON REORDER, MOVE, DELETE ====================
  const handleReorderLesson = async (subLessons, idx, direction) => {
    if (!isAdmin || !supabase) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= subLessons.length) return;
    const a = subLessons[idx];
    const b = subLessons[swapIdx];
    await Promise.all([
      supabase.from('lessons').update({ sort_order: swapIdx + 1 }).eq('id', a.id),
      supabase.from('lessons').update({ sort_order: idx + 1 }).eq('id', b.id),
    ]);
    await loadCurriculum();
  };

  const handleMoveLessonSubject = async (lessonId, newSubjectId) => {
    if (!isAdmin || !supabase || !newSubjectId) return;
    await Promise.all([
      supabase.from('lessons').update({ subject_id: newSubjectId }).eq('id', lessonId),
      supabase.from('flashcards').update({ subject_id: newSubjectId }).eq('lesson_id', lessonId),
      supabase.from('vocabularies').update({ subject_id: newSubjectId }).eq('lesson_id', lessonId),
    ]);
    setMovingLessonId(null);
    await loadCurriculum();
    showToast('Đã chuyển bài học sang môn mới!');
  };

  const handleSaveLessonSourceFiles = async (lessonId, rawInput) => {
    if (!isAdmin || !supabase) return;
    const target = lessons.find((l) => l.id === lessonId);
    if (!target) return;
    const oldMeta = parseLessonSourceMeta(target.source_image_url);
    const parsedFiles = String(rawInput || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const serialized = serializeLessonSourceMeta({
      photos: oldMeta.photos,
      sourceFiles: parsedFiles,
    });
    const { error } = await supabase
      .from('lessons')
      .update({ source_image_url: serialized })
      .eq('id', lessonId);
    if (error) {
      showToast(error.message || 'Không lưu được nhãn file gốc.', 'error');
      return;
    }
    setLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, source_image_url: serialized } : l))
    );
    setEditingSourceTagLessonId(null);
    setEditSourceTagDraft('');
    showToast(parsedFiles.length > 0 ? `Đã gắn nhãn file "${parsedFiles[0]}"!` : 'Đã xóa nhãn file gốc.');
  };

  const handleDeleteLesson = async (lessonId, title) => {
    if (!isAdmin || !supabase || !window.confirm(`Xóa bài học "${title}"?`)) return;
    await supabase.from('lessons').delete().eq('id', lessonId);
    if (activeLessonId === lessonId) {
      setView('subjects');
      setActiveLessonId(null);
    }
    await loadCurriculum();
    showToast('Đã xóa bài học.');
  };

  // ==================== ADMIN: VOCAB, CARDS, QUIZ APPEND, MOCK EXAMS ====================
  const handleGenerateMoreVocab = async () => {
    if (!activeLesson || !supabase) return;
    const sectionsText = activeSections.map((s) => `${s.heading_de}\n${s.content_de}`).join('\n\n');
    const data = await callGeminiApi('generate_more_vocab', {
      lessonTitle: activeLesson.title_de,
      sectionsText,
      existingWords: activeVocabs.map((v) => v.word_de),
    });
    const rows = (data?.vocabularies || []).map((v) => ({
      subject_id: activeLesson.subject_id,
      lesson_id: activeLesson.id,
      word_de: v.word_de,
      article: v.article || '',
      plural: v.plural || '',
      word_type: v.word_type || 'Nomen',
      meaning_vn: v.meaning_vn || '',
      example_de: v.example_de || '',
      example_vn: v.example_vn || '',
      grammar_note_vn: v.grammar_note_vn || '',
    }));
    if (rows.length) {
      await supabase.from('vocabularies').insert(rows);
      await loadCurriculum();
      showToast(`Đã trích thêm ${rows.length} từ vựng mới!`);
    }
  };

  const handleAddManualVocab = async (vocabObj) => {
    if (!activeLesson || !supabase) return;
    await supabase.from('vocabularies').insert({
      ...vocabObj,
      subject_id: activeLesson.subject_id,
      lesson_id: activeLesson.id,
    });
    await loadCurriculum();
    showToast('Đã thêm từ vựng mới!');
  };

  const handleDeleteVocab = async (id) => {
    if (!supabase || !window.confirm('Xóa từ vựng này?')) return;
    await supabase.from('vocabularies').delete().eq('id', id);
    setVocabularies((prev) => prev.filter((v) => v.id !== id));
  };

  const handleGenerateMoreCards = async () => {
    if (!activeLesson || !supabase) return;
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
    if (rows.length) {
      await supabase.from('flashcards').insert(rows);
      await loadCurriculum();
      showToast(`Đã tạo thêm ${rows.length} Flashcards!`);
    }
  };

  const handleAddManualCard = async (card) => {
    if (!activeLesson || !supabase) return;
    await supabase.from('flashcards').insert({
      ...card,
      lesson_id: activeLesson.id,
      subject_id: activeLesson.subject_id,
    });
    await loadCurriculum();
    showToast('Đã lưu thẻ mới!');
  };

  const handleDeleteCard = async (id) => {
    if (!supabase || !window.confirm('Xóa thẻ này?')) return;
    await supabase.from('flashcards').delete().eq('id', id);
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAppendMoreQuiz = async () => {
    if (!activeLesson || !supabase) return;
    const sectionsText = activeSections.map((s) => `${s.heading_de}\n${s.content_de}`).join('\n\n');
    const data = await callGeminiApi('generate_more_quiz', {
      lessonTitle: activeLesson.title_de,
      sectionsText,
      existingQuestions: activeQuiz.map((q) => q.question_de),
    });
    const newQs = data?.quiz_questions || [];
    if (!newQs.length) throw new Error('AI không trả về câu hỏi mới.');

    const baseOrder = activeQuiz.length;
    const rows = newQs.map((q, idx) => ({
      lesson_id: activeLesson.id,
      sort_order: baseOrder + idx + 1,
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
    await supabase.from('quiz_questions').insert(rows);
    await loadCurriculum();
    showToast(`Đã nối thêm ${rows.length} câu hỏi mới vào bài Test!`);
  };

  const handleCreateExam = async (examData) => {
    if (!isAdmin || !supabase) return;
    const { error } = await supabase.from('mock_exams').insert(examData);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    await loadCurriculum();
    showToast('Đã tạo bộ đề thi cũ mới! Giờ hãy bấm "+ Nạp thêm trang đề" để quét câu hỏi vào.');
  };

  const handleAppendExamQuestions = async (examId, questionsList, existingCount) => {
    if (!isAdmin || !supabase) return;
    const rows = questionsList.map((q, idx) => ({
      exam_id: examId,
      sort_order: existingCount + idx + 1,
      section_label: q.section_label || `Aufgabe ${existingCount + idx + 1}`,
      q_type: q.q_type === 'mc' ? 'mc' : 'essay',
      points: Number(q.points || 10),
      question_de: q.question_de || '',
      question_vn: q.question_vn || '',
      options: q.q_type === 'mc' ? q.options || [] : [],
      correct_index: q.q_type === 'mc' ? Number(q.correct_index ?? 0) : null,
      model_answer_de: q.model_answer_de || '',
      model_answer_vn: q.model_answer_vn || '',
      explanation_de: q.explanation_de || '',
      explanation_vn: q.explanation_vn || '',
      diagram_json: q.diagram_json || null,
    }));
    const { error } = await supabase.from('mock_exam_questions').insert(rows);
    if (error) throw error;
    await loadCurriculum();
    showToast(`Đã nạp thành công ${rows.length} câu hỏi vào bộ đề thi!`);
  };

  const handleDeleteExam = async (examId, title) => {
    if (!isAdmin || !supabase || !window.confirm(`Xóa bộ đề thi "${title}"?`)) return;
    await supabase.from('mock_exams').delete().eq('id', examId);
    await loadCurriculum();
    showToast('Đã xóa bộ đề thi.');
  };

  // ==================== BACKUP / RESTORE JSON ====================
  const handleExportJson = () => {
    const backup = {
      version: '2.0',
      exported_at: new Date().toISOString(),
      subjects,
      lessons,
      lesson_sections: sections,
      vocabularies,
      flashcards,
      quiz_questions: quizQuestions,
      mock_exams: mockExams,
      mock_exam_questions: mockExamQuestions,
      progressMap,
      aiChatsMap,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lernplan-2028-v2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải file sao lưu JSON v2.0!');
  };

  const handleImportJsonFile = async (file) => {
    if (!file || !isAdmin || !supabase) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.subjects?.length) await supabase.from('subjects').upsert(parsed.subjects);
      if (parsed.lessons?.length) await supabase.from('lessons').upsert(parsed.lessons);
      if (parsed.lesson_sections?.length) await supabase.from('lesson_sections').upsert(parsed.lesson_sections);
      if (parsed.vocabularies?.length) await supabase.from('vocabularies').upsert(parsed.vocabularies);
      if (parsed.flashcards?.length) await supabase.from('flashcards').upsert(parsed.flashcards);
      if (parsed.quiz_questions?.length) await supabase.from('quiz_questions').upsert(parsed.quiz_questions);
      if (parsed.mock_exams?.length) await supabase.from('mock_exams').upsert(parsed.mock_exams);
      if (parsed.mock_exam_questions?.length) await supabase.from('mock_exam_questions').upsert(parsed.mock_exam_questions);
      if (parsed.aiChatsMap && typeof parsed.aiChatsMap === 'object') {
        setAiChatsMap((prev) => {
          const merged = { ...prev, ...parsed.aiChatsMap };
          try {
            localStorage.setItem(LOCAL_AI_CHATS_KEY, JSON.stringify(merged));
          } catch {
            // ignore
          }
          return merged;
        });
      }
      await loadCurriculum();
      showToast('Đã khôi phục toàn bộ dữ liệu từ file JSON!');
    } catch (err) {
      showToast(err.message || 'File JSON không hợp lệ.', 'error');
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    showToast('Đã đăng xuất.');
  };

  const openLesson = (lessonId, tab = 'study') => {
    setActiveLessonId(lessonId);
    setLessonTab(tab);
    setOpenExplainIds({});
    setOpenChatKeys({});
    setShowBoardPhoto(false);
    setBoardLightboxIndex(null);
    setBoardLightboxZoom(1);
    setBoardLightboxRotate(0);
    setEditingSectionId(null);
    setView('lesson');
    setMobileMenuOpen(false);
    pushAppHistory({ view: 'lesson', activeLessonId: lessonId, lessonTab: tab, overlay: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const switchLessonTab = (tabId) => {
    if (tabId === lessonTab) return;
    setLessonTab(tabId);
    pushAppHistory({ view: 'lesson', activeLessonId, lessonTab: tabId, overlay: null });
  };

  const navigate = (targetView) => {
    setView(targetView);
    setMobileMenuOpen(false);
    setBoardLightboxIndex(null);
    pushAppHistory({ view: targetView, activeLessonId: targetView === 'lesson' ? activeLessonId : null, lessonTab, overlay: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const triggerAddKnowledge = (preselectedSubjectId = '') => {
    setMobileMenuOpen(false);
    const targetId = typeof preselectedSubjectId === 'string' ? preselectedSubjectId : '';
    if (isAdmin) {
      setImportDefaultSubjectId(targetId);
      openOverlay('import', () => setShowImportModal(true));
    } else {
      openOverlay('auth', () => setShowAuthModal(true));
      showToast(`Đăng nhập tài khoản Admin (${ADMIN_EMAIL}) để thêm kiến thức mới.`, 'error');
    }
  };

  // Menu Navigation Items
  const navItems = [
    { id: 'home', label: 'Trang chủ', icon: Home },
    { id: 'subjects', label: 'Môn học & Bài học', icon: BookOpen, badge: lessons.length || null },
    { id: 'vocab', label: 'Từ vựng IHK', icon: BookMarked, badge: vocabularies.length || null },
    { id: 'flashcards', label: 'Ôn Flashcard', icon: Layers, badge: dueCardsCount > 0 ? dueCardsCount : null, badgeColor: 'bg-indigo-600 text-white' },
    { id: 'exams', label: 'Phòng thi thử', icon: FileCheck2, badge: mockExams.length || null },
    {
      id: 'mistakes',
      label: 'Câu sai & Thống kê',
      icon: AlertTriangle,
      badge: unresolvedMistakesCount > 0 ? unresolvedMistakesCount : null,
      badgeColor: 'bg-rose-600 text-white',
    },
    { id: 'settings', label: 'Cài đặt & Sao lưu', icon: Settings },
  ];

  // Home Feature Icon Launcher Grid
  const homeLauncherTiles = [
    {
      id: 'subjects',
      title: 'Kho Môn Học',
      desc: `${subjects.length} môn · ${lessons.length} bài song ngữ`,
      icon: BookOpen,
      gradient: 'from-indigo-500 to-blue-600',
      onClick: () => navigate('subjects'),
    },
    {
      id: 'vocab',
      title: 'Từ Vựng IHK',
      desc: `${vocabularies.length} từ điển giống & ví dụ`,
      icon: BookMarked,
      gradient: 'from-emerald-500 to-teal-600',
      onClick: () => navigate('vocab'),
    },
    {
      id: 'flashcards',
      title: 'Flashcard 3D',
      desc: dueCardsCount > 0 ? `${dueCardsCount} thẻ cần ôn hôm nay` : 'Đã thuộc hết hôm nay',
      icon: Layers,
      gradient: 'from-violet-500 to-purple-600',
      badge: dueCardsCount > 0 ? `${dueCardsCount}` : null,
      onClick: () => navigate('flashcards'),
    },
    {
      id: 'exams',
      title: 'Phòng Thi Thử',
      desc: `${mockExams.length} bộ Altklausuren đếm giờ`,
      icon: FileCheck2,
      gradient: 'from-amber-500 to-orange-600',
      onClick: () => navigate('exams'),
    },
    {
      id: 'mistakes',
      title: 'Câu Sai & Môn Yếu',
      desc: unresolvedMistakesCount > 0 ? `${unresolvedMistakesCount} lỗi cần khắc phục` : 'Xem thống kê điểm mạnh yếu',
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-pink-600',
      badge: unresolvedMistakesCount > 0 ? `${unresolvedMistakesCount}` : null,
      onClick: () => navigate('mistakes'),
    },
    {
      id: 'import',
      title: 'Thêm Kiến Thức',
      desc: 'Quét chữ viết tay bảng / OneNote',
      icon: Plus,
      gradient: 'from-sky-500 to-indigo-600',
      onClick: triggerAddKnowledge,
    },
    {
      id: 'search',
      title: 'Tìm Kiếm Nhanh',
      desc: 'Tra điều luật § BGB, công thức...',
      icon: Search,
      gradient: 'from-slate-600 to-slate-800',
      onClick: () => setShowSearchModal(true),
    },
    {
      id: 'settings',
      title: 'Cài Đặt & Sao Lưu',
      desc: 'Dark Mode, Cỡ chữ, Dịch nhanh',
      icon: Settings,
      gradient: 'from-cyan-600 to-slate-700',
      onClick: () => navigate('settings'),
    },
  ];

  const globalFilteredCards = useMemo(() => {
    if (globalCardSubjectFilter === 'all') return flashcards;
    return flashcards.filter((c) => c.subject_id === globalCardSubjectFilter);
  }, [flashcards, globalCardSubjectFilter]);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 right-5 z-50 max-w-sm">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-500'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Hidden JSON Restore Input */}
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

      {/* ==================== DESKTOP LEFT MENU SIDEBAR ==================== */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen">
        {/* Brand */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <button onClick={() => navigate('home')} className="flex items-center gap-3 text-left w-full group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white font-black text-sm flex items-center justify-center shadow-sm">
              LP
            </div>
            <div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 transition">
                LernPlan 2028
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">IHK Veranstaltungskaufmann</div>
            </div>
          </button>
        </div>

        {/* Primary Add CTA */}
        <div className="p-4">
          <button
            onClick={() => triggerAddKnowledge('')}
            className="w-full py-2.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Thêm kiến thức mới
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id || (view === 'lesson' && item.id === 'subjects');
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      item.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Countdown & Account */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold">
              <Clock className="w-3.5 h-3.5 text-indigo-500" /> Thi IHK 2028
            </span>
            <span className="font-black text-indigo-600 dark:text-indigo-400">{daysToExam} ngày</span>
          </div>

          {user ? (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> Quyền Admin
                  </span>
                )}
              </div>
              <button
                onClick={handleSignOut}
                title="Đăng xuất"
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openOverlay('auth', () => setShowAuthModal(true))}
              className="w-full py-2 px-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <LogIn className="w-3.5 h-3.5" /> Đăng nhập Admin
            </button>
          )}
        </div>
      </aside>

      {/* ==================== MOBILE SLIDE-OUT MENU DRAWER ==================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            onClick={() => closeOverlay('menu', () => setMobileMenuOpen(false))}
          />
          <div
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                drawerTouchRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY };
              }
            }}
            onTouchEnd={(e) => {
              if (!drawerTouchRef.current.active) return;
              const t = e.changedTouches?.[0];
              if (t) {
                const dx = t.clientX - drawerTouchRef.current.startX;
                const dy = Math.abs(t.clientY - drawerTouchRef.current.startY);
                if (dx < -55 && Math.abs(dx) > dy * 1.4) {
                  closeOverlay('menu', () => setMobileMenuOpen(false));
                }
              }
              drawerTouchRef.current = { active: false, startX: 0, startY: 0 };
            }}
            className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10"
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center">
                  LP
                </div>
                <span className="font-extrabold text-sm text-slate-900 dark:text-white">Menu LernPlan 2028</span>
              </div>
              <button onClick={() => closeOverlay('menu', () => setMobileMenuOpen(false))} className="p-2 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <button
                onClick={() => triggerAddKnowledge('')}
                className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Thêm kiến thức mới
              </button>
            </div>

            <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id || (view === 'lesson' && item.id === 'subjects');
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" /> {item.label}
                    </span>
                    {item.badge ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor || 'bg-slate-100 dark:bg-slate-800'}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              {user ? (
                <button
                  onClick={handleSignOut}
                  className="w-full py-2 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 rounded-xl"
                >
                  Đăng xuất ({user.email})
                </button>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowAuthModal(true);
                  }}
                  className="w-full py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl"
                >
                  Đăng nhập
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== RIGHT WORKSPACE AREA ==================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP UTILITY BAR */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 h-16 px-4 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => openOverlay('menu', () => setMobileMenuOpen(true))}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              onClick={() => openOverlay('search', () => setShowSearchModal(true))}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition max-w-xs"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate hidden sm:inline">Tìm nhanh § BGB, từ vựng...</span>
              <span className="sm:hidden">Tìm...</span>
              <kbd className="hidden md:inline px-1.5 py-0.5 text-[10px] bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Quick Toggles */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Toggle hiển thị/ẩn bản dịch tiếng Việt bên dưới mỗi đoạn tiếng Đức */}
            <button
              onClick={() => setShowVn((v) => !v)}
              title="Hiện hoặc ẩn bản dịch tiếng Việt bên dưới mỗi đoạn tiếng Đức (chạm từ vẫn luôn bật)"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                showVn
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showVn ? 'Dịch VN: BẬT' : 'Dịch VN: TẮT'}</span>
            </button>

            {/* Dark Mode Quick Toggle */}
            <button
              onClick={() => setDarkMode((d) => !d)}
              title="Đổi chế độ Sáng / Tối"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-amber-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {!user && (
              <button
                onClick={() => openOverlay('auth', () => setShowAuthModal(true))}
                className="lg:hidden px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white text-xs font-bold"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </header>

        {/* MAIN CONTENT CONTAINER */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
          {!isSupabaseConfigured && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200">
              Thiếu biến môi trường Supabase trên Vercel (<code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>).
            </div>
          )}

          {dataError && isSupabaseConfigured && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
              <span>{dataError}</span>
              <button
                onClick={loadCurriculum}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg font-bold shrink-0 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
            </div>
          )}

          {/* ==================== VIEW 1: CLEAN SLOGAN HOME LAUNCHPAD ==================== */}
          {view === 'home' && (
            <div className="space-y-8">
              {/* Giant Slogan Hero (NO lesson clutter!) */}
              <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl px-6 py-10 sm:px-10 sm:py-14 text-center shadow-xl border border-indigo-500/20">
                <div className="relative z-10 max-w-3xl mx-auto space-y-5">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-indigo-200 text-xs font-bold tracking-wide">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    IHK Abschlussprüfung 2028 · Còn {daysToExam} ngày chiến đấu
                  </div>

                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.12] bg-gradient-to-r from-white via-indigo-100 to-amber-200 bg-clip-text text-transparent">
                    Vì 1 tương lai không trật tốt nghiệp
                  </h1>

                  <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
                    Veranstaltungskaufmann · Chọn một tính năng bên dưới hoặc mở thanh Menu để bắt đầu buổi học hôm nay.
                  </p>
                </div>
              </section>

              {/* Feature Icon Launcher Grid */}
              <section className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  {homeLauncherTiles.map((tile) => {
                    const Icon = tile.icon;
                    return (
                      <button
                        key={tile.id}
                        onClick={tile.onClick}
                        className="group relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 text-left shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex flex-col items-start gap-4"
                      >
                        {tile.badge && (
                          <span className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white shadow">
                            {tile.badge}
                          </span>
                        )}
                        <div
                          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${tile.gradient} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}
                        >
                          <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div className="space-y-1">
                          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                            {tile.title}
                          </h2>
                          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-snug">
                            {tile.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ==================== VIEW 2: SUBJECTS & LESSONS CURRICULUM ==================== */}
          {view === 'subjects' && (
            <div className="space-y-5">
              {/* Header & Admin Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Môn học & Lộ trình kiến thức</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Quản lý gọn theo đúng mã môn trên trường (VKO, BWT, RW, BuB, IuF, Mt, PuG, D) — không dính tên giáo viên, không chia vụn
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setShowPresetSubjects((v) => !v);
                          setShowCreateSubjectForm(false);
                        }}
                        className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Bộ môn chuẩn
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateSubjectForm((v) => !v);
                          setShowPresetSubjects(false);
                        }}
                        className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> Thêm môn
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => triggerAddKnowledge(subjectFilterId !== 'all' ? subjectFilterId : '')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Nạp OneNote / PDF
                  </button>
                </div>
              </div>

              {/* Admin hint if not logged in */}
              {!isAdmin && (
                <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/70 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <span className="text-indigo-900 dark:text-indigo-200">
                    Đăng nhập quyền Admin để tạo bộ môn chuẩn, đổi tên môn, gộp môn hoặc sắp xếp lại bài học.
                  </span>
                  <button
                    onClick={() => openOverlay('auth', () => setShowAuthModal(true))}
                    className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg shrink-0"
                  >
                    Đăng nhập Admin
                  </button>
                </div>
              )}

              {/* ADMIN: 1-Click School Subject Presets Drawer */}
              {isAdmin && showPresetSubjects && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-300 dark:border-emerald-800 p-5 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Khởi tạo nhanh danh sách môn học chuẩn (khớp OneNote, đã bỏ tên thầy cô)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Bấm 1 nút để tạo toàn bộ các môn còn thiếu — hoặc bấm từng môn riêng lẻ bên dưới. Sau khi tạo xong, bạn có thể gộp/sửa 2 môn cũ vào đúng môn chuẩn.
                      </p>
                    </div>
                    <button onClick={() => setShowPresetSubjects(false)} className="p-1 text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SCHOOL_SUBJECT_PRESETS.map((preset) => {
                      const alreadyExists = subjects.some(
                        (s) =>
                          (s.title_de || '').toLowerCase() === preset.title_de.toLowerCase() ||
                          parseSubjectTitle(s.title_de).code.toLowerCase() === preset.code.toLowerCase()
                      );
                      return (
                        <div
                          key={preset.code}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 ${
                            alreadyExists
                              ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-65'
                              : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-600 text-white">
                                {preset.code}
                              </span>
                              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                {parseSubjectTitle(preset.title_de).name}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{preset.title_vn}</p>
                          </div>
                          {alreadyExists ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">Đã có</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busySubjectAction}
                              onClick={() => handleInitPresetSubjects([preset])}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 shrink-0"
                            >
                              + Thêm
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPresetSubjects(false)}
                      className="px-3.5 py-2 text-xs font-bold text-slate-500"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      disabled={busySubjectAction}
                      onClick={() => handleInitPresetSubjects(SCHOOL_SUBJECT_PRESETS)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm"
                    >
                      {busySubjectAction ? 'Đang khởi tạo...' : 'Tạo tất cả các môn còn thiếu'}
                    </button>
                  </div>
                </div>
              )}

              {/* ADMIN: Manual Create New Subject Form */}
              {isAdmin && showCreateSubjectForm && (
                <form
                  onSubmit={handleSubmitNewSubjectForm}
                  className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800 p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Tạo môn học mới</h2>
                    <button type="button" onClick={() => setShowCreateSubjectForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <input
                      value={newSubjectDraft.code}
                      onChange={(e) => setNewSubjectDraft({ ...newSubjectDraft, code: e.target.value })}
                      placeholder="Mã môn (VD: VKO, PuG, RW)"
                      className="sm:col-span-3 px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                    />
                    <input
                      value={newSubjectDraft.title_de}
                      onChange={(e) => setNewSubjectDraft({ ...newSubjectDraft, title_de: e.target.value })}
                      placeholder="Tên tiếng Đức (VD: Politik und Gesellschaft)"
                      className="sm:col-span-5 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                    />
                    <input
                      value={newSubjectDraft.title_vn}
                      onChange={(e) => setNewSubjectDraft({ ...newSubjectDraft, title_vn: e.target.value })}
                      placeholder="Tên tiếng Việt (VD: Chính trị & Xã hội)"
                      className="sm:col-span-4 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateSubjectForm(false)}
                      className="px-3.5 py-2 text-xs font-bold text-slate-500"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={busySubjectAction}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                    >
                      {busySubjectAction ? 'Đang lưu...' : 'Lưu môn học'}
                    </button>
                  </div>
                </form>
              )}

              {/* Subject Filter Pills & Quick Search Bar (Giữ giao diện gọn sạch kể cả khi có 8+ môn) */}
              {!loadingData && subjects.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setSubjectFilterId('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        subjectFilterId === 'all'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                      }`}
                    >
                      Tất cả ({subjects.length} môn · {lessons.length} bài)
                    </button>
                    {subjects.map((sub) => {
                      const parsed = parseSubjectTitle(sub.title_de);
                      const count = lessons.filter((l) => l.subject_id === sub.id).length;
                      const active = subjectFilterId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setSubjectFilterId(sub.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1.5 ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                          }`}
                        >
                          <span>{parsed.code || parsed.name.slice(0, 18)}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                              active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={subjectLessonSearch}
                        onChange={(e) => setSubjectLessonSearch(e.target.value)}
                        placeholder="Lọc nhanh bài học theo tên bài hoặc tên file OneNote (VD: 2.4, Bemessung, GuV, OHG...)"
                        className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {subjectLessonSearch && (
                        <button
                          onClick={() => setSubjectLessonSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {subjectFilterId === 'all' && subjects.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const anyExpanded = subjects.some((s) => !collapsedSubjectIds[s.id]);
                          const next = {};
                          subjects.forEach((s) => {
                            next[s.id] = anyExpanded;
                          });
                          setCollapsedSubjectIds(next);
                        }}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-400 shrink-0"
                      >
                        {subjects.some((s) => !collapsedSubjectIds[s.id]) ? 'Thu gọn tất cả' : 'Mở tất cả'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {loadingData ? (
                <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <p className="text-sm">Đang tải kho môn học...</p>
                </div>
              ) : subjects.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
                  <GraduationCap className="w-12 h-12 text-indigo-500 mx-auto" />
                  <p className="text-base font-bold">Chưa có môn học nào.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {subjects
                    .filter((sub) => subjectFilterId === 'all' || sub.id === subjectFilterId)
                    .map((sub) => {
                      const subIndex = subjects.findIndex((s) => s.id === sub.id);
                      const parsed = parseSubjectTitle(sub.title_de);
                      const query = subjectLessonSearch.trim().toLowerCase();
                      const allSubLessons = lessons
                        .filter((l) => l.subject_id === sub.id)
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                      const subLessons = query
                        ? allSubLessons.filter(
                            (l) =>
                              (l.title_de || '').toLowerCase().includes(query) ||
                              (l.title_vn || '').toLowerCase().includes(query) ||
                              (sub.title_de || '').toLowerCase().includes(query) ||
                              (lessonSourceFilesMap[l.id] || []).some((f) => f.toLowerCase().includes(query))
                          )
                        : allSubLessons;

                      if (query && subLessons.length === 0) return null;

                      const subCards = flashcards.filter((c) => c.subject_id === sub.id);
                      const subMastered = subCards.filter((c) => progressMap[c.id]?.status === 'mastered').length;
                      const subPct = subCards.length ? Math.round((subMastered / subCards.length) * 100) : 0;
                      const isCollapsed = !query && subjectFilterId === 'all' && Boolean(collapsedSubjectIds[sub.id]);
                      const isEditingSub = editingSubjectId === sub.id;
                      const isMergingSub = mergingSubjectId === sub.id;

                      return (
                        <section
                          key={sub.id}
                          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                        >
                          {/* Subject Card Header */}
                          <div className="p-5 sm:px-6 border-b border-slate-100 dark:border-slate-800 space-y-3">
                            {isEditingSub ? (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold uppercase text-indigo-600">Đổi tên môn học</span>
                                  <button onClick={() => setEditingSubjectId(null)} className="text-xs text-slate-500">Hủy</button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                  <input
                                    value={editSubjectDraft.code}
                                    onChange={(e) => setEditSubjectDraft({ ...editSubjectDraft, code: e.target.value })}
                                    placeholder="Mã (VD: RW, BuB, PuG)"
                                    className="sm:col-span-3 px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                                  />
                                  <input
                                    value={editSubjectDraft.title_de}
                                    onChange={(e) => setEditSubjectDraft({ ...editSubjectDraft, title_de: e.target.value })}
                                    placeholder="Tên tiếng Đức"
                                    className="sm:col-span-5 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                                  />
                                  <input
                                    value={editSubjectDraft.title_vn}
                                    onChange={(e) => setEditSubjectDraft({ ...editSubjectDraft, title_vn: e.target.value })}
                                    placeholder="Tên tiếng Việt"
                                    className="sm:col-span-4 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    disabled={busySubjectAction}
                                    onClick={() => handleSaveEditedSubject(sub.id)}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                                  >
                                    <Save className="w-3.5 h-3.5" /> Lưu tên môn
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div
                                  className="space-y-1 flex-1 min-w-0 cursor-pointer"
                                  onClick={() =>
                                    setCollapsedSubjectIds((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))
                                  }
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {parsed.code && (
                                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-indigo-600 text-white tracking-wide">
                                        {parsed.code}
                                      </span>
                                    )}
                                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                                      {parsed.name}
                                    </h2>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                      {allSubLessons.length} bài
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        speakGerman(parsed.name, ttsRate);
                                      }}
                                      className="p-1 text-slate-400 hover:text-indigo-600"
                                      title="Nghe phát âm tên môn"
                                    >
                                      <Volume2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {showVn && sub.title_vn && (
                                    <p className="text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                                      {sub.title_vn}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                                  {/* Progress */}
                                  <div className="text-left sm:text-right mr-1">
                                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                      {subMastered}/{subCards.length} thẻ ({subPct}%)
                                    </p>
                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1 sm:ml-auto">
                                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${subPct}%` }} />
                                    </div>
                                  </div>

                                  {/* Admin Subject Actions */}
                                  {isAdmin && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => triggerAddKnowledge(sub.id)}
                                        title={`Nạp bài mới trực tiếp vào môn ${sub.title_de}`}
                                        className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold inline-flex items-center gap-1 border border-indigo-200 dark:border-indigo-800"
                                      >
                                        <Plus className="w-3.5 h-3.5" /> Nạp bài
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingSubjectId(sub.id);
                                          setEditSubjectDraft({
                                            code: parsed.code,
                                            title_de: parsed.name,
                                            title_vn: sub.title_vn || '',
                                          });
                                        }}
                                        title="Đổi tên môn học"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      {subjects.length > 1 && (
                                        <button
                                          onClick={() => setMergingSubjectId(isMergingSub ? null : sub.id)}
                                          title="Gộp toàn bộ bài của môn này sang môn khác"
                                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        >
                                          <GitMerge className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleReorderSubject(subIndex, -1)}
                                        disabled={subIndex === 0}
                                        title="Đẩy môn lên trên"
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                                      >
                                        <ChevronUp className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleReorderSubject(subIndex, 1)}
                                        disabled={subIndex === subjects.length - 1}
                                        title="Đẩy môn xuống dưới"
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSubject(sub)}
                                        title="Xóa môn học"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}

                                  {/* Collapse/Expand Arrow */}
                                  {subjectFilterId === 'all' && !query && (
                                    <button
                                      onClick={() =>
                                        setCollapsedSubjectIds((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))
                                      }
                                      title={isCollapsed ? 'Mở danh sách bài' : 'Thu gọn'}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Inline Merge Subject Picker */}
                            {isAdmin && isMergingSub && (
                              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-amber-900 dark:text-amber-200">
                                    Gộp tất cả {allSubLessons.length} bài của "{sub.title_de}" vào môn nào?
                                  </span>
                                  <button onClick={() => setMergingSubjectId(null)} className="text-slate-500">Hủy</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {subjects
                                    .filter((other) => other.id !== sub.id)
                                    .map((other) => (
                                      <button
                                        key={other.id}
                                        type="button"
                                        disabled={busySubjectAction}
                                        onClick={() => handleMergeSubject(sub.id, other.id)}
                                        className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                      >
                                        → {other.title_de}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Lessons List inside Subject */}
                          {!isCollapsed && (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {subLessons.length === 0 ? (
                                <div className="p-5 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-center gap-2">
                                  <span>Môn này chưa có bài học nào.</span>
                                  {isAdmin && (
                                    <button
                                      onClick={() => triggerAddKnowledge(sub.id)}
                                      className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                                    >
                                      + Nạp bài đầu tiên vào môn này
                                    </button>
                                  )}
                                </div>
                              ) : (
                                subLessons.map((les, idx) => {
                                  const meta = LEVEL_META[les.level] || LEVEL_META.foundation;
                                  const lesVocabCount = vocabularies.filter((v) => v.lesson_id === les.id).length;
                                  const lesCardCount = flashcards.filter((c) => c.lesson_id === les.id).length;
                                  const lesQuizCount = quizQuestions.filter((q) => q.lesson_id === les.id).length;
                                  const latestAttempt = quizAttempts.find((a) => a.lesson_id === les.id);
                                  const lesSourceFiles = lessonSourceFilesMap[les.id] || [];

                                  return (
                                    <div
                                      key={les.id}
                                      onClick={() => openLesson(les.id)}
                                      className="p-4 sm:px-6 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition cursor-pointer flex items-center justify-between gap-3 group"
                                    >
                                      <div className="flex items-start gap-3.5 min-w-0">
                                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 transition">
                                          {idx + 1}
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}>
                                              {meta.label}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                              {lesVocabCount} từ · {lesCardCount} thẻ · {lesQuizCount} câu test
                                            </span>
                                            {latestAttempt && (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                                <Award className="w-3 h-3" /> {latestAttempt.score_percent}%
                                              </span>
                                            )}
                                          </div>
                                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                                            {les.title_de}
                                          </h3>
                                          {showVn && les.title_vn && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{les.title_vn}</p>
                                          )}
                                          {/* Nhãn file gốc OneNote / PDF giúp đối chiếu ngay file nào đã nạp */}
                                          {(lesSourceFiles.length > 0 || isAdmin) && (
                                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5" onClick={(e) => e.stopPropagation()}>
                                              {lesSourceFiles.map((fname, fIdx) => (
                                                <span
                                                  key={fIdx}
                                                  title={`File gốc đã nạp: ${fname}`}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/70 max-w-[260px] sm:max-w-sm truncate"
                                                >
                                                  <FileText className="w-3 h-3 shrink-0 opacity-80" />
                                                  <span className="truncate">{fname}</span>
                                                </span>
                                              ))}
                                              {isAdmin && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    if (editingSourceTagLessonId === les.id) {
                                                      setEditingSourceTagLessonId(null);
                                                    } else {
                                                      setEditingSourceTagLessonId(les.id);
                                                      setEditSourceTagDraft(lesSourceFiles.join(', '));
                                                    }
                                                  }}
                                                  title={
                                                    lesSourceFiles.length > 0
                                                      ? 'Sửa nhãn tên file gốc OneNote'
                                                      : 'Gắn nhanh mã / tên file gốc OneNote (VD: 2.1 S_Künstlersozial...)'
                                                  }
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 transition"
                                                >
                                                  <Tag className="w-2.5 h-2.5" />
                                                  {lesSourceFiles.length > 0 ? 'Sửa nhãn' : '+ Gắn tên file'}
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        {isAdmin && (
                                          <>
                                            <button
                                              onClick={() => handleReorderLesson(allSubLessons, idx, -1)}
                                              disabled={idx === 0}
                                              title="Đẩy lên trên"
                                              className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                                            >
                                              <ChevronUp className="w-4 h-4" />
                                            </button>
                                            <button
                                              onClick={() => handleReorderLesson(allSubLessons, idx, 1)}
                                              disabled={idx === allSubLessons.length - 1}
                                              title="Đẩy xuống dưới"
                                              className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-25"
                                            >
                                              <ChevronDown className="w-4 h-4" />
                                            </button>
                                            {subjects.length > 1 && (
                                              <button
                                                onClick={() => setMovingLessonId(movingLessonId === les.id ? null : les.id)}
                                                title="Chuyển sang môn khác"
                                                className="p-1.5 text-slate-400 hover:text-amber-600"
                                              >
                                                <FolderInput className="w-4 h-4" />
                                              </button>
                                            )}
                                            <button
                                              onClick={() => handleDeleteLesson(les.id, les.title_de)}
                                              title="Xóa bài học"
                                              className="p-1.5 text-slate-400 hover:text-rose-600"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </>
                                        )}
                                        <ChevronRight
                                          onClick={() => openLesson(les.id)}
                                          className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 ml-1"
                                        />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {/* Inline Move Lesson Picker */}
                          {movingLessonId && allSubLessons.some((l) => l.id === movingLessonId) && (
                            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800 flex flex-wrap items-center gap-3 text-xs">
                              <span className="font-bold text-amber-900 dark:text-amber-200">Chuyển bài này sang môn:</span>
                              {subjects
                                .filter((other) => other.id !== sub.id)
                                .map((other) => (
                                  <button
                                    key={other.id}
                                    onClick={() => handleMoveLessonSubject(movingLessonId, other.id)}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg font-bold hover:bg-amber-100"
                                  >
                                    {other.title_de}
                                  </button>
                                ))}
                              <button onClick={() => setMovingLessonId(null)} className="text-slate-500 ml-auto">
                                Hủy
                              </button>
                            </div>
                          )}

                          {/* Inline Source File Tag Editor (gắn nhanh mã / tên file OneNote cho bài cũ chỉ trong 2 giây) */}
                          {isAdmin && editingSourceTagLessonId && allSubLessons.some((l) => l.id === editingSourceTagLessonId) && (
                            <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border-t border-sky-200 dark:border-sky-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 text-xs">
                              <div className="flex items-center gap-1.5 font-extrabold text-sky-900 dark:text-sky-200 shrink-0">
                                <Tag className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                                <span>Nhãn file gốc:</span>
                              </div>
                              <input
                                value={editSourceTagDraft}
                                autoFocus
                                onChange={(e) => setEditSourceTagDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveLessonSourceFiles(editingSourceTagLessonId, editSourceTagDraft);
                                  } else if (e.key === 'Escape') {
                                    setEditingSourceTagLessonId(null);
                                  }
                                }}
                                placeholder="Gõ mã / tên file OneNote (VD: 2.1 S_Künstlersozialversicherung — nhiều file ngăn bằng dấu phẩy)"
                                className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleSaveLessonSourceFiles(editingSourceTagLessonId, editSourceTagDraft)}
                                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg inline-flex items-center gap-1"
                                >
                                  <Save className="w-3.5 h-3.5" /> Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSourceTagLessonId(null)}
                                  className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-semibold"
                                >
                                  Hủy
                                </button>
                              </div>
                            </div>
                          )}
                        </section>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ==================== VIEW 3: LESSON DETAIL (4 TABS) ==================== */}
          {view === 'lesson' && activeLesson && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => navigate('subjects')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" /> Quay lại Môn học
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openOverlay('upgrade', () => setShowUpgradeLessonModal(true))}
                      title="Nâng cấp bài học này theo chuẩn AI mới nhất hoặc bổ sung thêm trang tài liệu mới mà không cần xóa bài cũ"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Cập nhật bài
                    </button>
                  )}
                  {activeSourceImages.length > 0 && (
                    <button
                      onClick={() => setShowBoardPhoto((s) => !s)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 transition"
                    >
                      <ImageIcon className="w-4 h-4" />
                      {showBoardPhoto
                        ? 'Ẩn ảnh bản gốc'
                        : `Xem ảnh bản gốc${activeSourceImages.length > 1 ? ` (${activeSourceImages.length} trang)` : ''}`}
                    </button>
                  )}
                  {activeSubject && (
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{activeSubject.title_de}</span>
                  )}
                </div>
              </div>

              {showBoardPhoto && activeSourceImages.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-4 sm:p-5 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                        Ảnh chụp bảng / tài liệu gốc ({activeSourceImages.length} trang)
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Bấm trực tiếp vào bất kỳ trang nào để mở toàn màn hình, phóng to & đọc rõ từng chữ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openBoardLightbox(0)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Phóng to toàn màn hình
                    </button>
                  </div>

                  {activeSourceImages.length === 1 ? (
                    <button
                      type="button"
                      onClick={() => openBoardLightbox(0)}
                      className="group relative block w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                      title="Bấm để phóng to toàn màn hình"
                    >
                      <img
                        src={activeSourceImages[0].url}
                        alt={activeSourceImages[0].label}
                        className="w-full max-h-[28rem] object-contain mx-auto"
                      />
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/85 text-white text-xs font-bold shadow group-hover:bg-indigo-600 transition">
                        <ZoomIn className="w-3.5 h-3.5" /> Bấm để phóng to
                      </span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {activeSourceImages.map((imgItem, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => openBoardLightbox(idx)}
                          className="group relative rounded-xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-500 bg-white dark:bg-slate-800 transition text-left cursor-zoom-in shadow-sm"
                          title={`Bấm để phóng to ${imgItem.label}`}
                        >
                          <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                            <img
                              src={imgItem.url}
                              alt={imgItem.label}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 transition flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow transition">
                              <ZoomIn className="w-3.5 h-3.5" /> Phóng to
                            </span>
                          </div>
                          <div className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1">
                            <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                              {imgItem.label}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">
                              {idx + 1}/{activeSourceImages.length}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Lesson Hero Card */}
              <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        (LEVEL_META[activeLesson.level] || LEVEL_META.foundation).badgeClass
                      }`}
                    >
                      {(LEVEL_META[activeLesson.level] || LEVEL_META.foundation).label} ·{' '}
                      {(LEVEL_META[activeLesson.level] || LEVEL_META.foundation).de}
                    </span>
                    <button
                      onClick={() => speakGerman(`${activeLesson.title_de}. ${activeLesson.overview_de}`, ttsRate)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 text-xs font-semibold"
                    >
                      <Volume2 className="w-4 h-4" /> Nghe khái quát
                    </button>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                    <RichContent text={activeLesson.title_de} isGerman dictMode={dictMode} onWordClick={handleWordClick} />
                  </h1>
                  {showVn && activeLesson.title_vn && (
                    <p className="text-base font-semibold text-indigo-600 dark:text-indigo-400">{activeLesson.title_vn}</p>
                  )}

                  {/* Nhãn file gốc OneNote / PDF ngay đầu bài học */}
                  {(activeSourceFiles.length > 0 || isAdmin) && (
                    <div className="pt-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {activeSourceFiles.map((fname, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/80"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>File gốc: {fname}</span>
                          </span>
                        ))}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              if (editingSourceTagLessonId === activeLesson.id) {
                                setEditingSourceTagLessonId(null);
                              } else {
                                setEditingSourceTagLessonId(activeLesson.id);
                                setEditSourceTagDraft(activeSourceFiles.join(', '));
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 bg-slate-100/80 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 transition"
                          >
                            <Tag className="w-3 h-3" />
                            {activeSourceFiles.length > 0 ? 'Sửa nhãn file' : '+ Gắn nhãn file OneNote'}
                          </button>
                        )}
                      </div>

                      {isAdmin && editingSourceTagLessonId === activeLesson.id && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
                          <input
                            value={editSourceTagDraft}
                            autoFocus
                            onChange={(e) => setEditSourceTagDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveLessonSourceFiles(activeLesson.id, editSourceTagDraft);
                              } else if (e.key === 'Escape') {
                                setEditingSourceTagLessonId(null);
                              }
                            }}
                            placeholder="VD: 2.4 S_Bemessungsgrundlage_Zuständigkeiten_und_Meldung.pdf"
                            className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSaveLessonSourceFiles(activeLesson.id, editSourceTagDraft)}
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1"
                            >
                              <Save className="w-3.5 h-3.5" /> Lưu nhãn
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSourceTagLessonId(null)}
                              className="px-2.5 py-1.5 text-xs text-slate-500 font-semibold"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Overview */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Khái quát chung (Überblick) {dictMode && '· Bấm bất kỳ từ tiếng Đức nào để dịch'}
                  </div>
                  <div className="text-sm sm:text-base text-slate-800 dark:text-slate-100 font-medium">
                    <RichContent text={activeLesson.overview_de} isGerman dictMode={dictMode} onWordClick={handleWordClick} />
                  </div>
                  {showVn && activeLesson.overview_vn && (
                    <div className="bg-white dark:bg-slate-900 border-l-4 border-indigo-400 rounded-r-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      <RichContent text={activeLesson.overview_vn} mixedGerman dictMode={dictMode} onWordClick={handleWordClick} />
                    </div>
                  )}
                </div>

                {/* 4 Clean Lesson Tabs: Học bài | Từ vựng | Flashcards | Bài Test */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {[
                    { id: 'study', label: '1. Học bài', count: `${activeSections.length} mục` },
                    { id: 'vocab', label: '2. Từ vựng', count: `${activeVocabs.length} từ` },
                    { id: 'cards', label: '3. Flashcards', count: `${activeCards.length} thẻ` },
                    { id: 'quiz', label: '4. Bài Test', count: `${activeQuiz.length} câu` },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => switchLessonTab(t.id)}
                      className={`py-3 px-3 rounded-2xl text-center border transition ${
                        lessonTab === t.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="text-xs sm:text-sm font-bold">{t.label}</div>
                      <div className={`text-[11px] mt-0.5 ${lessonTab === t.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {t.count}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* TAB 1: STUDY SECTIONS */}
              {lessonTab === 'study' && (
                <div className="space-y-5">
                  {activeSections.map((sec) => {
                    const isExplainOpen = Boolean(openExplainIds[sec.id]);
                    const isExplaining = loadingExplainId === sec.id;
                    const isEditing = editingSectionId === sec.id;
                    const videos = Array.isArray(sec.video_urls) ? sec.video_urls : [];
                    const videoKeywords = Array.isArray(sec.video_keywords) ? sec.video_keywords : [];
                    const secChatKey = `section:${sec.id}`;
                    const secChatMessages = aiChatsMap[secChatKey] || [];
                    const isChatOpen = Boolean(openChatKeys[secChatKey]);

                    return (
                      <article
                        key={sec.id}
                        data-ai-section-id={sec.id}
                        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-7 space-y-4"
                      >
                        {isEditing ? (
                          /* ADMIN INLINE EDIT FORM */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold uppercase text-indigo-600">Chỉnh sửa mục học (Admin)</span>
                              <button onClick={() => setEditingSectionId(null)} className="text-xs text-slate-500">Hủy</button>
                            </div>
                            <input
                              value={editSectionDraft.heading_de || ''}
                              onChange={(e) => setEditSectionDraft({ ...editSectionDraft, heading_de: e.target.value })}
                              className="w-full px-3 py-2 text-sm font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                              placeholder="Tiêu đề tiếng Đức"
                            />
                            <input
                              value={editSectionDraft.heading_vn || ''}
                              onChange={(e) => setEditSectionDraft({ ...editSectionDraft, heading_vn: e.target.value })}
                              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                              placeholder="Tiêu đề tiếng Việt"
                            />
                            <textarea
                              rows={5}
                              value={editSectionDraft.content_de || ''}
                              onChange={(e) => setEditSectionDraft({ ...editSectionDraft, content_de: e.target.value })}
                              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                              placeholder="Nội dung tiếng Đức (hỗ trợ bảng Markdown | Col1 | Col2 |)"
                            />
                            <textarea
                              rows={4}
                              value={editSectionDraft.content_vn || ''}
                              onChange={(e) => setEditSectionDraft({ ...editSectionDraft, content_vn: e.target.value })}
                              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                              placeholder="Bản dịch tiếng Việt"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleSaveEditedSection(sec.id)}
                                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                              >
                                <Save className="w-3.5 h-3.5" /> Lưu thay đổi
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Heading & Tools */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white leading-snug">
                                  <RichContent text={sec.heading_de} isGerman dictMode={dictMode} onWordClick={handleWordClick} />
                                </h2>
                                {showVn && sec.heading_vn && (
                                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{sec.heading_vn}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      setEditingSectionId(sec.id);
                                      setEditSectionDraft({
                                        heading_de: sec.heading_de,
                                        heading_vn: sec.heading_vn,
                                        content_de: sec.content_de,
                                        content_vn: sec.content_vn,
                                      });
                                    }}
                                    title="Chỉnh sửa tay nội dung này"
                                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => speakGerman(`${sec.heading_de}. ${sec.content_de}`, ttsRate)}
                                  title="Nghe đoạn kiến thức tiếng Đức"
                                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* German Content (Tables + Click-to-translate) */}
                            <div className="text-[15px] sm:text-base text-slate-800 dark:text-slate-100">
                              <RichContent text={sec.content_de} isGerman dictMode={dictMode} onWordClick={handleWordClick} />
                            </div>

                            {/* Vietnamese Content */}
                            {showVn && sec.content_vn && (
                              <div className="bg-slate-50 dark:bg-slate-800/60 border-l-4 border-indigo-400 border border-slate-200/70 dark:border-slate-700 rounded-r-2xl px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                                <RichContent text={sec.content_vn} mixedGerman dictMode={dictMode} onWordClick={handleWordClick} />
                              </div>
                            )}

                            {/* Visual Diagram / Chart / T-Konto */}
                            {sec.diagram_json && <DiagramRenderer diagram={sec.diagram_json} />}

                            {/* Easy Explanation + Video Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleToggleExplain(sec)}
                                disabled={isExplaining}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                                  isExplainOpen
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                }`}
                              >
                                {isExplaining ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> AI đang giải thích...
                                  </>
                                ) : (
                                  <>
                                    <Lightbulb className="w-4 h-4" />
                                    {isExplainOpen ? 'Ẩn giải thích' : 'Giải thích dễ hiểu & Ví dụ'}
                                  </>
                                )}
                              </button>

                              {/* Nút mở Gia sư AI riêng cho mục học này */}
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenChatKeys((prev) => ({ ...prev, [secChatKey]: !prev[secChatKey] }))
                                }
                                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                                  isChatOpen
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                }`}
                              >
                                <Bot className="w-4 h-4" />
                                <span>{isChatOpen ? 'Ẩn Gia sư AI' : 'Hỏi Gia sư AI'}</span>
                                {secChatMessages.length > 0 && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none ${
                                      isChatOpen
                                        ? 'bg-white/20 text-white'
                                        : 'bg-indigo-600 text-white'
                                    }`}
                                  >
                                    {secChatMessages.length}
                                  </span>
                                )}
                              </button>

                              {/* Quick YouTube Video Search Pills */}
                              {videoKeywords.map((vk, vkIdx) => (
                                <a
                                  key={vkIdx}
                                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(vk.query || sec.heading_de)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition"
                                >
                                  <PlayCircle className="w-4 h-4" />
                                  {vk.label || 'Xem video tình huống'}
                                  <ExternalLink className="w-3 h-3 opacity-60" />
                                </a>
                              ))}

                              {videoKeywords.length === 0 && (
                                <a
                                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${sec.heading_de} einfach erklärt Veranstaltungskaufmann`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                >
                                  <PlayCircle className="w-4 h-4" /> Tìm video tình huống YouTube
                                  <ExternalLink className="w-3 h-3 opacity-60" />
                                </a>
                              )}

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setVideoInputSectionId(videoInputSectionId === sec.id ? null : sec.id)}
                                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Nhúng link YouTube
                                </button>
                              )}
                            </div>

                            {/* Admin Embed YouTube Input */}
                            {videoInputSectionId === sec.id && (
                              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row gap-2">
                                <input
                                  value={videoDraft.title}
                                  onChange={(e) => setVideoDraft({ ...videoDraft, title: e.target.value })}
                                  placeholder="Tiêu đề clip (VD: Tình huống thực tế BGB)"
                                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                                />
                                <input
                                  value={videoDraft.url}
                                  onChange={(e) => setVideoDraft({ ...videoDraft, url: e.target.value })}
                                  placeholder="Dán link YouTube (https://youtube.com/watch?v=...)"
                                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                                />
                                <button
                                  onClick={() => handleAddYouTubeVideo(sec)}
                                  className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg shrink-0"
                                >
                                  Nhúng video
                                </button>
                              </div>
                            )}

                            {/* Embedded Real YouTube Videos */}
                            {videos.length > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                {videos.map((vid, vIdx) => {
                                  const ytId = extractYouTubeId(vid.url);
                                  if (!ytId) return null;
                                  return (
                                    <div key={vIdx} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
                                      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-white text-xs">
                                        <span className="font-semibold truncate">{vid.title}</span>
                                        {isAdmin && (
                                          <button onClick={() => handleRemoveYouTubeVideo(sec, vIdx)} className="text-slate-400 hover:text-rose-400">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                      <div className="aspect-video">
                                        <iframe
                                          className="w-full h-full"
                                          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                                          title={vid.title}
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                          allowFullScreen
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Easy Explanation Expanded */}
                            {isExplainOpen && (sec.explanation_de || sec.explanation_vn) && (
                              <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 sm:p-5 space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5" /> Giải thích dễ hiểu (Einfach erklärt)
                                    </span>
                                    {sec.explanation_de && (
                                      <button onClick={() => speakGerman(sec.explanation_de, ttsRate)} className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-800 text-emerald-700">
                                        <Volume2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  {sec.explanation_de && (
                                    <RichContent
                                      text={sec.explanation_de}
                                      isGerman
                                      dictMode={dictMode}
                                      onWordClick={handleWordClick}
                                      className="text-sm font-medium text-slate-900 dark:text-slate-100"
                                    />
                                  )}
                                  {showVn && sec.explanation_vn && (
                                    <div className="text-sm text-emerald-950 dark:text-emerald-100 bg-white/80 dark:bg-slate-900/70 border-l-4 border-emerald-500 rounded-r-xl px-3.5 py-2.5 leading-relaxed">
                                      <RichContent text={sec.explanation_vn} mixedGerman dictMode={dictMode} onWordClick={handleWordClick} />
                                    </div>
                                  )}
                                </div>
                                {(sec.example_de || sec.example_vn) && (
                                  <div className="pt-3 border-t border-emerald-200/80 dark:border-emerald-800 space-y-1.5">
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                      Ví dụ thực tế ngành sự kiện
                                    </span>
                                    {sec.example_de && (
                                      <div className="text-sm text-slate-800 dark:text-slate-200">
                                        <RichContent text={sec.example_de} isGerman dictMode={dictMode} onWordClick={handleWordClick} />
                                      </div>
                                    )}
                                    {showVn && sec.example_vn && (
                                      <div className="text-xs text-slate-600 dark:text-slate-400 italic">
                                        <RichContent text={sec.example_vn} mixedGerman dictMode={dictMode} onWordClick={handleWordClick} />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {sec.exam_tip_vn && (
                                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                                    <strong className="block">Mẹo đi thi IHK:</strong>
                                    <RichContent text={sec.exam_tip_vn} mixedGerman dictMode={dictMode} onWordClick={handleWordClick} />
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Embedded Dedicated AI Tutor Chat (lưu riêng cho từng mục học) */}
                            <div id={`ai-chat-anchor-${sec.id}`}>
                              {isChatOpen && (
                                <SectionAiChat
                                  contextKey={secChatKey}
                                  contextType="section"
                                  subjectName={activeSubject?.title_de || ''}
                                  lessonTitle={activeLesson?.title_de || ''}
                                  sectionHeading={sec.heading_de || ''}
                                  sectionContentDe={sec.content_de || ''}
                                  sectionContentVn={sec.content_vn || ''}
                                  diagramJson={sec.diagram_json || null}
                                  messages={secChatMessages}
                                  onUpdateMessages={handleUpdateAiChat}
                                  onPinToNote={(replyText) => handlePinAiReplyToSectionNote(sec.id, replyText)}
                                  onWordClick={handleWordClick}
                                  isCloudSynced={aiChatCloudReady}
                                  pendingQuote={pendingChatQuotes[secChatKey] || ''}
                                  onClearPendingQuote={() =>
                                    setPendingChatQuotes((prev) => {
                                      if (!prev[secChatKey]) return prev;
                                      const next = { ...prev };
                                      delete next[secChatKey];
                                      return next;
                                    })
                                  }
                                  onClose={() =>
                                    setOpenChatKeys((prev) => ({ ...prev, [secChatKey]: false }))
                                  }
                                />
                              )}
                            </div>

                            {/* Personal Notes (Eigene Notizen) */}
                            <details className="pt-2 border-t border-slate-100 dark:border-slate-800">
                              <summary className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 cursor-pointer flex items-center gap-1.5 list-none">
                                <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                                Ghi chú cá nhân (Eigene Notizen){sectionNotes[sec.id] ? ' · Đã có ghi chú' : ''}
                              </summary>
                              <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                                <textarea
                                  rows={2}
                                  value={sectionNotes[sec.id] || ''}
                                  onChange={(e) => setSectionNotes((prev) => ({ ...prev, [sec.id]: e.target.value }))}
                                  placeholder="Tự ghi mẹo nhớ, ví dụ ở chỗ làm blu bowl hoặc lưu ý riêng của bạn..."
                                  className="flex-1 p-2.5 text-xs bg-amber-50/50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 rounded-xl"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveSectionNote(sec.id, sectionNotes[sec.id] || '')}
                                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shrink-0 self-end"
                                >
                                  Lưu Note
                                </button>
                              </div>
                            </details>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {/* TAB 2: LESSON VOCABULARY */}
              {lessonTab === 'vocab' && (
                <VocabView
                  vocabularies={activeVocabs}
                  dictCache={dictCache}
                  ttsRate={ttsRate}
                  isAdmin={isAdmin}
                  isLessonScoped
                  onGenerateMoreVocab={handleGenerateMoreVocab}
                  onAddManualVocab={handleAddManualVocab}
                  onDeleteVocab={handleDeleteVocab}
                  onLookupDictionary={handleDirectDictionaryLookup}
                  onWordClick={handleWordClick}
                />
              )}

              {/* TAB 3: LESSON FLASHCARDS */}
              {lessonTab === 'cards' && (
                <FlashcardDeck
                  cards={activeCards}
                  progressMap={progressMap}
                  onSetMastery={handleSetMastery}
                  showVn={showVn}
                  ttsRate={ttsRate}
                  dictMode={dictMode}
                  onWordClick={handleWordClick}
                  isAdmin={isAdmin}
                  onGenerateMoreCards={handleGenerateMoreCards}
                  onAddManualCard={handleAddManualCard}
                  onDeleteCard={handleDeleteCard}
                />
              )}

              {/* TAB 4: LESSON QUIZ */}
              {lessonTab === 'quiz' && (() => {
                const quizChatKey = `quiz:${activeLesson.id}`;
                const quizChatMessages = aiChatsMap[quizChatKey] || [];
                const isQuizChatOpen = Boolean(openChatKeys[quizChatKey]);
                const quizContextDigest = activeQuiz
                  .map((q, idx) => {
                    const opts = Array.isArray(q.options) && q.options.length
                      ? q.options
                          .map((o, oi) => `${String.fromCharCode(65 + oi)}) ${o.de}${oi === q.correct_index ? ' [ĐÚNG]' : ''}`)
                          .join(' | ')
                      : '';
                    return `Câu ${idx + 1} (${q.q_type}): ${q.question_de}${opts ? `\nĐáp án: ${opts}` : ''}${
                      q.model_answer_de ? `\nBài mẫu: ${q.model_answer_de}` : ''
                    }${q.explanation_vn ? `\nGiải thích: ${q.explanation_vn}` : ''}`;
                  })
                  .join('\n---\n');

                return (
                  <div className="space-y-5">
                    <QuizPanel
                      questions={activeQuiz}
                      showVn={showVn}
                      ttsRate={ttsRate}
                      dictMode={dictMode}
                      onWordClick={handleWordClick}
                      isAdmin={isAdmin}
                      onSaveAttempt={handleSaveQuizAttempt}
                      onLogMistakes={(m) => handleLogMistakes(m, 'lesson')}
                      onAppendMoreQuiz={handleAppendMoreQuiz}
                    />

                    {/* Gia sư AI riêng cho Bài Test của bài học này */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800/80 p-4 sm:p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Gia sư AI giải đáp riêng cho Bài Test này
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Kẹt câu số mấy cứ hỏi thẳng (VD: &ldquo;Câu 3 tại sao B sai?&rdquo; hay &ldquo;Câu 5 bấm Casio kiểu gì?&rdquo;) — lưu riêng cho bài test này
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenChatKeys((prev) => ({ ...prev, [quizChatKey]: !prev[quizChatKey] }))
                          }
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                            isQuizChatOpen
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          }`}
                        >
                          <MessageCircle className="w-4 h-4" />
                          {isQuizChatOpen ? 'Thu gọn khung chat' : 'Mở Gia sư AI'}
                          {quizChatMessages.length > 0 && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                isQuizChatOpen ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {quizChatMessages.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {isQuizChatOpen && (
                        <SectionAiChat
                          contextKey={quizChatKey}
                          contextType="quiz"
                          subjectName={activeSubject?.title_de || ''}
                          lessonTitle={activeLesson?.title_de || ''}
                          sectionHeading={`Bài Test (${activeQuiz.length} câu hỏi)`}
                          extraContext={quizContextDigest}
                          messages={quizChatMessages}
                          onUpdateMessages={handleUpdateAiChat}
                          onWordClick={handleWordClick}
                          isCloudSynced={aiChatCloudReady}
                          onClose={() =>
                            setOpenChatKeys((prev) => ({ ...prev, [quizChatKey]: false }))
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ==================== VIEW 4: GLOBAL VOCABULARY DICTIONARY ==================== */}
          {view === 'vocab' && (
            <VocabView
              vocabularies={vocabularies}
              subjects={subjects}
              lessons={lessons}
              dictCache={dictCache}
              ttsRate={ttsRate}
              isAdmin={isAdmin}
              onDeleteVocab={handleDeleteVocab}
              onOpenLesson={(lid) => openLesson(lid, 'vocab')}
              onLookupDictionary={handleDirectDictionaryLookup}
              onWordClick={handleWordClick}
            />
          )}

          {/* ==================== VIEW 5: GLOBAL FLASHCARDS SRS ==================== */}
          {view === 'flashcards' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Ôn Flashcard tổng hợp (SRS kiểu Anki)</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Thẻ hay quên tự đẩy lên trước · Thẻ đã thuộc hẹn lặp lại sau 3 → 7 → 14 ngày
                  </p>
                </div>
                <select
                  value={globalCardSubjectFilter}
                  onChange={(e) => setGlobalCardSubjectFilter(e.target.value)}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
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
                dictMode={dictMode}
                onWordClick={handleWordClick}
                isAdmin={isAdmin}
                onDeleteCard={handleDeleteCard}
                subjectMap={subjectMap}
              />
            </div>
          )}

          {/* ==================== VIEW 6: MOCK EXAM CENTER (ALTKLAUSUREN) ==================== */}
          {view === 'exams' && (() => {
            const activeExamObj =
              examChatExamId === 'all' ? null : mockExams.find((ex) => ex.id === examChatExamId) || null;
            const examChatKey = activeExamObj ? `exam:${activeExamObj.id}` : 'exam:all';
            const examChatMessages = aiChatsMap[examChatKey] || [];
            const isExamChatOpen = Boolean(openChatKeys[examChatKey]);

            const scopedQuestions = activeExamObj
              ? mockExamQuestions.filter((q) => q.exam_id === activeExamObj.id)
              : mockExamQuestions.length > 0
              ? mockExamQuestions.slice(0, 14)
              : quizQuestions.slice(0, 12);

            const examContextDigest = scopedQuestions.length
              ? scopedQuestions
                  .map((q, idx) => {
                    const label = q.section_label || `Aufgabe ${idx + 1}`;
                    const opts =
                      Array.isArray(q.options) && q.options.length
                        ? q.options
                            .map(
                              (o, oi) =>
                                `${String.fromCharCode(65 + oi)}) ${o.de}${oi === q.correct_index ? ' [ĐÚNG]' : ''}`
                            )
                            .join(' | ')
                        : '';
                    return `${label} (${q.points || 10} Punkte · ${q.q_type}): ${q.question_de}${
                      opts ? `\nĐáp án: ${opts}` : ''
                    }${q.model_answer_de ? `\nBài mẫu: ${q.model_answer_de}` : ''}${
                      q.explanation_vn ? `\nGiải thích: ${q.explanation_vn}` : ''
                    }`;
                  })
                  .join('\n---\n')
              : 'Học viên đang luyện thi thử IHK Veranstaltungskaufmann.';

            return (
              <div className="space-y-5">
                <MockExamCenter
                  mockExams={mockExams}
                  mockExamQuestions={mockExamQuestions}
                  allQuizQuestions={quizQuestions}
                  subjects={subjects}
                  lessons={lessons}
                  isAdmin={isAdmin}
                  showVn={showVn}
                  ttsRate={ttsRate}
                  dictMode={dictMode}
                  onWordClick={handleWordClick}
                  onCreateExam={handleCreateExam}
                  onAppendExamQuestions={handleAppendExamQuestions}
                  onDeleteExam={handleDeleteExam}
                  onLogMistakes={handleLogMistakes}
                />

                {/* Gia sư AI riêng cho Phòng thi thử (Altklausuren) */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800/80 p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Gia sư AI giải đáp riêng cho Phòng thi thử (Altklausuren)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Chọn bộ đề muốn hỏi, AI đọc sẵn đề + đáp án mẫu để mổ xẻ bẫy IHK & cách bấm Casio fx-580VN X
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {mockExams.length > 0 && (
                        <select
                          value={activeExamObj ? activeExamObj.id : 'all'}
                          onChange={(e) => setExamChatExamId(e.target.value)}
                          className="px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl max-w-[220px]"
                        >
                          <option value="all">Tất cả đề thi thử ({mockExamQuestions.length || quizQuestions.length} câu)</option>
                          {mockExams.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.title}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setOpenChatKeys((prev) => ({ ...prev, [examChatKey]: !prev[examChatKey] }))
                        }
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                          isExamChatOpen
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" />
                        {isExamChatOpen ? 'Thu gọn khung chat' : 'Hỏi Gia sư AI'}
                        {examChatMessages.length > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                              isExamChatOpen ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {examChatMessages.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {isExamChatOpen && (
                    <SectionAiChat
                      contextKey={examChatKey}
                      contextType="exam"
                      sectionHeading={activeExamObj ? activeExamObj.title : 'Phòng thi thử tổng hợp (Altklausuren)'}
                      extraContext={examContextDigest}
                      messages={examChatMessages}
                      onUpdateMessages={handleUpdateAiChat}
                      onWordClick={handleWordClick}
                      isCloudSynced={aiChatCloudReady}
                      onClose={() =>
                        setOpenChatKeys((prev) => ({ ...prev, [examChatKey]: false }))
                      }
                    />
                  )}
                </div>
              </div>
            );
          })()}

          {/* ==================== VIEW 7: MISTAKE BANK & ANALYTICS ==================== */}
          {view === 'mistakes' && (() => {
            const mistakesChatKey = 'mistakes:global';
            const mistakesChatMessages = aiChatsMap[mistakesChatKey] || [];
            const isMistakesChatOpen = Boolean(openChatKeys[mistakesChatKey]);
            const unresolvedList = wrongQuestions.filter((m) => !m.resolved).slice(0, 12);
            const mistakesDigest = unresolvedList.length
              ? unresolvedList
                  .map((m, idx) => {
                    const q = m.question_snapshot || {};
                    return `Câu sai #${idx + 1}: ${q.question_de || ''}\nHọc viên chọn/trả lời: ${m.user_answer || '(Trống)'}${
                      m.feedback_vn ? `\nNhận xét cũ: ${m.feedback_vn}` : ''
                    }`;
                  })
                  .join('\n---\n')
              : 'Hiện học viên chưa có câu sai tồn đọng nào.';

            return (
              <div className="space-y-5">
                <MistakesAnalyticsView
                  wrongQuestions={wrongQuestions}
                  subjects={subjects}
                  lessons={lessons}
                  flashcards={flashcards}
                  progressMap={progressMap}
                  quizAttempts={quizAttempts}
                  showVn={showVn}
                  ttsRate={ttsRate}
                  dictMode={dictMode}
                  onWordClick={handleWordClick}
                  onToggleResolveMistake={handleToggleResolveMistake}
                  onOpenLesson={(lid) => openLesson(lid, 'study')}
                />

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800/80 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Gia sư AI phân tích Câu sai & Vá lỗ hổng IHK
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          AI đã đọc sẵn {unresolvedList.length} câu sai chưa khắc phục của bạn để giải thích lại tận gốc
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenChatKeys((prev) => ({ ...prev, [mistakesChatKey]: !prev[mistakesChatKey] }))
                      }
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                        isMistakesChatOpen
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {isMistakesChatOpen ? 'Thu gọn khung chat' : 'Hỏi Gia sư AI'}
                      {mistakesChatMessages.length > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            isMistakesChatOpen ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {mistakesChatMessages.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {isMistakesChatOpen && (
                    <SectionAiChat
                      contextKey={mistakesChatKey}
                      contextType="mistakes"
                      sectionHeading="Kho câu sai & Điểm yếu cần khắc phục"
                      extraContext={mistakesDigest}
                      messages={mistakesChatMessages}
                      onUpdateMessages={handleUpdateAiChat}
                      onWordClick={handleWordClick}
                      isCloudSynced={aiChatCloudReady}
                      onClose={() =>
                        setOpenChatKeys((prev) => ({ ...prev, [mistakesChatKey]: false }))
                      }
                    />
                  )}
                </div>
              </div>
            );
          })()}

          {/* ==================== VIEW 8: SETTINGS & BACKUP ==================== */}
          {view === 'settings' && (
            <SettingsView
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              fontScale={fontScale}
              setFontScale={setFontScale}
              dictMode={dictMode}
              setDictMode={setDictMode}
              showVn={showVn}
              setShowVn={setShowVn}
              ttsRate={ttsRate}
              setTtsRate={setTtsRate}
              user={user}
              isAdmin={isAdmin}
              onOpenAuth={() => setShowAuthModal(true)}
              onSignOut={handleSignOut}
              onExportJson={handleExportJson}
              onTriggerImportJson={() => importJsonRef.current?.click()}
            />
          )}
        </main>
      </div>

      {/* FLOATING HIGHLIGHT-TO-ASK PILL TRONG BÀI HỌC (tô đen chữ -> bấm "↳ Hỏi Gia sư AI") */}
      {lessonSelectionPopup && (
        <button
          type="button"
          onMouseDown={handleAskTutorFromLessonHighlight}
          onTouchStart={handleAskTutorFromLessonHighlight}
          style={{
            top: `${lessonSelectionPopup.top}px`,
            left: `${lessonSelectionPopup.left}px`,
            transform: 'translateX(-50%)',
          }}
          className="fixed z-[80] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900 dark:bg-slate-800 hover:bg-indigo-600 text-white text-xs font-bold shadow-2xl border border-slate-700/80 transition whitespace-nowrap"
        >
          <CornerDownRight className="w-3.5 h-3.5 text-indigo-300" />
          Hỏi Gia sư AI
        </button>
      )}

      {/* IPHONE EDGE-SWIPE BACK INDICATOR (Huy hiệu mũi tên trượt mượt từ cạnh trái) */}
      {edgeSwipeProgress > 0.05 && (
        <div
          style={{
            transform: `translate3d(${Math.round(edgeSwipeProgress * 44) - 44}px, -50%, 0) scale(${0.85 + edgeSwipeProgress * 0.2})`,
            opacity: Math.min(1, edgeSwipeProgress * 1.4),
          }}
          className="fixed left-3 top-1/2 z-[90] w-11 h-11 rounded-full bg-slate-900/85 dark:bg-indigo-600/90 text-white shadow-2xl backdrop-blur flex items-center justify-center pointer-events-none border border-white/15"
        >
          <ArrowLeft className="w-5 h-5" />
        </div>
      )}

      {/* NÚT NỔI LÊN ĐẦU TRANG MƯỢT MÀ */}
      {showScrollTop && boardLightboxIndex === null && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Cuộn lên đầu trang"
          className="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full bg-white/95 dark:bg-slate-800/95 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* GLOBAL MODALS & DICTIONARY POPOVER */}
      <div className="word-popover-wrap">
        <WordPopover
          lookupState={wordLookup}
          ttsRate={ttsRate}
          isAdmin={isAdmin}
          canSaveToLesson={view === 'lesson' && Boolean(activeLesson)}
          onClose={() => setWordLookup(null)}
          onSaveToVocab={handleSavePopoverWordToLessonVocab}
        />
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => closeOverlay('auth', () => setShowAuthModal(false))}
          onSuccess={() => showToast('Đăng nhập thành công!')}
        />
      )}

      {showImportModal && (
        <ImportModal
          subjects={subjects}
          existingLessons={existingLessonsForImport}
          defaultSubjectId={importDefaultSubjectId}
          onCreateSubject={handleCreateSubject}
          onOpenExistingLesson={(lessonId) => openLesson(lessonId)}
          onClose={() =>
            closeOverlay('import', () => {
              setShowImportModal(false);
              setImportDefaultSubjectId('');
            })
          }
          onSaveImportedData={handleSaveImportedData}
          onBatchComplete={handleBatchImportComplete}
        />
      )}

      {showUpgradeLessonModal && activeLesson && (
        <LessonUpgradeModal
          lesson={activeLesson}
          subject={activeSubject}
          subjects={subjects}
          sections={activeSections}
          sourceImages={activeSourceImages}
          vocabCount={activeVocabs.length}
          cardCount={activeCards.length}
          quizCount={activeQuiz.length}
          onClose={() => closeOverlay('upgrade', () => setShowUpgradeLessonModal(false))}
          onApplyUpgrade={handleApplyLessonUpgrade}
        />
      )}

      {showSearchModal && (
        <SearchModal
          subjects={subjects}
          lessons={lessons}
          sections={sections}
          vocabularies={vocabularies}
          flashcards={flashcards}
          onClose={() => closeOverlay('search', () => setShowSearchModal(false))}
          onOpenLesson={openLesson}
          onGoToVocab={() => navigate('vocab')}
        />
      )}

      {/* ==================== FULLSCREEN ZOOMABLE LIGHTBOX CHO ẢNH BẢN GỐC (VUỐT CHẠM + CHỤM PHÓNG TO + NHẤN KHOẢNG TRỐNG ĐÓNG) ==================== */}
      {boardLightboxIndex !== null && activeSourceImages[boardLightboxIndex] && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/92 backdrop-blur-md flex flex-col"
          onClick={closeBoardLightbox}
        >
          {/* Top Controls Bar */}
          <div
            className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-white shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-xs font-extrabold shrink-0">
                {boardLightboxIndex + 1} / {activeSourceImages.length}
              </span>
              <span className="text-xs font-bold text-slate-200 truncate max-w-[200px] sm:max-w-md">
                {activeSourceImages[boardLightboxIndex].label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setBoardLightboxZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))))}
                disabled={boardLightboxZoom <= 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                title="Thu nhỏ (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setBoardLightboxZoom((z) => (z === 1 ? 1.85 : 1))}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold min-w-[64px]"
                title="Chuyển nhanh Vừa màn / Phóng to 185% (phím 0 để đặt lại)"
              >
                {boardLightboxZoom === 1 ? 'Vừa khung' : `${Math.round(boardLightboxZoom * 100)}%`}
              </button>
              <button
                type="button"
                onClick={() => setBoardLightboxZoom((z) => Math.min(3.5, Number((z + 0.4).toFixed(2))))}
                disabled={boardLightboxZoom >= 3.5}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                title="Phóng to (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setBoardLightboxRotate((r) => (r + 90) % 360)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
                title="Xoay ảnh 90° (phím R)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeBoardLightbox}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-white ml-1"
                title="Đóng (Esc hoặc nhấn khoảng trống)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Zoomable & Gesture-Ready Stage */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {boardLightboxIndex > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBoardLightboxZoom(1);
                  setBoardLightboxRotate(0);
                  setBoardLightboxIndex((idx) => Math.max(0, idx - 1));
                }}
                className="absolute left-3 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700 shadow-lg transition"
                title="Trang trước (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {boardLightboxIndex < activeSourceImages.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBoardLightboxZoom(1);
                  setBoardLightboxRotate(0);
                  setBoardLightboxIndex((idx) => Math.min(activeSourceImages.length - 1, idx + 1));
                }}
                className="absolute right-3 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700 shadow-lg transition"
                title="Trang sau (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            <div
              ref={boardStageRef}
              onClick={(e) => {
                if (boardPanRef.current.moved) {
                  boardPanRef.current.moved = false;
                  e.stopPropagation();
                  return;
                }
                // Nhấn bất kỳ khoảng trống tối nào xung quanh ảnh -> đóng ngay lập tức!
                if (e.target === e.currentTarget) {
                  e.stopPropagation();
                  closeBoardLightbox();
                }
              }}
              onMouseDown={(e) => {
                if (boardLightboxZoom <= 1.02 || e.button !== 0) return;
                const box = boardStageRef.current;
                if (!box) return;
                boardPanRef.current = {
                  active: true,
                  moved: false,
                  startX: e.clientX,
                  startY: e.clientY,
                  scrollLeft: box.scrollLeft,
                  scrollTop: box.scrollTop,
                };
                setBoardIsPanning(true);
              }}
              onMouseMove={(e) => {
                if (!boardPanRef.current.active) return;
                const box = boardStageRef.current;
                if (!box) return;
                const dx = e.clientX - boardPanRef.current.startX;
                const dy = e.clientY - boardPanRef.current.startY;
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                  boardPanRef.current.moved = true;
                }
                box.scrollLeft = boardPanRef.current.scrollLeft - dx;
                box.scrollTop = boardPanRef.current.scrollTop - dy;
              }}
              onMouseUp={() => {
                if (boardPanRef.current.active) {
                  boardPanRef.current.active = false;
                  setBoardIsPanning(false);
                }
              }}
              onMouseLeave={() => {
                if (boardPanRef.current.active) {
                  boardPanRef.current.active = false;
                  setBoardIsPanning(false);
                }
              }}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                  );
                  boardTouchRef.current = { mode: 'pinch', startDist: d, startZoom: boardLightboxZoom, moved: true };
                } else if (e.touches.length === 1 && boardLightboxZoom <= 1.02) {
                  boardTouchRef.current = {
                    mode: 'swipe',
                    startX: e.touches[0].clientX,
                    startY: e.touches[0].clientY,
                    moved: false,
                  };
                } else {
                  boardTouchRef.current = { mode: null, moved: false };
                }
              }}
              onTouchMove={(e) => {
                const t = boardTouchRef.current;
                if (t.mode === 'pinch' && e.touches.length === 2 && t.startDist > 10) {
                  const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                  );
                  const nextZ = Math.min(3.5, Math.max(1, Number((t.startZoom * (d / t.startDist)).toFixed(2))));
                  setBoardLightboxZoom(nextZ);
                } else if (t.mode === 'swipe' && e.touches.length === 1 && boardLightboxZoom <= 1.02) {
                  const dx = e.touches[0].clientX - t.startX;
                  const dy = e.touches[0].clientY - t.startY;
                  if (dy > 16 && dy > Math.abs(dx) * 1.3) {
                    t.moved = true;
                    setBoardDragOffsetY(Math.min(180, dy));
                  } else if (Math.abs(dx) > 16) {
                    t.moved = true;
                  }
                }
              }}
              onTouchEnd={(e) => {
                const t = boardTouchRef.current;
                if (t.mode === 'swipe' && boardLightboxZoom <= 1.02) {
                  const touch = e.changedTouches?.[0];
                  if (touch) {
                    const dx = touch.clientX - t.startX;
                    const dy = touch.clientY - t.startY;
                    // Vuốt xuống -> đóng ảnh kiểu iOS Photos
                    if (dy > 85 && dy > Math.abs(dx) * 1.35) {
                      setBoardDragOffsetY(0);
                      closeBoardLightbox();
                      boardTouchRef.current = { mode: null, moved: false };
                      return;
                    }
                    // Vuốt trái/phải -> đổi trang ảnh
                    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                      if (dx < 0 && boardLightboxIndex < activeSourceImages.length - 1) {
                        setBoardLightboxZoom(1);
                        setBoardLightboxRotate(0);
                        setBoardLightboxIndex((idx) => Math.min(activeSourceImages.length - 1, idx + 1));
                      } else if (dx > 0 && boardLightboxIndex > 0) {
                        setBoardLightboxZoom(1);
                        setBoardLightboxRotate(0);
                        setBoardLightboxIndex((idx) => Math.max(0, idx - 1));
                      }
                    }
                  }
                }
                setBoardDragOffsetY(0);
                boardTouchRef.current = { mode: null, moved: false };
              }}
              className={`w-full h-full overflow-auto p-4 sm:p-8 flex items-start justify-center ${
                boardLightboxZoom > 1.02
                  ? boardIsPanning
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-pointer'
              }`}
            >
              <div
                className="relative my-auto flex flex-col items-center pointer-events-none"
                style={{
                  transform: boardDragOffsetY ? `translateY(${boardDragOffsetY}px)` : undefined,
                  opacity: boardDragOffsetY ? Math.max(0.35, 1 - boardDragOffsetY / 260) : 1,
                  transition: boardDragOffsetY ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                }}
              >
                <img
                  src={activeSourceImages[boardLightboxIndex].url}
                  alt={activeSourceImages[boardLightboxIndex].label}
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (boardPanRef.current.moved) {
                      boardPanRef.current.moved = false;
                      return;
                    }
                    setBoardLightboxZoom((z) => (z === 1 ? 1.85 : 1));
                  }}
                  style={{
                    width: boardLightboxZoom === 1 ? 'auto' : `${Math.round(boardLightboxZoom * 100)}%`,
                    maxWidth: boardLightboxZoom === 1 ? '100%' : 'none',
                    maxHeight: boardLightboxZoom === 1 ? '75vh' : 'none',
                    transform: boardLightboxRotate ? `rotate(${boardLightboxRotate}deg)` : undefined,
                  }}
                  className={`pointer-events-auto rounded-xl bg-white shadow-2xl transition-[max-height] duration-150 select-none ${
                    boardLightboxZoom > 1.02
                      ? boardIsPanning
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                      : 'cursor-zoom-in object-contain'
                  }`}
                />
                <span className="mt-2.5 text-[10px] font-semibold text-slate-400/90 hidden sm:inline">
                  Nhấn khoảng trống tối để đóng · Chụm 2 ngón phóng to · Kéo ảnh khi phóng to · Vuốt 2 ngón lật trang
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Page Thumbnails Strip */}
          {activeSourceImages.length > 1 && (
            <div
              className="px-4 py-2.5 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2 overflow-x-auto justify-start sm:justify-center shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {activeSourceImages.map((imgItem, idx) => {
                const active = idx === boardLightboxIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setBoardLightboxZoom(1);
                      setBoardLightboxRotate(0);
                      setBoardLightboxIndex(idx);
                    }}
                    className={`relative w-12 h-14 rounded-lg overflow-hidden border-2 shrink-0 bg-white transition ${
                      active
                        ? 'border-indigo-500 ring-2 ring-indigo-400/60 scale-105'
                        : 'border-slate-700 opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img src={imgItem.url} alt={imgItem.label} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-slate-900/85 text-white text-[9px] font-bold text-center">
                      {idx + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Filter,
  RotateCcw,
  Layers,
  Check,
  CheckCheck,
  Folder,
  Plus,
  Lock,
  Eye,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCw,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFileKey(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/\.(png|jpe?g|webp|heic)$/i, '')
    .replace(/\s*\(tr\.?[^)]*\)\s*$/i, '')
    .replace(/[\s_\-]+/g, ' ')
    .trim();
}

// Chống lỗi 429 Rate Limit / timeout khi nạp liên tục nhiều trang PDF trên gói Groq miễn phí
async function callApiWithRetry(action, payload, { maxRetries = 2, onWait = null } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await callGeminiApi(action, payload);
    } catch (err) {
      const msg = String(err?.message || '');
      const isRetryable =
        /429|rate.?limit|quota|too many|503|overloaded|timeout|network|fetch/i.test(msg);
      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
      const waitSec = attempt === 1 ? 6 : 12;
      if (onWait) {
        onWait(`AI đang chạm nhịp giới hạn tốc độ, tự động thử lại lần ${attempt}/${maxRetries} sau ${waitSec} giây...`);
      }
      await sleep(waitSec * 1000);
    }
  }
}

const SAMPLE_GEMA = `GEMA & Urheberrecht bei VA (Stichpunkte Lehrer)

1. UrhG: schützt geistige Schöpfungen (Musik, Texte, Fotos). Entsteht autom. mit Schöpfung -> keine Anmeldung nötig! Schutzfrist: 70 J. nach Tod d. Urhebers (§ 64 UrhG), danach gemeinfrei.

2. GEMA = Verwertungsgesellschaft -> nimmt Nutzungsrechte von Komponisten & Textdichtern wahr.

3. Pflichten Veranstalter:
- Jede öffentl. Wiedergabe geschützter Musik (Live, DJ, Hintergrundmusik) VOR VA anmelden!
- Tarife abhängig von: Raumgröße (m²), Eintritt (Brutto), Art (Live vs. Tonträger).
- Nach Live-VA: Musikfolge (Setlist) einreichen.

4. Nichtanmeldung -> doppelter Tarif (100% Kontrollzuschlag als Schadensersatz).`;

// Nạp động thư viện PDF.js trực tiếp trên trình duyệt
let pdfJsPromise = null;
function loadPdfJs() {
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfJsPromise) return pdfJsPromise;

  const sources = [
    {
      script: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    },
    {
      script: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    },
  ];

  pdfJsPromise = new Promise((resolve, reject) => {
    const trySource = (idx) => {
      if (idx >= sources.length) {
        pdfJsPromise = null;
        reject(new Error('Không tải được trình đọc PDF. Vui lòng kiểm tra kết nối mạng.'));
        return;
      }
      const { script, worker } = sources[idx];
      const el = document.createElement('script');
      el.src = script;
      el.async = true;
      el.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
          resolve(window.pdfjsLib);
        } else {
          trySource(idx + 1);
        }
      };
      el.onerror = () => trySource(idx + 1);
      document.head.appendChild(el);
    };
    trySource(0);
  });

  return pdfJsPromise;
}

// Nén ảnh chụp bảng / chữ viết tay trước khi gửi lên Vercel Serverless
async function compressImageFile(file, maxWidth = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
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
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg', dataUrl, name: file.name });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Quét nhanh 1 trang PDF: lấy chữ gõ máy, phát hiện ảnh nhúng, đo mực thật & tạo thumbnail
async function inspectPdfPageVisual(pdfDoc, pageNum, pdfjsLib) {
  const page = await pdfDoc.getPage(pageNum);

  const textContent = await page.getTextContent();
  const text = (textContent.items || [])
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let hasEmbeddedImage = false;
  try {
    const ops = await page.getOperatorList();
    const imgOps = new Set([
      pdfjsLib?.OPS?.paintImageXObject,
      pdfjsLib?.OPS?.paintInlineImageXObject,
      pdfjsLib?.OPS?.paintImageMaskXObject,
    ]);
    hasEmbeddedImage = (ops.fnArray || []).some((fn) => imgOps.has(fn));
  } catch {
    hasEmbeddedImage = false;
  }

  let inkRatio = 0;
  let thumbUrl = '';
  try {
    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(1, 220 / Math.max(1, baseVp.width));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkCount = 0;
    const totalPixels = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (r < 242 || g < 242 || b < 242) {
        darkCount++;
      }
    }
    inkRatio = (darkCount * 4) / Math.max(1, totalPixels);
    thumbUrl = canvas.toDataURL('image/jpeg', 0.62);
  } catch {
    inkRatio = text.length > 0 ? 0.05 : 0;
  }

  const isBlank = text.length < 15 && inkRatio < 0.006;
  const needsOcr = !isBlank && (hasEmbeddedImage || text.length < 350);

  return {
    pageNum,
    text,
    charCount: text.length,
    hasEmbeddedImage,
    inkRatio,
    isBlank,
    needsOcr,
    ocrDone: false,
    ocrFailed: false,
    thumbUrl,
  };
}

// Render 1 trang PDF sang JPEG sắc nét để Vision AI đọc từng chữ nhỏ (Situation 1-4, Fall A/B)
async function renderPdfPageToJpeg(pdfDoc, pageNum, maxWidth = 1400, quality = 0.8) {
  const page = await pdfDoc.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, maxWidth / Math.max(1, baseViewport.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    base64: dataUrl.split(',')[1],
    mimeType: 'image/jpeg',
    dataUrl,
  };
}

export default function ImportModal({
  subjects = [],
  existingLessons = [],
  defaultSubjectId = '',
  onCreateSubject,
  onOpenExistingLesson = null,
  onClose,
  onSaveImportedData,
  onBatchComplete,
}) {
  // 'pdf' | 'text' | 'images'
  const [mode, setMode] = useState('pdf');
  // Khóa môn học đích: '' = AI tự xếp vào môn có sẵn, còn lại là ID môn học cụ thể
  const [selectedSubjectId, setSelectedSubjectId] = useState(defaultSubjectId || '');
  const [showNewSubjectForm, setShowNewSubjectForm] = useState(false);
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubDe, setNewSubDe] = useState('');
  const [newSubVn, setNewSubVn] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);

  // Text & Photos state + Nhãn tên file / mã trang OneNote để dễ đối chiếu
  const [rawText, setRawText] = useState('');
  const [manualSourceTag, setManualSourceTag] = useState('');
  const [images, setImages] = useState([]);
  const [showImportedFilesList, setShowImportedFilesList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // PDF Auto-Filter + Per-Page Vision OCR state
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPages, setPdfPages] = useState([]);
  const [pdfSummary, setPdfSummary] = useState('');
  const [pdfGroups, setPdfGroups] = useState([]);
  const [pdfSkipped, setPdfSkipped] = useState([]);
  const [pdfStage, setPdfStage] = useState('upload'); // 'upload' | 'scanning' | 'review' | 'importing'
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: '', doneCount: 0, failList: [] });

  const pdfDocRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imgInputRef = useRef(null);
  const highResPdfCacheRef = useRef({});

  // Fullscreen Preview & Zoom State (dùng chung cho cả xem trước PDF từng trang lẫn ảnh tải lên)
  // previewModal: null | { kind: 'pdf', pageNum: number, tab: 'image' | 'text' } | { kind: 'image', index: number }
  const [previewModal, setPreviewModal] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1); // 1 = vừa khung (fit), >1 = phóng to (1.5, 2, 2.5, 3)
  const [previewRotate, setPreviewRotate] = useState(0);
  const [previewHighResUrl, setPreviewHighResUrl] = useState('');
  const [previewLoadingImg, setPreviewLoadingImg] = useState(false);
  const [previewDragOffsetY, setPreviewDragOffsetY] = useState(0);
  const [previewIsPanning, setPreviewIsPanning] = useState(false);

  const previewStageRef = useRef(null);
  const previewWheelFlipRef = useRef(0);
  const previewPanRef = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const previewTouchRef = useRef({ mode: null, startX: 0, startY: 0, startDist: 0, startZoom: 1, moved: false });

  // Tự động render trang PDF độ nét cao khi mở preview trang PDF
  useEffect(() => {
    let cancelled = false;
    if (!previewModal || previewModal.kind !== 'pdf') {
      setPreviewHighResUrl('');
      setPreviewLoadingImg(false);
      return undefined;
    }

    const pageNum = previewModal.pageNum;
    const cached = highResPdfCacheRef.current[pageNum];
    if (cached) {
      setPreviewHighResUrl(cached);
      setPreviewLoadingImg(false);
      return undefined;
    }

    const fallbackThumb = pdfPages.find((p) => p.pageNum === pageNum)?.thumbUrl || '';
    setPreviewHighResUrl(fallbackThumb);

    if (!pdfDocRef.current) {
      setPreviewLoadingImg(false);
      return undefined;
    }

    setPreviewLoadingImg(true);
    renderPdfPageToJpeg(pdfDocRef.current, pageNum, 1600, 0.85)
      .then((rendered) => {
        if (cancelled) return;
        highResPdfCacheRef.current[pageNum] = rendered.dataUrl;
        setPreviewHighResUrl(rendered.dataUrl);
      })
      .catch(() => {
        // giữ ảnh thumbnail dự phòng
      })
      .finally(() => {
        if (!cancelled) setPreviewLoadingImg(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewModal, pdfPages]);

  // Phím tắt thông minh: Esc đóng Xem ảnh trước -> đóng ImportModal; mũi tên, +/-, 0, R trong xem ảnh
  useEffect(() => {
    const onKeyDown = (e) => {
      if (previewModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPreviewModal(null);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (previewModal.kind === 'pdf' && previewModal.pageNum > 1) {
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) => (prev ? { ...prev, pageNum: prev.pageNum - 1 } : null));
          } else if (previewModal.kind === 'image' && previewModal.index > 0) {
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) => (prev ? { ...prev, index: prev.index - 1 } : null));
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (previewModal.kind === 'pdf' && previewModal.pageNum < pdfPages.length) {
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) => (prev ? { ...prev, pageNum: prev.pageNum + 1 } : null));
          } else if (previewModal.kind === 'image' && previewModal.index < images.length - 1) {
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) => (prev ? { ...prev, index: prev.index + 1 } : null));
          }
        } else if (e.key === '+' || e.key === '=') {
          setPreviewZoom((z) => Math.min(3.5, Number((z + 0.4).toFixed(2))));
        } else if (e.key === '-') {
          setPreviewZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))));
        } else if (e.key === '0') {
          setPreviewZoom(1);
          setPreviewRotate(0);
        } else if (e.key === 'r' || e.key === 'R') {
          setPreviewRotate((r) => (r + 90) % 360);
        }
        return;
      }

      if (e.key === 'Escape' && !loading && pdfStage !== 'importing') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewModal, pdfPages.length, images.length, loading, pdfStage, onClose]);

  // MacBook Trackpad Pinch-to-Zoom (ctrl+wheel) & Vuốt ngang 2 ngón đổi trang ảnh trong Preview Lightbox
  useEffect(() => {
    const el = previewStageRef.current;
    if (!el || !previewModal) return undefined;
    if (previewModal.kind === 'pdf' && previewModal.tab === 'text') return undefined;

    const onWheel = (e) => {
      // 1. Chụm / banh 2 ngón trên Trackpad MacBook để phóng to / thu nhỏ ảnh
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.012;
        setPreviewZoom((z) => Math.min(3.5, Math.max(1, Number((z + delta).toFixed(2)))));
        return;
      }

      // 2. Khi ảnh đang vừa khung (zoom = 1): vuốt ngang 2 ngón đổi trang trước/sau mượt mà
      if (previewZoom <= 1.02 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.4 && Math.abs(e.deltaX) > 26) {
        const isPdf = previewModal.kind === 'pdf';
        const total = isPdf ? pdfPages.length : images.length;
        const pos = isPdf ? previewModal.pageNum : previewModal.index + 1;
        const goingNext = e.deltaX > 0;
        const goingPrev = e.deltaX < 0;
        const now = Date.now();

        if (goingNext && pos < total) {
          e.preventDefault();
          if (now - previewWheelFlipRef.current > 360) {
            previewWheelFlipRef.current = now;
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) =>
              prev
                ? prev.kind === 'pdf'
                  ? { ...prev, pageNum: prev.pageNum + 1 }
                  : { ...prev, index: prev.index + 1 }
                : null
            );
          }
        } else if (goingPrev && pos > 1) {
          e.preventDefault();
          if (now - previewWheelFlipRef.current > 360) {
            previewWheelFlipRef.current = now;
            setPreviewZoom(1);
            setPreviewRotate(0);
            setPreviewModal((prev) =>
              prev
                ? prev.kind === 'pdf'
                  ? { ...prev, pageNum: prev.pageNum - 1 }
                  : { ...prev, index: prev.index - 1 }
                : null
            );
          }
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [previewModal, previewZoom, pdfPages.length, images.length]);

  const openPdfPagePreview = (pageNum, tab = 'image') => {
    setPreviewZoom(1);
    setPreviewRotate(0);
    setPreviewModal({ kind: 'pdf', pageNum, tab });
  };

  const openUploadedImagePreview = (index) => {
    setPreviewZoom(1);
    setPreviewRotate(0);
    setPreviewModal({ kind: 'image', index });
  };

  const selectedSubjectObj = subjects.find((s) => s.id === selectedSubjectId) || null;

  // Đối chiếu tên file đang chọn / gõ với danh sách bài đã nạp để cảnh báo trùng
  const activeCandidateName = mode === 'pdf' ? pdfFileName : manualSourceTag;
  const duplicateMatches = (() => {
    const key = normalizeFileKey(activeCandidateName);
    if (!key || key.length < 3) return [];
    return (existingLessons || []).filter((les) => {
      const files = Array.isArray(les.sourceFiles) ? les.sourceFiles : [];
      return files.some((f) => {
        const fk = normalizeFileKey(f);
        return fk && (fk === key || fk.includes(key) || key.includes(fk));
      });
    });
  })();

  // Danh sách các file đã gắn nhãn (lọc theo môn đang chọn nếu đã khóa môn)
  const importedFilesOverview = (() => {
    const scoped = selectedSubjectId
      ? (existingLessons || []).filter((l) => l.subject_id === selectedSubjectId)
      : existingLessons || [];
    const items = [];
    scoped.forEach((les) => {
      const files = Array.isArray(les.sourceFiles) ? les.sourceFiles : [];
      if (files.length > 0) {
        files.forEach((f) => items.push({ fileName: f, lessonId: les.id, lessonTitle: les.title_de }));
      }
    });
    return items.sort((a, b) => a.fileName.localeCompare(b.fileName, 'de', { numeric: true }));
  })();

  const handleQuickCreateSubject = async () => {
    const cleanDe = newSubDe.trim();
    const cleanCode = newSubCode.trim().toUpperCase();
    if (!cleanDe && !cleanCode) {
      setError('Vui lòng nhập ít nhất Mã môn (VD: VKO, PuG, RW) hoặc Tên môn tiếng Đức.');
      return;
    }
    if (!onCreateSubject) return;
    setError('');
    setCreatingSubject(true);
    try {
      const fullDe = cleanCode && cleanDe ? `${cleanCode} · ${cleanDe}` : cleanDe || cleanCode;
      const created = await onCreateSubject({
        title_de: fullDe,
        title_vn: newSubVn.trim(),
      });
      if (created?.id) {
        setSelectedSubjectId(created.id);
      }
      setNewSubCode('');
      setNewSubDe('');
      setNewSubVn('');
      setShowNewSubjectForm(false);
    } catch (err) {
      setError(err.message || 'Không tạo được môn học mới.');
    } finally {
      setCreatingSubject(false);
    }
  };

  // ==================== HANDLER 1: ĐỌC PDF + OCR TỪNG TRANG ẢNH + PHÂN LOẠI 70B ====================
  const handleSelectPdf = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Vui lòng chọn đúng định dạng file .PDF xuất từ OneNote.');
      return;
    }

    setError('');
    highResPdfCacheRef.current = {};
    setPreviewModal(null);
    setPdfFileName(file.name);
    setPdfStage('scanning');
    setScanProgress({ done: 0, total: 0 });
    setStatusMsg('Đang mở file PDF và kiểm tra từng trang...');

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfDocRef.current = pdfDoc;

      const totalPages = Math.min(pdfDoc.numPages, 40);
      if (totalPages === 0) {
        throw new Error('File PDF trống, không có trang nào.');
      }

      // Bước 1: Kiểm tra nhanh toàn bộ trang & tạo ảnh thumbnail
      const extractedPages = [];
      for (let p = 1; p <= totalPages; p++) {
        setStatusMsg(`Đang soi cấu trúc trang ${p}/${totalPages}...`);
        const info = await inspectPdfPageVisual(pdfDoc, p, pdfjsLib);
        extractedPages.push(info);
      }

      // Bước 2: Chạy OCR Vision RIÊNG TỪNG TRANG cho mọi trang có hình ảnh / phiếu bài tập (không bao giờ bỏ sót trang 2, 3, 4!)
      const ocrTargets = extractedPages.filter((p) => p.needsOcr);
      setScanProgress({ done: 0, total: ocrTargets.length });

      let ocrCompleted = 0;
      const CONCURRENCY = 2; // Chạy song song 2 trang một lúc cho nhanh mà vẫn nhẹ server
      for (let i = 0; i < ocrTargets.length; i += CONCURRENCY) {
        const chunk = ocrTargets.slice(i, i + CONCURRENCY);
        const pageLabels = chunk.map((c) => `trang ${c.pageNum}`).join(' & ');
        setStatusMsg(
          `AI Vision đang đọc chi tiết từng chữ & tình huống trên ${pageLabels} (${ocrCompleted}/${ocrTargets.length})...`
        );

        await Promise.all(
          chunk.map(async (pg) => {
            try {
              const rendered = await renderPdfPageToJpeg(pdfDoc, pg.pageNum, 1550, 0.82);
              const ocrRes = await callApiWithRetry(
                'ocr_pdf_page',
                {
                  pageNum: pg.pageNum,
                  image: { base64: rendered.base64, mimeType: rendered.mimeType },
                  existingText: pg.text,
                },
                { onWait: (m) => setStatusMsg(`Trang ${pg.pageNum}: ${m}`) }
              );
              const ocrText = (ocrRes?.text || '').trim();
              if (ocrRes?.isEmpty && pg.charCount < 15) {
                pg.isBlank = true;
                pg.text = '';
                pg.charCount = 0;
              } else if (ocrText && pg.text.length < 80) {
                pg.text = ocrText;
                pg.charCount = ocrText.length;
              } else if (ocrText.length >= pg.text.length * 0.9) {
                pg.text = ocrText;
                pg.charCount = ocrText.length;
              } else if (ocrText) {
                pg.text = `${pg.text}\n\n[Nội dung đọc thêm từ hình ảnh / sơ đồ / chữ viết tay]:\n${ocrText}`;
                pg.charCount = pg.text.length;
              }
              pg.ocrDone = true;
            } catch {
              pg.ocrFailed = true;
            } finally {
              ocrCompleted += 1;
              setScanProgress({ done: ocrCompleted, total: ocrTargets.length });
            }
          })
        );
      }

      setPdfPages([...extractedPages]);

      // Bước 3: Gửi TOÀN BỘ văn bản đã đọc sạch của mọi trang cho model 70B lọc rác & chia bài thông minh
      setStatusMsg(`AI đang tổng hợp & chia bài cho toàn bộ ${totalPages} trang...`);
      const filterRes = await callApiWithRetry(
        'filter_pdf_pages',
        {
          fileName: file.name,
          targetSubjectName: selectedSubjectObj?.title_de || '',
          pages: extractedPages.map((p) => ({
            pageNum: p.pageNum,
            charCount: p.charCount,
            isBlank: p.isBlank,
            textPreview: p.text.slice(0, 1500),
          })),
          existingSubjects: subjects,
        },
        { onWait: (m) => setStatusMsg(m) }
      );

      const rawGroups = Array.isArray(filterRes?.groups) ? filterRes.groups : [];
      const rawSkipped = Array.isArray(filterRes?.skipped_pages) ? filterRes.skipped_pages : [];

      const covered = new Set();
      const normalizedGroups = rawGroups
        .map((g, idx) => {
          const validNums = (Array.isArray(g.pageNums) ? g.pageNums : [])
            .map((n) => Number(n))
            .filter((n) => n >= 1 && n <= totalPages);
          validNums.forEach((n) => covered.add(n));
          return {
            id: g.id || `g-${idx + 1}`,
            title_de: g.title_de || `Thema ${idx + 1}`,
            title_vn: g.title_vn || '',
            subject_hint: g.subject_hint || '',
            pageNums: validNums,
            reason_vn: g.reason_vn || 'Nội dung lý thuyết & tình huống trọng tâm thi IHK',
            selected: true,
          };
        })
        .filter((g) => g.pageNums.length > 0);

      const normalizedSkipped = rawSkipped
        .map((s) => ({
          pageNum: Number(s.pageNum),
          title_hint: s.title_hint || `Trang ${s.pageNum}`,
          reason_vn: s.reason_vn || 'Trang trống hoặc ghi chú nháp không cần nạp',
        }))
        .filter((s) => s.pageNum >= 1 && s.pageNum <= totalPages && !covered.has(s.pageNum));

      normalizedSkipped.forEach((s) => covered.add(s.pageNum));

      const orphanContentNums = [];
      for (let p = 1; p <= totalPages; p++) {
        if (!covered.has(p)) {
          const pg = extractedPages[p - 1];
          if (pg.isBlank && pg.charCount < 15) {
            normalizedSkipped.push({
              pageNum: p,
              title_hint: `Trang ${p}`,
              reason_vn: 'Trang trắng hoàn toàn',
            });
          } else {
            orphanContentNums.push(p);
          }
        }
      }

      if (orphanContentNums.length > 0) {
        normalizedGroups.push({
          id: 'g-extra-auto',
          title_de: `${file.name.replace(/\.pdf$/i, '')} (Zusatzseiten)`,
          title_vn: 'Nội dung & tình huống bổ sung',
          subject_hint: normalizedGroups[0]?.subject_hint || '',
          pageNums: orphanContentNums,
          reason_vn: 'Trang có nội dung học tập được tự động giữ lại',
          selected: true,
        });
      }

      setPdfSummary(
        filterRes?.summary_vn ||
          `Đã đọc xong ${totalPages} trang: giữ lại ${normalizedGroups.length} bài lý thuyết & tình huống, loại bỏ ${normalizedSkipped.length} trang trống/nháp.`
      );
      setPdfGroups(normalizedGroups);
      setPdfSkipped(normalizedSkipped);
      setPdfStage('review');
      setStatusMsg('');
    } catch (err) {
      setError(err.message || 'Không phân tích được file PDF.');
      setPdfStage('upload');
      setStatusMsg('');
    }
  };

  const toggleGroupSelected = (groupId) => {
    setPdfGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, selected: !g.selected } : g)));
  };

  const restoreSkippedPage = (skippedItem) => {
    setPdfSkipped((prev) => prev.filter((s) => s.pageNum !== skippedItem.pageNum));
    setPdfGroups((prev) => [
      ...prev,
      {
        id: `restored-${skippedItem.pageNum}`,
        title_de: skippedItem.title_hint || `Seite ${skippedItem.pageNum}`,
        title_vn: `Khôi phục từ trang ${skippedItem.pageNum}`,
        subject_hint: prev[0]?.subject_hint || '',
        pageNums: [skippedItem.pageNum],
        reason_vn: 'Bạn đã chọn giữ lại để nạp vào web',
        selected: true,
      },
    ]);
  };

  const restoreAllNonBlankSkipped = () => {
    const nonBlank = pdfSkipped.filter((s) => {
      const pg = pdfPages.find((p) => p.pageNum === s.pageNum);
      return pg && !pg.isBlank;
    });
    if (!nonBlank.length) return;
    const nums = nonBlank.map((s) => s.pageNum);
    setPdfSkipped((prev) => prev.filter((s) => !nums.includes(s.pageNum)));
    setPdfGroups((prev) => [
      ...prev,
      {
        id: `restored-all-${Date.now()}`,
        title_de: `${pdfFileName.replace(/\.pdf$/i, '')} (Praxisfälle & Zusatzseiten)`,
        title_vn: 'Các trang tình huống & nội dung giữ lại',
        subject_hint: prev[0]?.subject_hint || '',
        pageNums: nums.sort((a, b) => a - b),
        reason_vn: 'Đã giữ lại toàn bộ trang có nội dung',
        selected: true,
      },
    ]);
  };

  const resetPdf = () => {
    pdfDocRef.current = null;
    highResPdfCacheRef.current = {};
    setPreviewModal(null);
    setPdfFileName('');
    setPdfPages([]);
    setPdfSummary('');
    setPdfGroups([]);
    setPdfSkipped([]);
    setPdfStage('upload');
    setError('');
    setStatusMsg('');
  };

  // ==================== PHASE 2 HELPER: TẠO ĐẦY ĐỦ TỪ VỰNG (8-12), FLASHCARDS (6-8) & BÀI TEST (6-8) ====================
  const enrichLessonsWithStudyPack = async (aiResult, onStepLabel) => {
    if (!aiResult || !Array.isArray(aiResult.lessons)) return aiResult;
    for (let idx = 0; idx < aiResult.lessons.length; idx++) {
      const les = aiResult.lessons[idx];
      const needPack =
        !Array.isArray(les.vocabularies) ||
        les.vocabularies.length < 4 ||
        !Array.isArray(les.flashcards) ||
        les.flashcards.length < 4 ||
        !Array.isArray(les.quiz_questions) ||
        les.quiz_questions.length < 4;

      if (!needPack) continue;

      const sectionsText = (Array.isArray(les.sections) ? les.sections : [])
        .map((s) => `## ${s.heading_de || ''}\n${s.content_de || ''}\n${s.content_vn || ''}`)
        .join('\n\n')
        .trim();

      if (!sectionsText) continue;

      if (onStepLabel) {
        onStepLabel(`Bước 2/2: Đang tạo trọn bộ 8–12 Từ vựng, Flashcards & Bài Test cho "${les.title_de || 'bài học'}"...`);
      }

      try {
        // Nhịp nghỉ ngắn 2.2s giữa Bước 1 và Bước 2 để tránh chạm giới hạn tốc độ theo phút của Groq
        await sleep(2200);
        const pack = await callApiWithRetry(
          'generate_study_pack',
          {
            lessonTitle: les.title_de || '',
            sectionsText,
          },
          { onWait: (m) => onStepLabel && onStepLabel(m) }
        );
        if (Array.isArray(pack?.vocabularies) && pack.vocabularies.length > 0) {
          les.vocabularies = pack.vocabularies;
        }
        if (Array.isArray(pack?.flashcards) && pack.flashcards.length > 0) {
          les.flashcards = pack.flashcards;
        }
        if (Array.isArray(pack?.quiz_questions) && pack.quiz_questions.length > 0) {
          les.quiz_questions = pack.quiz_questions;
        }
      } catch {
        // Nếu Phase 2 lỗi mạng tạm thời, vẫn lưu trọn vẹn nội dung bài giảng Phase 1 để người dùng không mất bài
      }
    }
    return aiResult;
  };

  // ==================== HANDLER 2: NẠP HÀNG LOẠT 2 GIAI ĐOẠN (GIẢNG BÀI SÂU -> TẠO BỘ LUYỆN TẬP) ====================
  const handleRunPdfBatchImport = async () => {
    const chosen = pdfGroups.filter((g) => g.selected && g.pageNums.length > 0);
    if (chosen.length === 0) {
      setError('Hãy tích chọn ít nhất 1 bài học để nạp vào web.');
      return;
    }

    setError('');
    setPdfStage('importing');
    let workingSubjects = [...subjects];
    let firstCreatedLessonId = null;
    let totalLessonsCreated = 0;
    const failList = [];

    for (let i = 0; i < chosen.length; i++) {
      const group = chosen[i];
      setBatchProgress({
        current: i + 1,
        total: chosen.length,
        label: `${group.title_de} (Trang ${group.pageNums.join(', ')})`,
        doneCount: totalLessonsCreated,
        failList: [...failList],
      });

      try {
        const groupPages = group.pageNums
          .map((num) => pdfPages.find((p) => p.pageNum === num))
          .filter(Boolean);

        // Lưu ĐẦY ĐỦ ảnh sắc nét của TẤT CẢ các trang trong nhóm để sau này xem đối chiếu & phóng to từng trang
        const groupSourcePhotos = [];
        const fallbackImages = [];
        if (pdfDocRef.current) {
          const pagesToArchive = groupPages.slice(0, 10);
          const archiveWidth = pagesToArchive.length > 5 ? 1050 : 1220;
          const archiveQuality = pagesToArchive.length > 5 ? 0.68 : 0.74;
          for (const pg of pagesToArchive) {
            try {
              const refImg = await renderPdfPageToJpeg(pdfDocRef.current, pg.pageNum, archiveWidth, archiveQuality);
              groupSourcePhotos.push({
                url: refImg.dataUrl,
                label: `Trang ${pg.pageNum}`,
              });
            } catch {
              if (pg.thumbUrl) {
                groupSourcePhotos.push({ url: pg.thumbUrl, label: `Trang ${pg.pageNum}` });
              }
            }
          }
          const failedOcrPages = groupPages.filter((p) => p.ocrFailed || p.charCount < 20).slice(0, 2);
          for (const fp of failedOcrPages) {
            try {
              const rendered = await renderPdfPageToJpeg(pdfDocRef.current, fp.pageNum, 1280, 0.78);
              fallbackImages.push({ base64: rendered.base64, mimeType: rendered.mimeType });
            } catch {
              // ignore
            }
          }
        } else {
          groupPages.slice(0, 10).forEach((pg) => {
            if (pg.thumbUrl) {
              groupSourcePhotos.push({ url: pg.thumbUrl, label: `Trang ${pg.pageNum}` });
            }
          });
        }

        const combinedText = [
          `THEMA: ${group.title_de}${group.subject_hint ? ` | FACH: ${group.subject_hint}` : ''}`,
          `ANZAHL SEITEN IN DIESEM PAKET: ${groupPages.length} (Seiten: ${group.pageNums.join(', ')})`,
          'LEHRER-AUFTRAG: Der Schüler hat die PDF-Seiten NICHT selbst gelesen! Präsentiere ZUERST alle Theorie-Inhalte und den VOLLSTÄNDIGEN Originaltext jeder Situation/Aufgabe zweisprachig (DE + VN) mit Aufgabenanalyse, und löse ERST DANACH jede einzelne Aufgabe Schritt für Schritt inkl. Casio fx-580VN X!',
          ...groupPages.map(
            (p) =>
              `=== Seite ${p.pageNum} ===\n${
                p.text || '(Text konnte nicht extrahiert werden — siehe angehängtes Bild)'
              }`
          ),
        ].join('\n\n');

        // Nhịp nghỉ ngắn giữa các cụm bài khi nạp nhiều cụm liên tiếp từ PDF dày
        if (i > 0) {
          setBatchProgress({
            current: i + 1,
            total: chosen.length,
            label: `Nghỉ nhịp 2 giây chống quá tải trước khi nạp "${group.title_de}"...`,
            doneCount: totalLessonsCreated,
            failList: [...failList],
          });
          await sleep(2200);
        }

        // GIAI ĐOẠN 1: Dồn 100% sức mạnh AI 70B để đọc, dịch, phân tích đề & giảng bài chi tiết như giáo viên
        const aiResult = await callApiWithRetry(
          'import_onenote',
          {
            rawText: combinedText,
            images: fallbackImages,
            existingSubjects: workingSubjects,
            targetSubjectId: selectedSubjectId || null,
            targetSubjectName: selectedSubjectObj?.title_de || '',
            teachingOnly: true,
          },
          {
            onWait: (m) =>
              setBatchProgress({
                current: i + 1,
                total: chosen.length,
                label: `${group.title_de}: ${m}`,
                doneCount: totalLessonsCreated,
                failList: [...failList],
              }),
          }
        );

        if (selectedSubjectId && aiResult) {
          aiResult.existing_subject_id = selectedSubjectId;
        }

        // GIAI ĐOẠN 2: Tự động tạo đầy đủ 8-12 Từ vựng, 6-8 Flashcards & 6-8 câu Bài Test từ bài vừa giảng
        await enrichLessonsWithStudyPack(aiResult, (stepLabel) => {
          setBatchProgress({
            current: i + 1,
            total: chosen.length,
            label: stepLabel,
            doneCount: totalLessonsCreated,
            failList: [...failList],
          });
        });

        const cleanPdfBase = String(pdfFileName || '').trim();
        const pageRangeTag =
          chosen.length > 1 && group.pageNums?.length
            ? ` (Tr. ${group.pageNums.join(', ')})`
            : '';
        const batchSourceFiles = cleanPdfBase ? [`${cleanPdfBase}${pageRangeTag}`] : [];

        const saved = await onSaveImportedData(aiResult, groupSourcePhotos, {
          silent: true,
          forcedSubjectId: selectedSubjectId || null,
          sourceFiles: batchSourceFiles,
        });
        if (saved?.firstCreatedLessonId && !firstCreatedLessonId) {
          firstCreatedLessonId = saved.firstCreatedLessonId;
        }
        if (saved?.subjectObj && !workingSubjects.some((s) => s.id === saved.subjectObj.id)) {
          workingSubjects = [...workingSubjects, saved.subjectObj];
        }
        totalLessonsCreated += saved?.lessonsCount || aiResult?.lessons?.length || 1;
      } catch (err) {
        failList.push(`${group.title_de}: ${err.message || 'Lỗi nạp bài'}`);
      }
    }

    if (totalLessonsCreated > 0) {
      if (onBatchComplete) {
        await onBatchComplete(firstCreatedLessonId, totalLessonsCreated, failList);
      }
      onClose();
    } else {
      setError(`Không nạp được bài nào. Chi tiết: ${failList[0] || 'Lỗi kết nối AI'}`);
      setPdfStage('review');
    }
  };

  // ==================== HANDLER 3: NHẬP CHỮ ONENOTE / ẢNH BẢNG ====================
  const handlePickImages = async (files) => {
    const fileArr = Array.from(files || []).slice(0, 5 - images.length);
    if (!fileArr.length) return;
    setError('');
    try {
      const compressed = await Promise.all(fileArr.map((f) => compressImageFile(f)));
      setImages((prev) => [...prev, ...compressed].slice(0, 5));
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh.');
    }
  };

  const handleSubmitTextOrImages = async () => {
    if (mode === 'text' && !rawText.trim()) {
      setError('Vui lòng dán ghi chú từ OneNote vào khung trên.');
      return;
    }
    if (mode === 'images' && images.length === 0) {
      setError('Vui lòng chọn ít nhất 1 ảnh chụp bảng hoặc chữ viết tay.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      let finalRawText = rawText.trim();
      let payloadImages = [];

      // Nếu chụp nhiều ảnh bảng/phiếu bài tập -> OCR riêng từng ảnh trước rồi tổng hợp bằng model 70B cho khỏi sót chữ!
      if (mode === 'images' && images.length > 0) {
        const ocrTexts = [];
        for (let i = 0; i < images.length; i++) {
          setStatusMsg(`AI Vision đang đọc chữ & tình huống trên ảnh ${i + 1}/${images.length}...`);
          try {
            const ocrRes = await callGeminiApi('ocr_pdf_page', {
              pageNum: i + 1,
              image: { base64: images[i].base64, mimeType: images[i].mimeType },
              existingText: '',
            });
            if (ocrRes?.text) {
              ocrTexts.push(`=== Ảnh ${i + 1} ===\n${ocrRes.text}`);
            } else {
              payloadImages.push({ base64: images[i].base64, mimeType: images[i].mimeType });
            }
          } catch {
            payloadImages.push({ base64: images[i].base64, mimeType: images[i].mimeType });
          }
        }
        if (ocrTexts.length > 0) {
          finalRawText = [finalRawText, ...ocrTexts].filter(Boolean).join('\n\n');
        }
      }

      setStatusMsg('Bước 1/2: Giáo viên AI đang trích đầy đủ kiến thức & đề bài gốc, dịch tiếng Việt, phân tích đề và giảng chi tiết từng bước...');
      const aiResult = await callApiWithRetry(
        'import_onenote',
        {
          rawText: finalRawText,
          images: payloadImages,
          existingSubjects: subjects,
          targetSubjectId: selectedSubjectId || null,
          targetSubjectName: selectedSubjectObj?.title_de || '',
          teachingOnly: true,
        },
        { onWait: (m) => setStatusMsg(m) }
      );

      if (selectedSubjectId && aiResult) {
        aiResult.existing_subject_id = selectedSubjectId;
      }

      await enrichLessonsWithStudyPack(aiResult, (stepLabel) => {
        setStatusMsg(stepLabel);
      });

      const allUploadedPhotos =
        mode === 'images' && images.length > 0
          ? images.map((im, idx) => ({
              url: im.dataUrl,
              label: im.name ? `Ảnh ${idx + 1} · ${im.name}` : `Ảnh ${idx + 1}`,
            }))
          : [];
      const autoImgNames =
        mode === 'images' && images.length > 0
          ? images
              .map((im) => (im.name || '').trim())
              .filter(Boolean)
              .slice(0, 3)
          : [];
      const finalSourceFiles = manualSourceTag.trim()
        ? [manualSourceTag.trim()]
        : autoImgNames;

      await onSaveImportedData(aiResult, allUploadedPhotos, {
        forcedSubjectId: selectedSubjectId || null,
        sourceFiles: finalSourceFiles,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi phân tích kiến thức.');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const selectedGroupsCount = pdfGroups.filter((g) => g.selected).length;
  const nonBlankSkippedCount = pdfSkipped.filter((s) => {
    const pg = pdfPages.find((p) => p.pageNum === s.pageNum);
    return pg && !pg.isBlank;
  }).length;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && pdfStage !== 'importing' && !previewModal) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cursor-default bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Thêm kiến thức mới (PDF OneNote / Chữ / Ảnh bảng)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                OCR từng trang riêng biệt · Giải chi tiết mọi tình huống thực tế · Không bao giờ sót trang
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading || pdfStage === 'importing'}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CHỌN MÔN HỌC ĐÍCH — Khóa cứng môn học để bài không bao giờ bị chia vụn hay lạc môn */}
        <div className="px-5 pt-3.5 space-y-2">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0">
                {selectedSubjectId ? (
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span>Lưu vào môn:</span>
              </div>

              <select
                value={selectedSubjectId}
                disabled={loading || pdfStage === 'importing'}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">✨ Tự động xếp vào môn chính có sẵn (AI tự nhận diện)</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.title_de}{sub.title_vn ? ` — ${sub.title_vn}` : ''}
                  </option>
                ))}
              </select>

              {onCreateSubject && (
                <button
                  type="button"
                  disabled={loading || pdfStage === 'importing'}
                  onClick={() => setShowNewSubjectForm((v) => !v)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 inline-flex items-center justify-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Tạo môn mới
                </button>
              )}
            </div>

            {selectedSubjectObj && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                Đã khóa cố định vào môn <strong>{selectedSubjectObj.title_de}</strong> — AI sẽ không tự tạo nhánh môn phụ khác.
              </p>
            )}

            {showNewSubjectForm && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  value={newSubCode}
                  onChange={(e) => setNewSubCode(e.target.value)}
                  placeholder="Mã (VD: VKO, PuG, RW)"
                  className="sm:col-span-3 px-2.5 py-1.5 text-xs font-bold uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <input
                  value={newSubDe}
                  onChange={(e) => setNewSubDe(e.target.value)}
                  placeholder="Tên tiếng Đức (VD: Politik und Gesellschaft)"
                  className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <input
                  value={newSubVn}
                  onChange={(e) => setNewSubVn(e.target.value)}
                  placeholder="Tên tiếng Việt (VD: Chính trị & Xã hội)"
                  className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  type="button"
                  disabled={creatingSubject}
                  onClick={handleQuickCreateSubject}
                  className="sm:col-span-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg"
                >
                  {creatingSubject ? 'Đang lưu...' : 'Lưu môn'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 flex flex-wrap gap-2">
          {[
            { id: 'pdf', label: 'File PDF OneNote (OCR từng trang)', icon: Filter },
            { id: 'text', label: 'Dán chữ từ OneNote', icon: FileText },
            { id: 'images', label: 'Chụp bảng / Chữ viết tay', icon: ImageIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={loading || pdfStage === 'importing'}
                onClick={() => {
                  setMode(tab.id);
                  setError('');
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* ==================== TAB 1: PDF ONENOTE OCR + AUTO-FILTER ==================== */}
          {mode === 'pdf' && (
            <div className="space-y-4">
              {pdfStage === 'upload' && (
                <>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) handleSelectPdf(dropped);
                    }}
                    onClick={() => pdfInputRef.current?.click()}
                    className="border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-2xl p-7 text-center cursor-pointer transition space-y-3"
                  >
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleSelectPdf(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Kéo thả file PDF xuất từ OneNote vào đây (tối đa 40 trang)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        AI Vision đọc trọn vẹn từng trang 1 → 2 → 3 → 4, rồi model 70B tự giải chi tiết mọi tình huống (Situation / Fall)
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      Mẹo xuất PDF nhanh nhất từ OneNote trên Mac (khỏi cần căn ảnh tay):
                    </p>
                    <p>
                      Bấm <strong>File → Save as PDF</strong> (hoặc chỉnh <strong>Shift + Command + P</strong> sang khổ ngang 1 lần duy nhất). Chỉ cần chữ không bị cắt mất mép phải là AI đọc ngon 100%!
                    </p>
                  </div>

                  {/* Danh sách nhanh các file đã nạp trong môn để dễ đối chiếu với OneNote */}
                  {importedFilesOverview.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowImportedFilesList((v) => !v)}
                        className="w-full flex items-center justify-between gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-200"
                      >
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          Đã nạp {importedFilesOverview.length} file{selectedSubjectObj ? ` trong môn ${selectedSubjectObj.title_de.split('·')[0].trim()}` : ''} (bấm để đối chiếu OneNote)
                        </span>
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          {showImportedFilesList ? 'Thu gọn' : 'Xem danh sách'}
                        </span>
                      </button>

                      {showImportedFilesList && (
                        <div className="max-h-40 overflow-y-auto space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {importedFilesOverview.map((item, idx) => (
                            <div
                              key={`${item.lessonId}-${idx}`}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-[11px]"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">✓ {item.fileName}</span>
                                <span className="text-slate-400 ml-1.5">→ {item.lessonTitle}</span>
                              </div>
                              {onOpenExistingLesson && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenExistingLesson(item.lessonId);
                                  }}
                                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline shrink-0 inline-flex items-center gap-0.5"
                                >
                                  Mở <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {pdfStage === 'scanning' && (
                <div className="py-10 text-center space-y-4">
                  <Loader2 className="w-9 h-9 animate-spin text-indigo-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{pdfFileName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{statusMsg || 'Đang phân tích...'}</p>
                  </div>
                  {scanProgress.total > 0 && (
                    <div className="max-w-xs mx-auto space-y-1">
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{
                            width: `${Math.max(8, Math.round((scanProgress.done / scanProgress.total) * 100))}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Đã đọc OCR {scanProgress.done}/{scanProgress.total} trang ảnh
                      </p>
                    </div>
                  )}
                </div>
              )}

              {pdfStage === 'review' && (
                <div className="space-y-4">
                  {/* Cảnh báo nếu file PDF này đã từng được nạp vào web rồi */}
                  {duplicateMatches.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 rounded-2xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 font-extrabold">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span>
                          File &ldquo;{pdfFileName}&rdquo; có vẻ ĐÃ TỪNG ĐƯỢC NẠP RỒI! Kiểm tra trước để khỏi bị trùng bài:
                        </span>
                      </div>
                      <div className="space-y-1.5 pl-6">
                        {duplicateMatches.map((dup) => (
                          <div key={dup.id} className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-slate-700 dark:text-slate-200 font-semibold truncate">
                              • {dup.title_de}
                            </span>
                            {onOpenExistingLesson && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenExistingLesson(dup.id);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 inline-flex items-center gap-1"
                              >
                                Mở bài này (để xem / Cập nhật) <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary Banner */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Đã đọc sạch toàn bộ: {pdfFileName} ({pdfPages.length} trang)
                      </p>
                      <p className="text-xs text-emerald-900 dark:text-emerald-200">{pdfSummary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={resetPdf}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] font-bold shrink-0"
                    >
                      Chọn file khác
                    </button>
                  </div>

                  {/* Groups to Keep */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        Bài lý thuyết & Tình huống đề xuất nạp ({selectedGroupsCount}/{pdfGroups.length})
                      </h3>
                      <span className="text-[11px] text-slate-400">Bấm để tích chọn / bỏ chọn</span>
                    </div>

                    {pdfGroups.length === 0 ? (
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 text-center">
                        Chưa có nhóm bài nào được chọn — hãy bấm "Giữ lại" ở danh sách trang bên dưới.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {pdfGroups.map((g) => {
                          const groupPageObjs = g.pageNums
                            .map((n) => pdfPages.find((p) => p.pageNum === n))
                            .filter(Boolean);
                          return (
                            <div
                              key={g.id}
                              onClick={() => toggleGroupSelected(g.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleGroupSelected(g.id);
                                }
                              }}
                              className={`w-full text-left p-3.5 rounded-2xl border transition flex items-start gap-3 cursor-pointer ${
                                g.selected
                                  ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700'
                                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                                  g.selected
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                                }`}
                              >
                                {g.selected && <Check className="w-3.5 h-3.5" />}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">{g.title_de}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200">
                                      Trang {g.pageNums.join(', ')}
                                    </span>
                                    {g.subject_hint && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                        {g.subject_hint}
                                      </span>
                                    )}
                                  </div>
                                  {groupPageObjs[0] && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPdfPagePreview(groupPageObjs[0].pageNum, 'image');
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 shrink-0"
                                      title="Mở xem to từng trang & nội dung chữ AI đã đọc"
                                    >
                                      <Eye className="w-3.5 h-3.5" /> Xem & Soi
                                    </button>
                                  )}
                                </div>
                                {g.title_vn && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{g.title_vn}</p>}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{g.reason_vn}</p>

                                {/* Ảnh thu nhỏ TỪNG trang: bấm trực tiếp để mở phóng to & xem chữ OCR */}
                                {groupPageObjs.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    <p className="text-[10px] font-semibold text-slate-400">
                                      Bấm vào từng trang bên dưới để phóng to xem ảnh gốc & chữ AI đã đọc:
                                    </p>
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                      {groupPageObjs.map((pg) => (
                                        <button
                                          key={pg.pageNum}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPdfPagePreview(pg.pageNum, 'image');
                                          }}
                                          className="group relative w-20 h-24 rounded-xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-500 bg-white shrink-0 transition shadow-sm"
                                          title={`Bấm để xem phóng to Trang ${pg.pageNum} (${pg.charCount} ký tự)`}
                                        >
                                          {pg.thumbUrl ? (
                                            <img src={pg.thumbUrl} alt={`Trang ${pg.pageNum}`} className="w-full h-full object-cover" />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                                              Tr.{pg.pageNum}
                                            </div>
                                          )}
                                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 transition flex items-center justify-center">
                                            <span className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-indigo-600 text-white shadow transition">
                                              <ZoomIn className="w-3.5 h-3.5" />
                                            </span>
                                          </div>
                                          <span className="absolute bottom-0 inset-x-0 bg-slate-900/85 text-white text-[9px] font-bold text-center py-0.5">
                                            Tr.{pg.pageNum} · {pg.charCount > 0 ? `${pg.charCount}ch` : 'Ảnh'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Skipped Pages */}
                  {pdfSkipped.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Trang nháp / trống đã tự lọc bỏ ({pdfSkipped.length} trang)
                        </h3>
                        {nonBlankSkippedCount > 0 && (
                          <button
                            type="button"
                            onClick={restoreAllNonBlankSkipped}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold"
                          >
                            <CheckCheck className="w-3.5 h-3.5" /> Giữ tất cả {nonBlankSkippedCount} trang có nội dung
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {pdfSkipped.map((s) => {
                          const pg = pdfPages.find((p) => p.pageNum === s.pageNum);
                          return (
                            <div
                              key={s.pageNum}
                              className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 flex items-center justify-between gap-2.5 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openPdfPagePreview(s.pageNum, 'image')}
                                  className="group relative w-11 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-white shrink-0"
                                  title={`Bấm để xem phóng to Trang ${s.pageNum}`}
                                >
                                  {pg?.thumbUrl ? (
                                    <img src={pg.thumbUrl} alt={`Trang ${s.pageNum}`} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">
                                      Tr.{s.pageNum}
                                    </div>
                                  )}
                                  <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 flex items-center justify-center transition">
                                    <ZoomIn className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100" />
                                  </span>
                                </button>
                                <div className="min-w-0">
                                  <span className="font-bold text-rose-700 dark:text-rose-300">Trang {s.pageNum}:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300">{s.title_hint}</span>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.reason_vn}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openPdfPagePreview(s.pageNum, 'image')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:border-indigo-500"
                                >
                                  <Eye className="w-3 h-3" /> Xem
                                </button>
                                <button
                                  type="button"
                                  onClick={() => restoreSkippedPage(s)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-500"
                                >
                                  <RotateCcw className="w-3 h-3" /> Giữ lại
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pdfStage === 'importing' && (
                <div className="py-10 text-center space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                      AI 70B đang soạn & giải chi tiết bài {batchProgress.current}/{batchProgress.total}...
                    </p>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{batchProgress.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Chế độ Giáo viên: Đang trích đầy đủ lý thuyết & đề gốc → Dịch & phân tích đề → Giải từng bước + Casio → Tạo trọn bộ Từ vựng, Flashcards & Test...
                    </p>
                  </div>
                  <div className="max-w-sm mx-auto h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-500"
                      style={{
                        width: `${Math.max(10, Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: TEXT PASTE FROM ONENOTE ==================== */}
          {mode === 'text' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <input
                  value={manualSourceTag}
                  onChange={(e) => setManualSourceTag(e.target.value)}
                  placeholder="Nhãn file / Mã trang OneNote (tùy chọn, VD: 2.4 S_Bemessungsgrundlage)"
                  className="flex-1 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                {manualSourceTag && (
                  <button
                    type="button"
                    onClick={() => setManualSourceTag('')}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {duplicateMatches.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    ⚠️ Mã/file này đã có ở bài: <strong>{duplicateMatches[0].title_de}</strong>
                  </span>
                  {onOpenExistingLesson && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExistingLesson(duplicateMatches[0].id);
                      }}
                      className="font-bold text-amber-700 dark:text-amber-300 underline"
                    >
                      Mở bài đó
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setRawText(SAMPLE_GEMA)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800"
                >
                  + Dán mẫu GEMA (viết tắt kiểu thầy cô)
                </button>
                {rawText && (
                  <button
                    type="button"
                    onClick={() => setRawText('')}
                    className="text-xs text-slate-400 hover:text-rose-500 font-semibold"
                  >
                    Xóa chữ
                  </button>
                )}
              </div>
              <textarea
                rows={9}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Dán ghi chú OneNote tiếng Đức (kể cả gạch đầu dòng viết tắt, tình huống Situation 1-4 / Fall A-B) vào đây..."
                className="w-full p-4 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* ==================== TAB 3: BOARD / HANDWRITING PHOTOS ==================== */}
          {mode === 'images' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <input
                  value={manualSourceTag}
                  onChange={(e) => setManualSourceTag(e.target.value)}
                  placeholder="Nhãn file / Mã trang OneNote (để trống sẽ tự lấy tên file ảnh, VD: 2.5 S_Aufgaben)"
                  className="flex-1 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
                />
                {manualSourceTag && (
                  <button
                    type="button"
                    onClick={() => setManualSourceTag('')}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div
                onClick={() => images.length < 5 && imgInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 rounded-2xl p-6 text-center cursor-pointer transition space-y-2"
              >
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handlePickImages(e.target.files);
                    e.target.value = '';
                  }}
                />
                <ImageIcon className="w-8 h-8 text-indigo-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Chọn tối đa 5 ảnh chụp bảng / vở viết tay / phiếu bài tập ({images.length}/5)
                </p>
                <p className="text-[11px] text-slate-400">OCR từng ảnh riêng biệt rồi dùng AI 70B giải chi tiết mọi tình huống</p>
              </div>

              {images.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-600 dark:text-slate-300">
                      Đã chọn {images.length} ảnh — bấm vào bất kỳ ảnh nào để phóng to kiểm tra trước khi nạp:
                    </span>
                    <button
                      type="button"
                      onClick={() => openUploadedImagePreview(0)}
                      className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" /> Xem lần lượt
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {images.map((im, idx) => (
                      <div
                        key={idx}
                        className="group relative rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-500 bg-slate-100 dark:bg-slate-800 transition"
                      >
                        <button
                          type="button"
                          onClick={() => openUploadedImagePreview(idx)}
                          className="block w-full aspect-[4/3] relative overflow-hidden bg-white dark:bg-slate-900"
                          title={`Bấm để phóng to kiểm tra ${im.name || `Ảnh ${idx + 1}`}`}
                        >
                          <img src={im.dataUrl} alt={im.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/35 transition flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow transition">
                              <ZoomIn className="w-3.5 h-3.5" /> Xem rõ
                            </span>
                          </div>
                        </button>
                        <div className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                            Ảnh {idx + 1}{im.name ? ` · ${im.name}` : ''}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openUploadedImagePreview(idx)}
                              className="p-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                              title="Phóng to xem ảnh"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                              title="Xóa ảnh này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Ghi chú thêm cho AI (không bắt buộc, VD: Đây là môn BuB phần Rechtsbereiche)..."
                className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          )}

          {/* Loading & Error Feedback */}
          {loading && statusMsg && (
            <div className="bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-indigo-800 dark:text-indigo-200">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-slate-50/60 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={loading || pdfStage === 'importing'}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Hủy
          </button>

          {mode === 'pdf' ? (
            pdfStage === 'review' && (
              <button
                type="button"
                onClick={handleRunPdfBatchImport}
                disabled={selectedGroupsCount === 0}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold shadow-sm flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Nạp {selectedGroupsCount} bài đã chọn vào Web
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={handleSubmitTextOrImages}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Phân tích & Thêm vào Web
            </button>
          )}
        </div>
      </div>

      {/* ==================== FULLSCREEN PREVIEW & ZOOM LIGHTBOX (PDF + ẢNH TẢI LÊN) ==================== */}
      {previewModal && (() => {
        const isPdf = previewModal.kind === 'pdf';
        const activePdfPage = isPdf ? pdfPages.find((p) => p.pageNum === previewModal.pageNum) : null;
        const activeSkippedItem = isPdf ? pdfSkipped.find((s) => s.pageNum === previewModal.pageNum) : null;
        const activeGroupItem = isPdf ? pdfGroups.find((g) => g.pageNums.includes(previewModal.pageNum)) : null;
        const activeUploadedImg = !isPdf ? images[previewModal.index] : null;

        const imgSrc = isPdf ? (previewHighResUrl || activePdfPage?.thumbUrl || '') : (activeUploadedImg?.dataUrl || '');
        const totalCount = isPdf ? pdfPages.length : images.length;
        const currentPos = isPdf ? previewModal.pageNum : previewModal.index + 1;
        const canPrev = currentPos > 1;
        const canNext = currentPos < totalCount;

        const goPrev = () => {
          if (!canPrev) return;
          setPreviewZoom(1);
          setPreviewRotate(0);
          setPreviewModal((prev) =>
            prev
              ? prev.kind === 'pdf'
                ? { ...prev, pageNum: prev.pageNum - 1 }
                : { ...prev, index: prev.index - 1 }
              : null
          );
        };
        const goNext = () => {
          if (!canNext) return;
          setPreviewZoom(1);
          setPreviewRotate(0);
          setPreviewModal((prev) =>
            prev
              ? prev.kind === 'pdf'
                ? { ...prev, pageNum: prev.pageNum + 1 }
                : { ...prev, index: prev.index + 1 }
              : null
          );
        };

        return (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/92 backdrop-blur-md flex flex-col"
            onClick={() => setPreviewModal(null)}
          >
            {/* Top Toolbar */}
            <div
              className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-white shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-xs font-extrabold shrink-0">
                  {isPdf ? `Trang ${currentPos} / ${totalCount}` : `Ảnh ${currentPos} / ${totalCount}`}
                </span>
                <span className="text-xs font-bold text-slate-200 truncate max-w-[220px] sm:max-w-xs">
                  {isPdf
                    ? activeGroupItem?.title_de || activeSkippedItem?.title_hint || pdfFileName
                    : activeUploadedImg?.name || `Ảnh ${currentPos}`}
                </span>
                {isPdf && activeGroupItem && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                    {activeGroupItem.selected ? 'Đang chọn nạp' : 'Đã bỏ tích nhóm'}
                  </span>
                )}
                {isPdf && activeSkippedItem && (
                  <button
                    type="button"
                    onClick={() => restoreSkippedPage(activeSkippedItem)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                  >
                    <RotateCcw className="w-3 h-3" /> Giữ lại trang này
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Chuyển tab Ảnh gốc vs. Chữ AI đã đọc (cho PDF) */}
                {isPdf && (
                  <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 mr-1">
                    <button
                      type="button"
                      onClick={() => setPreviewModal((prev) => (prev ? { ...prev, tab: 'image' } : null))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        previewModal.tab === 'image' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Ảnh gốc
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewModal((prev) => (prev ? { ...prev, tab: 'text' } : null))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        previewModal.tab === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Chữ AI đọc ({activePdfPage?.charCount || 0})
                    </button>
                  </div>
                )}

                {/* Zoom & Rotate controls (khi đang xem ảnh) */}
                {(!isPdf || previewModal.tab === 'image') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((z) => Math.max(1, Number((z - 0.4).toFixed(2))))}
                      disabled={previewZoom <= 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                      title="Thu nhỏ (-)"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((z) => (z === 1 ? 1.8 : 1))}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold min-w-[60px]"
                      title="Chuyển nhanh Vừa khung / Phóng to 180%"
                    >
                      {previewZoom === 1 ? 'Vừa khung' : `${Math.round(previewZoom * 100)}%`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((z) => Math.min(3.5, Number((z + 0.4).toFixed(2))))}
                      disabled={previewZoom >= 3.5}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                      title="Phóng to (+)"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewRotate((r) => (r + 90) % 360)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
                      title="Xoay ảnh 90°"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </>
                )}

                {!isPdf && activeUploadedImg && (
                  <button
                    type="button"
                    onClick={() => {
                      const delIdx = previewModal.index;
                      const nextLen = images.length - 1;
                      setImages((prev) => prev.filter((_, i) => i !== delIdx));
                      if (nextLen <= 0) setPreviewModal(null);
                      else setPreviewModal({ kind: 'image', index: Math.min(delIdx, nextLen - 1) });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-[11px] font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-white ml-1"
                  title="Đóng (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Viewport */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              {/* Prev Arrow */}
              {canPrev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  className="absolute left-3 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700 shadow-lg transition"
                  title="Trang trước (←)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {/* Next Arrow */}
              {canNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  className="absolute right-3 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-indigo-600 text-white border border-slate-700 shadow-lg transition"
                  title="Trang sau (→)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {isPdf && previewModal.tab === 'text' ? (
                <div
                  className="w-full max-w-3xl max-h-full overflow-y-auto m-4 p-5 rounded-2xl bg-slate-900 border border-slate-700 text-slate-100 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <span className="text-xs font-extrabold text-indigo-400">
                      Nội dung chữ AI đã đọc được từ Trang {previewModal.pageNum}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {activePdfPage?.charCount || 0} ký tự
                    </span>
                  </div>
                  {activePdfPage?.text ? (
                    <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-slate-200">
                      {activePdfPage.text}
                    </pre>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Trang này không có chữ (trang trống hoặc chưa đọc được OCR). Hãy chuyển qua tab "Ảnh gốc" để kiểm tra trực tiếp.
                    </p>
                  )}
                </div>
              ) : (
                <div
                  ref={previewStageRef}
                  onClick={(e) => {
                    if (previewPanRef.current.moved) {
                      previewPanRef.current.moved = false;
                      e.stopPropagation();
                      return;
                    }
                    // Nhấn trực tiếp vào vùng nền trống xung quanh ảnh -> đóng ngay lập tức!
                    if (e.target === e.currentTarget) {
                      setPreviewModal(null);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (previewZoom <= 1.02 || e.button !== 0) return;
                    const box = previewStageRef.current;
                    if (!box) return;
                    previewPanRef.current = {
                      active: true,
                      moved: false,
                      startX: e.clientX,
                      startY: e.clientY,
                      scrollLeft: box.scrollLeft,
                      scrollTop: box.scrollTop,
                    };
                    setPreviewIsPanning(true);
                  }}
                  onMouseMove={(e) => {
                    if (!previewPanRef.current.active) return;
                    const box = previewStageRef.current;
                    if (!box) return;
                    const dx = e.clientX - previewPanRef.current.startX;
                    const dy = e.clientY - previewPanRef.current.startY;
                    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                      previewPanRef.current.moved = true;
                    }
                    box.scrollLeft = previewPanRef.current.scrollLeft - dx;
                    box.scrollTop = previewPanRef.current.scrollTop - dy;
                  }}
                  onMouseUp={() => {
                    if (previewPanRef.current.active) {
                      previewPanRef.current.active = false;
                      setPreviewIsPanning(false);
                    }
                  }}
                  onMouseLeave={() => {
                    if (previewPanRef.current.active) {
                      previewPanRef.current.active = false;
                      setPreviewIsPanning(false);
                    }
                  }}
                  onTouchStart={(e) => {
                    if (e.touches.length === 2) {
                      const d = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                      );
                      previewTouchRef.current = { mode: 'pinch', startDist: d, startZoom: previewZoom, moved: true };
                    } else if (e.touches.length === 1 && previewZoom <= 1.02) {
                      previewTouchRef.current = {
                        mode: 'swipe',
                        startX: e.touches[0].clientX,
                        startY: e.touches[0].clientY,
                        moved: false,
                      };
                    } else {
                      previewTouchRef.current = { mode: null, moved: false };
                    }
                  }}
                  onTouchMove={(e) => {
                    const t = previewTouchRef.current;
                    if (t.mode === 'pinch' && e.touches.length === 2 && t.startDist > 10) {
                      const d = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                      );
                      const nextZ = Math.min(3.5, Math.max(1, Number((t.startZoom * (d / t.startDist)).toFixed(2))));
                      setPreviewZoom(nextZ);
                    } else if (t.mode === 'swipe' && e.touches.length === 1 && previewZoom <= 1.02) {
                      const dx = e.touches[0].clientX - t.startX;
                      const dy = e.touches[0].clientY - t.startY;
                      if (dy > 16 && dy > Math.abs(dx) * 1.3) {
                        t.moved = true;
                        setPreviewDragOffsetY(Math.min(180, dy));
                      } else if (Math.abs(dx) > 16) {
                        t.moved = true;
                      }
                    }
                  }}
                  onTouchEnd={(e) => {
                    const t = previewTouchRef.current;
                    if (t.mode === 'swipe' && previewZoom <= 1.02) {
                      const touch = e.changedTouches?.[0];
                      if (touch) {
                        const dx = touch.clientX - t.startX;
                        const dy = touch.clientY - t.startY;
                        if (dy > 85 && dy > Math.abs(dx) * 1.35) {
                          setPreviewDragOffsetY(0);
                          setPreviewModal(null);
                          previewTouchRef.current = { mode: null, moved: false };
                          return;
                        }
                        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                          if (dx < 0 && canNext) goNext();
                          else if (dx > 0 && canPrev) goPrev();
                        }
                      }
                    }
                    setPreviewDragOffsetY(0);
                    previewTouchRef.current = { mode: null, moved: false };
                  }}
                  className={`w-full h-full overflow-auto p-4 sm:p-8 flex items-start justify-center ${
                    previewZoom > 1.02
                      ? previewIsPanning
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                      : 'cursor-pointer'
                  }`}
                >
                  <div
                    className="relative my-auto flex flex-col items-center pointer-events-none"
                    style={{
                      transform: previewDragOffsetY ? `translateY(${previewDragOffsetY}px)` : undefined,
                      opacity: previewDragOffsetY ? Math.max(0.35, 1 - previewDragOffsetY / 260) : 1,
                      transition: previewDragOffsetY ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                    }}
                  >
                    {previewLoadingImg && (
                      <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/90 text-white text-[11px] font-bold shadow pointer-events-auto">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải ảnh độ nét cao...
                      </div>
                    )}
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={`Xem trước ${currentPos}`}
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (previewPanRef.current.moved) {
                            previewPanRef.current.moved = false;
                            return;
                          }
                          setPreviewZoom((z) => (z === 1 ? 1.85 : 1));
                        }}
                        style={{
                          width: previewZoom === 1 ? 'auto' : `${Math.round(previewZoom * 100)}%`,
                          maxWidth: previewZoom === 1 ? '100%' : 'none',
                          maxHeight: previewZoom === 1 ? '75vh' : 'none',
                          transform: previewRotate ? `rotate(${previewRotate}deg)` : undefined,
                        }}
                        className={`pointer-events-auto rounded-xl bg-white shadow-2xl transition-[max-height] duration-150 select-none ${
                          previewZoom > 1.02
                            ? previewIsPanning
                              ? 'cursor-grabbing'
                              : 'cursor-grab'
                            : 'cursor-zoom-in object-contain'
                        }`}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 pointer-events-auto">Không có ảnh xem trước.</p>
                    )}
                    <span className="mt-2.5 text-[10px] font-semibold text-slate-400/90 hidden sm:inline">
                      Nhấn khoảng trống tối để đóng · Chụm 2 ngón phóng to · Vuốt 2 ngón lật trang
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Filmstrip */}
            {totalCount > 1 && (
              <div
                className="px-4 py-2.5 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2 overflow-x-auto justify-start sm:justify-center shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {isPdf
                  ? pdfPages.map((pg) => {
                      const active = pg.pageNum === previewModal.pageNum;
                      return (
                        <button
                          key={pg.pageNum}
                          type="button"
                          onClick={() => {
                            setPreviewZoom(1);
                            setPreviewRotate(0);
                            setPreviewModal((prev) => (prev ? { ...prev, pageNum: pg.pageNum } : null));
                          }}
                          className={`relative w-12 h-14 rounded-lg overflow-hidden border-2 shrink-0 bg-white transition ${
                            active ? 'border-indigo-500 ring-2 ring-indigo-400/60 scale-105' : 'border-slate-700 opacity-65 hover:opacity-100'
                          }`}
                        >
                          {pg.thumbUrl && <img src={pg.thumbUrl} alt={`Tr.${pg.pageNum}`} className="w-full h-full object-cover" />}
                          <span className="absolute bottom-0 inset-x-0 bg-slate-900/85 text-white text-[9px] font-bold text-center">
                            {pg.pageNum}
                          </span>
                        </button>
                      );
                    })
                  : images.map((im, idx) => {
                      const active = idx === previewModal.index;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPreviewZoom(1);
                            setPreviewRotate(0);
                            setPreviewModal({ kind: 'image', index: idx });
                          }}
                          className={`relative w-12 h-14 rounded-lg overflow-hidden border-2 shrink-0 bg-white transition ${
                            active ? 'border-indigo-500 ring-2 ring-indigo-400/60 scale-105' : 'border-slate-700 opacity-65 hover:opacity-100'
                          }`}
                        >
                          <img src={im.dataUrl} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-slate-900/85 text-white text-[9px] font-bold text-center">
                            {idx + 1}
                          </span>
                        </button>
                      );
                    })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

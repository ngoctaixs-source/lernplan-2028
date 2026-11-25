import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';

const SAMPLE_GEMA = `GEMA & Urheberrecht bei VA (Stichpunkte Lehrer)

1. UrhG: schützt geistige Schöpfungen (Musik, Texte, Fotos). Entsteht autom. mit Schöpfung -> keine Anmeldung nötig! Schutzfrist: 70 J. nach Tod d. Urhebers (§ 64 UrhG), danach gemeinfrei.

2. GEMA = Verwertungsgesellschaft -> nimmt Nutzungsrechte von Komponisten & Textdichtern wahr.

3. Pflichten Veranstalter:
- Jede öffentl. Wiedergabe geschützter Musik (Live, DJ, Hintergrundmusik) VOR VA anmelden!
- Tarife abhängig von: Raumgröße (m²), Eintritt (Brutto), Art (Live vs. Tonträger).
- Nach Live-VA: Musikfolge (Setlist) einreichen.

4. Nichtanmeldung -> doppelter Tarif (100% Kontrollzuschlag als Schadensersatz).`;

// Nạp động thư viện PDF.js (không cần sửa package.json, chạy mượt trực tiếp trên trình duyệt)
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

// Nén ảnh chụp bảng / chữ viết tay trước khi gửi lên Vercel Serverless (tránh quá 4.5MB)
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

// Quét nhanh 1 trang PDF: đo tỷ lệ mực thật (phân biệt trang trắng thật vs. trang có ảnh/phiếu bài tập) + tạo ảnh xem trước nhỏ
async function inspectPdfPageVisual(pdfDoc, pageNum, pdfjsLib) {
  const page = await pdfDoc.getPage(pageNum);

  // 1. Lấy chữ gõ máy
  const textContent = await page.getTextContent();
  const text = (textContent.items || [])
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Kiểm tra trang có chứa hình ảnh nhúng (OneNote Printout / sơ đồ / ảnh chụp) hay không
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

  // 3. Render thumbnail nhỏ (width 220px) để đo độ phủ mực thật & hiện ảnh xem trước
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
      // Điểm không phải nền trắng
      if (r < 242 || g < 242 || b < 242) {
        darkCount++;
      }
    }
    inkRatio = (darkCount * 4) / Math.max(1, totalPixels);
    thumbUrl = canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    inkRatio = text.length > 0 ? 0.05 : 0;
  }

  const isBlank = text.length < 15 && inkRatio < 0.007;
  const hasVisualContent = !isBlank && (hasEmbeddedImage || text.length < 220 || inkRatio > 0.015);

  return {
    pageNum,
    text,
    charCount: text.length,
    hasEmbeddedImage,
    inkRatio,
    isBlank,
    hasVisualContent,
    thumbUrl,
  };
}

// Chụp 1 trang PDF sang ảnh JPEG để Vision AI đọc trực tiếp phiếu bài tập / sơ đồ / tình huống
async function renderPdfPageToJpeg(pdfDoc, pageNum, maxWidth = 1240, quality = 0.76) {
  const page = await pdfDoc.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxWidth / Math.max(1, baseViewport.width));
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

export default function ImportModal({ subjects = [], onClose, onSaveImportedData, onBatchComplete }) {
  // 'pdf' | 'text' | 'images'
  const [mode, setMode] = useState('pdf');

  // Text & Photos state
  const [rawText, setRawText] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // PDF Auto-Filter state
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPages, setPdfPages] = useState([]);
  const [pdfSummary, setPdfSummary] = useState('');
  const [pdfGroups, setPdfGroups] = useState([]);
  const [pdfSkipped, setPdfSkipped] = useState([]);
  const [pdfStage, setPdfStage] = useState('upload'); // 'upload' | 'scanning' | 'review' | 'importing'
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: '', doneCount: 0, failList: [] });

  const pdfDocRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imgInputRef = useRef(null);

  // ==================== HANDLER 1: ĐỌC PDF + VISION QUÉT CẢ TRANG ẢNH / PHIẾU BÀI TẬP ====================
  const handleSelectPdf = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Vui lòng chọn đúng định dạng file .PDF xuất từ OneNote.');
      return;
    }

    setError('');
    setPdfFileName(file.name);
    setPdfStage('scanning');
    setStatusMsg('Đang mở file PDF và kiểm tra từng trang (cả chữ gõ lẫn ảnh phiếu bài tập)...');

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfDocRef.current = pdfDoc;

      const totalPages = Math.min(pdfDoc.numPages, 40);
      if (totalPages === 0) {
        throw new Error('File PDF trống, không có trang nào.');
      }

      const extractedPages = [];
      for (let p = 1; p <= totalPages; p++) {
        setStatusMsg(`Đang đọc & soi hình ảnh trang ${p}/${totalPages}...`);
        const info = await inspectPdfPageVisual(pdfDoc, p, pdfjsLib);
        extractedPages.push(info);
      }

      setPdfPages(extractedPages);

      // Chụp ảnh các trang dạng PDF Printout / ít chữ gõ nhưng KHÔNG phải trang trắng (tối đa 5 trang) để Vision AI đọc thật!
      const imageOnlyPages = extractedPages.filter((p) => !p.isBlank && p.charCount < 160).slice(0, 5);
      const previewPageImages = [];
      for (let i = 0; i < imageOnlyPages.length; i++) {
        const pg = imageOnlyPages[i];
        setStatusMsg(`Đang chuẩn bị ảnh trang ${pg.pageNum} để AI Vision đọc tình huống & sơ đồ...`);
        try {
          const rendered = await renderPdfPageToJpeg(pdfDoc, pg.pageNum, 900, 0.7);
          previewPageImages.push({
            pageNum: pg.pageNum,
            base64: rendered.base64,
            mimeType: rendered.mimeType,
          });
        } catch {
          // ignore single preview failure
        }
      }

      setStatusMsg(`AI đang rà soát ${totalPages} trang (đọc cả chữ trong ảnh & các tình huống thực tế)...`);

      const filterRes = await callGeminiApi('filter_pdf_pages', {
        fileName: file.name,
        pages: extractedPages.map((p) => ({
          pageNum: p.pageNum,
          charCount: p.charCount,
          isBlank: p.isBlank,
          hasVisualContent: p.hasVisualContent,
          textPreview: p.text.slice(0, 750),
        })),
        pageImages: previewPageImages,
        existingSubjects: subjects,
      });

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

      // Trang nào AI chưa nhắc tới -> nếu là trang có hình ảnh nội dung thật thì tự giữ lại, chỉ bỏ trang trắng
      const orphanVisualNums = [];
      for (let p = 1; p <= totalPages; p++) {
        if (!covered.has(p)) {
          const pg = extractedPages[p - 1];
          if (pg.isBlank) {
            normalizedSkipped.push({
              pageNum: p,
              title_hint: `Trang ${p}`,
              reason_vn: 'Trang trắng hoàn toàn',
            });
          } else {
            orphanVisualNums.push(p);
          }
        }
      }

      if (orphanVisualNums.length > 0) {
        if (normalizedGroups.length > 0 && normalizedGroups[0].pageNums.length + orphanVisualNums.length <= 4) {
          normalizedGroups[0].pageNums = Array.from(
            new Set([...normalizedGroups[0].pageNums, ...orphanVisualNums])
          ).sort((a, b) => a - b);
        } else {
          normalizedGroups.push({
            id: 'g-visual-auto',
            title_de: file.name.replace(/\.pdf$/i, ''),
            title_vn: 'Trang hình ảnh / tình huống bổ sung',
            subject_hint: '',
            pageNums: orphanVisualNums,
            reason_vn: 'Trang có hình ảnh/chữ viết thật (AI Vision sẽ đọc trực tiếp khi nạp)',
            selected: true,
          });
        }
      }

      setPdfSummary(
        filterRes?.summary_vn ||
          `Đã quét ${totalPages} trang: giữ lại ${normalizedGroups.length} cụm bài lý thuyết & tình huống, loại bỏ ${normalizedSkipped.length} trang trống/nháp.`
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
    setPdfGroups((prev) => {
      // Nếu chỉ có 1 nhóm và tổng <= 4 trang, gộp thẳng vào nhóm đầu cho liền mạch bài học
      if (prev.length === 1 && prev[0].pageNums.length < 4) {
        const merged = Array.from(new Set([...prev[0].pageNums, skippedItem.pageNum])).sort((a, b) => a - b);
        return [{ ...prev[0], pageNums: merged, selected: true }];
      }
      return [
        ...prev,
        {
          id: `restored-${skippedItem.pageNum}`,
          title_de: skippedItem.title_hint || `Seite ${skippedItem.pageNum}`,
          title_vn: `Khôi phục từ trang ${skippedItem.pageNum}`,
          subject_hint: prev[0]?.subject_hint || '',
          pageNums: [skippedItem.pageNum],
          reason_vn: 'Bạn đã chọn giữ lại để AI Vision đọc & giải đáp',
          selected: true,
        },
      ];
    });
  };

  const restoreAllNonBlankSkipped = () => {
    const nonBlank = pdfSkipped.filter((s) => {
      const pg = pdfPages.find((p) => p.pageNum === s.pageNum);
      return pg && !pg.isBlank;
    });
    if (!nonBlank.length) return;
    const nums = nonBlank.map((s) => s.pageNum);
    setPdfSkipped((prev) => prev.filter((s) => !nums.includes(s.pageNum)));
    setPdfGroups((prev) => {
      if (prev.length === 1 && prev[0].pageNums.length + nums.length <= 5) {
        const merged = Array.from(new Set([...prev[0].pageNums, ...nums])).sort((a, b) => a - b);
        return [{ ...prev[0], pageNums: merged, selected: true }];
      }
      return [
        ...prev,
        {
          id: `restored-all-${Date.now()}`,
          title_de: `${pdfFileName.replace(/\.pdf$/i, '')} (Praxisfälle & Zusatzseiten)`,
          title_vn: 'Các trang tình huống & nội dung giữ lại',
          subject_hint: prev[0]?.subject_hint || '',
          pageNums: nums.sort((a, b) => a - b),
          reason_vn: 'Đã giữ lại toàn bộ trang có nội dung hình ảnh/tình huống',
          selected: true,
        },
      ];
    });
  };

  const resetPdf = () => {
    pdfDocRef.current = null;
    setPdfFileName('');
    setPdfPages([]);
    setPdfSummary('');
    setPdfGroups([]);
    setPdfSkipped([]);
    setPdfStage('upload');
    setError('');
    setStatusMsg('');
  };

  // ==================== HANDLER 2: TỰ ĐỘNG NẠP HÀNG LOẠT CÁC BÀI ĐÃ DUYỆT ====================
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
        label: group.title_de,
        doneCount: totalLessonsCreated,
        failList: [...failList],
      });

      try {
        const groupPages = group.pageNums
          .map((num) => pdfPages.find((p) => p.pageNum === num))
          .filter(Boolean);

        const combinedText = [
          `THEMA / KONTEXT: ${group.title_de}${group.subject_hint ? ` (Fach: ${group.subject_hint})` : ''}`,
          ...groupPages.map(
            (p) =>
              `--- Seite ${p.pageNum} ---\n${
                p.text || '(Inhalt befindet sich im angehängten Bild — bitte alle Fälle, Situationen & Diagramme vollständig auslesen und lösen!)'
              }`
          ),
        ].join('\n\n');

        // Chụp mọi trang có hình ảnh / sơ đồ / phiếu bài tập (tối đa 5 ảnh/nhóm) để Vision AI đọc trọn vẹn
        const groupImages = [];
        let firstPhotoDataUrl = '';
        if (pdfDocRef.current) {
          const visualPages = groupPages.filter((p) => p.hasVisualContent || !p.text).slice(0, 5);
          for (const p of visualPages) {
            try {
              const rendered = await renderPdfPageToJpeg(pdfDocRef.current, p.pageNum, 1240, 0.76);
              groupImages.push({ base64: rendered.base64, mimeType: rendered.mimeType });
              if (!firstPhotoDataUrl) firstPhotoDataUrl = rendered.dataUrl;
            } catch {
              // ignore single page render error
            }
          }
        }

        const aiResult = await callGeminiApi('import_onenote', {
          rawText: combinedText,
          images: groupImages,
          existingSubjects: workingSubjects,
        });

        const saved = await onSaveImportedData(aiResult, firstPhotoDataUrl, { silent: true });
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

  // ==================== HANDLER 3: NHẬP CHỮ ONENOTE / ẢNH BẢNG (CÁCH CŨ) ====================
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
    setStatusMsg('AI đang chuẩn hóa câu IHK, giải đáp các tình huống thực tế, trích Từ vựng, Flashcards & Bài Test...');
    try {
      const aiResult = await callGeminiApi('import_onenote', {
        rawText: rawText.trim(),
        images: mode === 'images' ? images.map((im) => ({ base64: im.base64, mimeType: im.mimeType })) : [],
        existingSubjects: subjects,
      });

      const firstPhoto = mode === 'images' && images[0] ? images[0].dataUrl : '';
      await onSaveImportedData(aiResult, firstPhoto);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
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
                Đọc cả ảnh phiếu bài tập · Tự giải chi tiết tình huống thực tế · Lọc trang nháp chuẩn xác
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

        {/* Mode Tabs */}
        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {[
            { id: 'pdf', label: 'File PDF OneNote (Tự lọc + Vision)', icon: Filter },
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
          {/* ==================== TAB 1: PDF ONENOTE AUTO-FILTER ==================== */}
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
                        AI Vision đọc trực tiếp cả phiếu bài tập dạng ảnh, sơ đồ & giải chi tiết từng tình huống (Situation / Fall)
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      Mẹo xuất PDF từ OneNote trên Mac không bị cắt mép:
                    </p>
                    <p>
                      1. Nhấn <strong>Shift + Command + P</strong> → đổi hướng sang <strong>Ngang (Landscape)</strong> hoặc khổ <strong>A3</strong>.
                    </p>
                    <p>
                      2. Nhấn <strong>Command + P</strong> → góc dưới bên trái chọn <strong>PDF → Save as PDF</strong> → kéo thẳng vào ô trên!
                    </p>
                  </div>
                </>
              )}

              {pdfStage === 'scanning' && (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-9 h-9 animate-spin text-indigo-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{pdfFileName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{statusMsg || 'Đang phân tích...'}</p>
                </div>
              )}

              {pdfStage === 'review' && (
                <div className="space-y-4">
                  {/* Summary Banner */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        Đã quét xong: {pdfFileName} ({pdfPages.length} trang)
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
                          const thumbs = g.pageNums
                            .map((n) => pdfPages.find((p) => p.pageNum === n))
                            .filter((p) => p?.thumbUrl);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => toggleGroupSelected(g.id)}
                              className={`w-full text-left p-3.5 rounded-2xl border transition flex items-start gap-3 ${
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
                                {g.title_vn && <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{g.title_vn}</p>}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{g.reason_vn}</p>

                                {thumbs.length > 0 && (
                                  <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                                    {thumbs.map((pg) => (
                                      <div
                                        key={pg.pageNum}
                                        className="relative w-14 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                                      >
                                        <img src={pg.thumbUrl} alt={`Trang ${pg.pageNum}`} className="w-full h-full object-cover" />
                                        <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-white text-[9px] font-bold text-center">
                                          Tr.{pg.pageNum}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </button>
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
                              className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {pg?.thumbUrl && (
                                  <img
                                    src={pg.thumbUrl}
                                    alt={`Trang ${s.pageNum}`}
                                    className="w-10 h-12 rounded-md object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <span className="font-bold text-rose-700 dark:text-rose-300">Trang {s.pageNum}:</span>{' '}
                                  <span className="text-slate-700 dark:text-slate-300">{s.title_hint}</span>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.reason_vn}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => restoreSkippedPage(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-500 shrink-0"
                              >
                                <RotateCcw className="w-3 h-3" /> Giữ lại
                              </button>
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
                      Đang tự động nạp bài {batchProgress.current}/{batchProgress.total}...
                    </p>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{batchProgress.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      AI đang đọc toàn bộ hình ảnh, giải chi tiết từng tình huống thực tế, tạo Từ vựng, Flashcards & Test...
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
                <p className="text-[11px] text-slate-400">Tự động nén nhẹ ảnh & giải đáp đầy đủ các câu hỏi tình huống trong ảnh</p>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                  {images.map((im, idx) => (
                    <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100">
                      <img src={im.dataUrl} alt={im.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-slate-900/80 text-white hover:bg-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
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
    </div>
  );
}

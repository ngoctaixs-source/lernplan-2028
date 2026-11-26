import React, { useState, useRef } from 'react';
import {
  X,
  RefreshCw,
  Sparkles,
  Upload,
  Image as ImageIcon,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Layers,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        resolve({
          base64: dataUrl.split(',')[1],
          mimeType: 'image/jpeg',
          dataUrl,
          name: file.name,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function renderPdfPageToJpeg(pdfDoc, pageNum, maxWidth = 1450, quality = 0.8) {
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

function parseDataUrl(url) {
  const m = String(url || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

export default function LessonUpgradeModal({
  lesson,
  subject,
  subjects = [],
  sections = [],
  sourceImages = [],
  vocabCount = 0,
  cardCount = 0,
  quizCount = 0,
  onClose,
  onApplyUpgrade,
}) {
  // 'rewrite' = Nâng cấp toàn bộ bài theo chuẩn AI mới nhất | 'append' = Chỉ nối thêm kiến thức mới vào cuối bài
  const [updateMode, setUpdateMode] = useState('rewrite');
  // 'merge' = Giữ nguyên cũ & chỉ thêm mới (bảo toàn SRS) | 'replace' = Tạo mới hoàn toàn | 'keep_only' = Không đụng từ/thẻ/test
  const [studyPackMode, setStudyPackMode] = useState(
    vocabCount < 3 || cardCount < 3 || quizCount < 3 ? 'replace' : 'merge'
  );
  const [reuseSavedPhotos, setReuseSavedPhotos] = useState(sourceImages.length > 0);
  const [keepOriginalTitle, setKeepOriginalTitle] = useState(true);
  const [extraNote, setExtraNote] = useState('');

  // Optional new materials (PDF / Photos)
  const [newPdfFile, setNewPdfFile] = useState(null);
  const [newImages, setNewImages] = useState([]);
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState('');

  const pdfInputRef = useRef(null);
  const imgInputRef = useRef(null);

  const handlePickPdf = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Vui lòng chọn đúng định dạng file .PDF.');
      return;
    }
    setError('');
    setNewPdfFile(file);
  };

  const handlePickImages = async (files) => {
    const arr = Array.from(files || []).slice(0, 5 - newImages.length);
    if (!arr.length) return;
    setError('');
    try {
      const compressed = await Promise.all(arr.map((f) => compressImageFile(f)));
      setNewImages((prev) => [...prev, ...compressed].slice(0, 5));
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh tải lên.');
    }
  };

  const handleRunUpgrade = async () => {
    if (updateMode === 'append' && !newPdfFile && newImages.length === 0 && !extraNote.trim()) {
      setError('Ở chế độ "Nối thêm vào cuối bài", hãy tải thêm file PDF, ảnh hoặc nhập nội dung bổ sung.');
      return;
    }

    setError('');
    setRunning(true);
    setProgressPct(8);
    setStatusMsg('Đang gom dữ liệu hiện có của bài học...');

    try {
      const textChunks = [];
      const newlyArchivedPhotos = [];

      // 1. Giữ ngữ cảnh bài cũ
      const existingSectionsDigest = sections
        .map((s, idx) => `### Mục ${idx + 1}: ${s.heading_de || ''}\n${s.content_de || ''}`)
        .join('\n\n')
        .trim();

      if (updateMode === 'rewrite') {
        textChunks.push(
          `[BÀI HỌC HIỆN TẠI CẦN NÂNG CẤP LÊN CHUẨN GIÁO VIÊN IHK MỚI NHẤT]\nTiêu đề: ${lesson.title_de || ''}\nTổng quan: ${lesson.overview_de || ''}\n\n${existingSectionsDigest}`
        );
      } else if (existingSectionsDigest) {
        textChunks.push(
          `[BỐI CẢNH CÁC MỤC ĐÃ CÓ SẴN TRONG BÀI — CHỈ SOẠN PHẦN KIẾN THỨC / BÀI TẬP MỚI BỔ SUNG BÊN DƯỚI, KHÔNG LẶP LẠI PHẦN ĐÃ CÓ]:\n${existingSectionsDigest.slice(0, 2200)}`
        );
      }

      // 2. Nếu bật đọc lại ảnh bản gốc đã lưu trong bài (OCR sắc nét lại bằng prompt mới nhất)
      if (updateMode === 'rewrite' && reuseSavedPhotos && sourceImages.length > 0) {
        const savedDataImgs = sourceImages
          .map((im, idx) => ({ ...im, parsed: parseDataUrl(im.url), idx }))
          .filter((im) => im.parsed)
          .slice(0, 6);

        for (let i = 0; i < savedDataImgs.length; i++) {
          const item = savedDataImgs[i];
          setProgressPct(12 + Math.round(((i + 1) / Math.max(1, savedDataImgs.length)) * 24));
          setStatusMsg(`Đang đọc lại OCR ${item.label || `Trang ${i + 1}`} (${i + 1}/${savedDataImgs.length})...`);
          try {
            const ocrRes = await callApiWithRetry(
              'ocr_pdf_page',
              {
                pageNum: i + 1,
                image: { base64: item.parsed.base64, mimeType: item.parsed.mimeType },
                existingText: '',
              },
              { onWait: (m) => setStatusMsg(m) }
            );
            if (ocrRes?.text) {
              textChunks.push(`=== Ảnh bản gốc đã lưu (${item.label || `Trang ${i + 1}`}) ===\n${ocrRes.text}`);
            }
          } catch {
            // tiếp tục với các nguồn còn lại nếu 1 ảnh bị lỗi
          }
        }
      }

      // 3. Nếu người dùng tải thêm file PDF mới (tối đa 10 trang bổ sung)
      if (newPdfFile) {
        setStatusMsg(`Đang đọc file PDF mới "${newPdfFile.name}"...`);
        setProgressPct(38);
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await newPdfFile.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageCount = Math.min(pdfDoc.numPages, 10);

        for (let p = 1; p <= pageCount; p++) {
          setStatusMsg(`Đang đọc & OCR trang ${p}/${pageCount} của file PDF mới...`);
          setProgressPct(38 + Math.round((p / Math.max(1, pageCount)) * 22));
          const page = await pdfDoc.getPage(p);
          const textContent = await page.getTextContent();
          let pageText = (textContent.items || [])
            .map((it) => it.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          try {
            const rendered = await renderPdfPageToJpeg(pdfDoc, p, 1450, 0.8);
            newlyArchivedPhotos.push({
              url: rendered.dataUrl,
              label: `Cập nhật · Trang ${p}`,
            });

            if (pageText.length < 350) {
              const ocrRes = await callApiWithRetry(
                'ocr_pdf_page',
                {
                  pageNum: p,
                  image: { base64: rendered.base64, mimeType: rendered.mimeType },
                  existingText: pageText,
                },
                { onWait: (m) => setStatusMsg(`Trang ${p}: ${m}`) }
              );
              const ocrText = (ocrRes?.text || '').trim();
              if (ocrText.length >= pageText.length * 0.8) {
                pageText = ocrText;
              } else if (ocrText) {
                pageText = `${pageText}\n\n[Nội dung trong ảnh]:\n${ocrText}`;
              }
            }
          } catch {
            // giữ text trích trực tiếp
          }

          if (pageText) {
            textChunks.push(`=== Trang mới ${p} (${newPdfFile.name}) ===\n${pageText}`);
          }
        }
      }

      // 4. Nếu người dùng chọn thêm ảnh chụp mới
      if (newImages.length > 0) {
        for (let i = 0; i < newImages.length; i++) {
          const im = newImages[i];
          setStatusMsg(`AI Vision đang đọc ảnh mới ${i + 1}/${newImages.length}...`);
          newlyArchivedPhotos.push({
            url: im.dataUrl,
            label: im.name ? `Cập nhật · ${im.name}` : `Ảnh bổ sung ${i + 1}`,
          });
          try {
            const ocrRes = await callApiWithRetry(
              'ocr_pdf_page',
              {
                pageNum: i + 1,
                image: { base64: im.base64, mimeType: im.mimeType },
                existingText: '',
              },
              { onWait: (m) => setStatusMsg(m) }
            );
            if (ocrRes?.text) {
              textChunks.push(`=== Ảnh bổ sung ${i + 1} ===\n${ocrRes.text}`);
            }
          } catch {
            // ignore
          }
        }
      }

      // 5. Ghi chú / Yêu cầu cập nhật cụ thể của người dùng
      if (extraNote.trim()) {
        textChunks.push(`[YÊU CẦU / NỘI DUNG BỔ SUNG CỦA HỌC VIÊN]:\n${extraNote.trim()}`);
      }

      const finalRawText = textChunks.filter(Boolean).join('\n\n').trim();
      if (!finalRawText) {
        throw new Error('Không tìm thấy đủ nội dung để cập nhật bài học.');
      }

      // PHASE 1: Chạy AI Giáo viên 70B chuẩn mới nhất
      setProgressPct(66);
      setStatusMsg(
        updateMode === 'rewrite'
          ? 'Bước 1/2: Giáo viên AI 70B đang nâng cấp lại toàn bài (lý thuyết đầy đủ, đề gốc, giải chi tiết, LaTeX & Casio fx-580VN X)...'
          : 'Bước 1/2: Giáo viên AI 70B đang soạn các mục kiến thức / bài tập mới để nối vào cuối bài...'
      );

      const aiResult = await callApiWithRetry(
        'import_onenote',
        {
          rawText: finalRawText,
          images: [],
          existingSubjects: subjects,
          targetSubjectId: lesson.subject_id || null,
          targetSubjectName: subject?.title_de || '',
          teachingOnly: true,
        },
        { onWait: (m) => setStatusMsg(m) }
      );

      const upgradedLesson = Array.isArray(aiResult?.lessons) ? aiResult.lessons[0] : null;
      if (!upgradedLesson || !Array.isArray(upgradedLesson.sections) || upgradedLesson.sections.length === 0) {
        throw new Error('AI không trả về các mục bài học mới hợp lệ. Hãy thử lại.');
      }

      // Gộp các mục nếu AI trả về > 1 lesson
      const allNewSections = aiResult.lessons.flatMap((l) => (Array.isArray(l.sections) ? l.sections : []));
      let studyPack = null;

      // PHASE 2: Nâng cấp / bổ sung Từ vựng, Flashcards & Bài Test nếu được chọn
      if (studyPackMode !== 'keep_only') {
        setProgressPct(84);
        setStatusMsg('Bước 2/2: Đang cập nhật trọn bộ Từ vựng IHK, Flashcards & Câu hỏi Bài Test...');
        await sleep(2000);
        const sectionsDigestForPack = allNewSections
          .map((s) => `## ${s.heading_de || ''}\n${s.content_de || ''}\n${s.content_vn || ''}`)
          .join('\n\n')
          .trim();

        try {
          studyPack = await callApiWithRetry(
            'generate_study_pack',
            {
              lessonTitle: keepOriginalTitle ? lesson.title_de : upgradedLesson.title_de || lesson.title_de,
              sectionsText: sectionsDigestForPack,
            },
            { onWait: (m) => setStatusMsg(m) }
          );
        } catch {
          // Vẫn lưu thành công phần bài giảng ngay cả khi Phase 2 lỗi tạm thời
        }
      }

      setProgressPct(95);
      setStatusMsg('Đang lưu bản cập nhật vào Supabase (bảo toàn Ghi chú cá nhân & Lịch sử Gia sư AI)...');

      await onApplyUpgrade({
        lessonId: lesson.id,
        updateMode,
        studyPackMode,
        keepOriginalTitle,
        upgradedLesson: {
          ...upgradedLesson,
          sections: allNewSections,
        },
        studyPack,
        newlyArchivedPhotos,
      });

      setProgressPct(100);
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể cập nhật bài học. Vui lòng thử lại.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                Cập nhật bài học theo chuẩn mới nhất
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {lesson.title_de} · Cập nhật tại chỗ, không cần xóa làm lại từ đầu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {running ? (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Đang tự động nâng cấp bài học... ({progressPct}%)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {statusMsg}
                </p>
              </div>
              <div className="max-w-sm mx-auto h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${Math.max(8, progressPct)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Đừng đóng cửa sổ này — ghi chú cá nhân & lịch sử chat Gia sư AI cũ sẽ tự động được giữ lại!
              </p>
            </div>
          ) : (
            <>
              {/* 1. Update Strategy */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  1. Chọn kiểu cập nhật
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setUpdateMode('rewrite')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition space-y-1 ${
                      updateMode === 'rewrite'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-white">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Nâng cấp chuẩn AI mới nhất (1 chạm)
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Viết lại bài theo chuẩn Giáo viên mới nhất (đủ lý thuyết, nguyên văn đề bài, giải từng câu, LaTeX, T-Konto & Casio fx-580VN X).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUpdateMode('append')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition space-y-1 ${
                      updateMode === 'append'
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-white">
                      <Plus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      Chỉ nối thêm phần mới vào cuối bài
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Giữ nguyên 100% các mục đã học, chỉ bổ sung thêm các trang/bài tập mới thầy cô vừa dạy thêm vào cuối bài.
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Source Reuse & Safety Checkboxes */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  Bảo toàn dữ liệu & Nguồn đọc lại
                </div>

                {updateMode === 'rewrite' && sourceImages.length > 0 && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reuseSavedPhotos}
                      onChange={(e) => setReuseSavedPhotos(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-slate-700 dark:text-slate-200 leading-snug">
                      <strong>Đọc lại từ {sourceImages.length} ảnh bản gốc đã lưu trong bài</strong> (khuyên bật — giúp AI khôi phục đầy đủ những phần trước đây bị thiếu mà không cần tải lại file!).
                    </span>
                  </label>
                )}

                {updateMode === 'rewrite' && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepOriginalTitle}
                      onChange={(e) => setKeepOriginalTitle(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700 dark:text-slate-200">
                      Giữ nguyên tiêu đề bài học hiện tại (bỏ tích nếu muốn AI đặt lại tiêu đề gọn đẹp hơn).
                    </span>
                  </label>
                )}

                <div className="pt-1 border-t border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Xử lý Từ vựng ({vocabCount}), Flashcards ({cardCount}) & Bài Test ({quizCount}):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {[
                      { id: 'merge', label: 'Giữ cũ + Thêm mới', desc: 'Bảo toàn 100% tiến độ SRS' },
                      { id: 'replace', label: 'Tạo mới toàn bộ', desc: 'Dùng khi bài cũ bị thiếu' },
                      { id: 'keep_only', label: 'Giữ nguyên không đổi', desc: 'Nhanh nhất (~10 giây)' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStudyPackMode(opt.id)}
                        className={`p-2 rounded-xl border text-left transition ${
                          studyPackMode === opt.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}
                      >
                        <div className="text-[11px] font-extrabold">{opt.label}</div>
                        <div className={`text-[10px] ${studyPackMode === opt.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Optional Extra Materials (PDF / Photos / Note) */}
              <div className="space-y-2.5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  2. Bổ sung thêm tài liệu mới hoặc yêu cầu riêng (không bắt buộc nếu chỉ nâng cấp chuẩn AI)
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* PDF Picker */}
                  <div
                    onClick={() => pdfInputRef.current?.click()}
                    className="p-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer flex items-center gap-2.5 transition"
                  >
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        handlePickPdf(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {newPdfFile ? newPdfFile.name : 'Thêm file PDF mới (tối đa 10 trang)'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {newPdfFile ? 'Bấm để đổi file khác' : 'Khi thầy cô cập nhật trang OneNote'}
                      </p>
                    </div>
                    {newPdfFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewPdfFile(null);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Image Picker */}
                  <div
                    onClick={() => newImages.length < 5 && imgInputRef.current?.click()}
                    className="p-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer flex items-center gap-2.5 transition"
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
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Thêm ảnh chụp mới ({newImages.length}/5)
                      </p>
                      <p className="text-[10px] text-slate-400">Ảnh bảng, tờ đáp án thầy cô chữa</p>
                    </div>
                  </div>
                </div>

                {newImages.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {newImages.map((im, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                        <img src={im.dataUrl} alt={im.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-0.5 rounded bg-slate-900/80 text-white hover:bg-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  rows={2}
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  placeholder='Yêu cầu cụ thể hoặc ghi chú dán thêm (VD: "Giải kỹ hơn câu 4, thêm bảng so sánh và chi tiết bấm Casio fx-580VN X")...'
                  className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Mọi <strong>Ghi chú cá nhân (Eigene Notizen)</strong> và <strong>Lịch sử chat Gia sư AI</strong> bạn đã trao đổi trong bài này sẽ tự động được bảo toàn sau khi cập nhật!
                </span>
              </div>

              {error && (
                <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl p-3 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-slate-50/60 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Hủy
          </button>
          {!running && (
            <button
              type="button"
              onClick={handleRunUpgrade}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {updateMode === 'rewrite' ? 'Cập nhật bài ngay' : 'Nối thêm vào cuối bài'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

export default function ImportModal({ subjects = [], onClose, onSaveImportedData, onBatchComplete }) {
  // 'pdf' | 'text' | 'images'
  const [mode, setMode] = useState('pdf');

  // Text & Photos state
  const [rawText, setRawText] = useState('');
  const [images, setImages] = useState([]);
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

  // ==================== HANDLER 1: ĐỌC PDF + OCR TỪNG TRANG ẢNH + PHÂN LOẠI 70B ====================
  const handleSelectPdf = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Vui lòng chọn đúng định dạng file .PDF xuất từ OneNote.');
      return;
    }

    setError('');
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
              const rendered = await renderPdfPageToJpeg(pdfDoc, pg.pageNum, 1400, 0.8);
              const ocrRes = await callGeminiApi('ocr_pdf_page', {
                pageNum: pg.pageNum,
                image: { base64: rendered.base64, mimeType: rendered.mimeType },
                existingText: pg.text,
              });
              const ocrText = (ocrRes?.text || '').trim();
              if (ocrRes?.isEmpty && pg.charCount < 15) {
                pg.isBlank = true;
                pg.text = '';
                pg.charCount = 0;
              } else if (ocrText.length > pg.text.length * 0.7) {
                pg.text = ocrText;
                pg.charCount = ocrText.length;
              } else if (ocrText) {
                pg.text = `${pg.text}\n\n[Nội dung trong ảnh/sơ đồ]:\n${ocrText}`;
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
      const filterRes = await callGeminiApi('filter_pdf_pages', {
        fileName: file.name,
        pages: extractedPages.map((p) => ({
          pageNum: p.pageNum,
          charCount: p.charCount,
          isBlank: p.isBlank,
          textPreview: p.text.slice(0, 1150),
        })),
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
    setPdfFileName('');
    setPdfPages([]);
    setPdfSummary('');
    setPdfGroups([]);
    setPdfSkipped([]);
    setPdfStage('upload');
    setError('');
    setStatusMsg('');
  };

  // ==================== HANDLER 2: NẠP HÀNG LOẠT BẰNG MODEL 70B TỪ VĂN BẢN ĐÃ OCR ĐẦY ĐỦ ====================
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

        // Chụp 1 ảnh nhẹ của trang đầu làm ảnh đối chiếu (nếu cần), và CHỈ đính ảnh vào AI cho trang nào OCR bị lỗi
        let firstPhotoDataUrl = groupPages[0]?.thumbUrl || '';
        const fallbackImages = [];
        if (pdfDocRef.current) {
          if (groupPages[0]) {
            try {
              const refImg = await renderPdfPageToJpeg(pdfDocRef.current, groupPages[0].pageNum, 1000, 0.72);
              firstPhotoDataUrl = refImg.dataUrl;
            } catch {
              // keep thumbUrl
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
        }

        const combinedText = [
          `THEMA: ${group.title_de}${group.subject_hint ? ` | FACH: ${group.subject_hint}` : ''}`,
          `ANZAHL SEITEN IN DIESEM PAKET: ${groupPages.length} (Seiten: ${group.pageNums.join(', ')})`,
          'WICHTIG: Verarbeite ALLE folgenden Seiten vollständig und löse JEDE Situation / jeden Fall / jede Aufgabe konkret!',
          ...groupPages.map(
            (p) =>
              `=== Seite ${p.pageNum} ===\n${
                p.text || '(Text konnte nicht extrahiert werden — siehe angehängtes Bild)'
              }`
          ),
        ].join('\n\n');

        // Gửi văn bản đầy đủ (images rỗng trừ khi có trang lỗi OCR) -> chạy trên model 70B cực thông minh & không sót trang!
        const aiResult = await callGeminiApi('import_onenote', {
          rawText: combinedText,
          images: fallbackImages,
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

      setStatusMsg('AI 70B đang soạn bài chuẩn IHK, giải đáp các tình huống thực tế, trích Từ vựng, Flashcards & Test...');
      const aiResult = await callGeminiApi('import_onenote', {
        rawText: finalRawText,
        images: payloadImages,
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

        {/* Mode Tabs */}
        <div className="px-5 pt-4 flex flex-wrap gap-2">
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

                                {/* Hiển thị ảnh thu nhỏ + số ký tự AI đã đọc được ở TỪNG trang */}
                                {groupPageObjs.length > 0 && (
                                  <div className="flex items-center gap-2 pt-1.5 overflow-x-auto">
                                    {groupPageObjs.map((pg) => (
                                      <div
                                        key={pg.pageNum}
                                        className="relative w-16 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0"
                                        title={pg.text.slice(0, 160)}
                                      >
                                        {pg.thumbUrl ? (
                                          <img src={pg.thumbUrl} alt={`Trang ${pg.pageNum}`} className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                                            Tr.{pg.pageNum}
                                          </div>
                                        )}
                                        <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-white text-[9px] font-bold text-center py-0.5">
                                          Tr.{pg.pageNum} · {pg.charCount > 0 ? `${pg.charCount}ch` : 'Ảnh'}
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
                      AI 70B đang soạn & giải chi tiết bài {batchProgress.current}/{batchProgress.total}...
                    </p>
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{batchProgress.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Đang tổng hợp trọn vẹn mọi trang, giải đáp từng tình huống thực tế, tạo Từ vựng, Flashcards & Test...
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
                <p className="text-[11px] text-slate-400">OCR từng ảnh riêng biệt rồi dùng AI 70B giải chi tiết mọi tình huống</p>
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

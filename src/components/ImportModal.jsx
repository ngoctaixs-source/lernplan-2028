import React, { useState, useRef } from 'react';
import { X, Sparkles, FileText, Image as ImageIcon, Loader2, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { callGeminiApi, compressImageToBase64, compressImageForStorage } from '../lib/api';
import { SAMPLE_GEMA_ONENOTE } from '../lib/seedData';

export default function ImportModal({ subjects, onClose, onSaveImportedData }) {
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'image'
  const [rawText, setRawText] = useState('');
  const [images, setImages] = useState([]); // [{ base64, mimeType, previewUrl, storageUrl, name }]
  const [loading, setLoading] = useState(false);
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFilesAdded = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setError('');
    const remainingSlots = Math.max(0, 3 - images.length);
    const selected = Array.from(fileList).slice(0, remainingSlots);
    if (selected.length === 0) {
      setError('Tối đa 3 ảnh mỗi lần quét để đảm bảo tốc độ và độ chính xác cao nhất.');
      return;
    }

    try {
      const processed = [];
      for (const file of selected) {
        const compressed = await compressImageToBase64(file);
        const storageUrl = await compressImageForStorage(file);
        processed.push({
          ...compressed,
          storageUrl,
          name: file.name || `photo-${Date.now()}.jpg`,
        });
      }
      setImages((prev) => [...prev, ...processed]);
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh.');
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      setInputMode('image');
      await handleFilesAdded(pastedFiles);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!rawText.trim() && images.length === 0) {
      setError('Vui lòng dán ghi chú OneNote hoặc tải ít nhất 1 ảnh chụp bảng/vở.');
      return;
    }

    setLoading(true);
    setStatusStep(
      'AI đang đọc chữ viết tay/viết tắt, chuẩn hóa câu chuẩn IHK, vẽ bảng/biểu đồ, trích xuất Từ vựng, Flashcards và bộ câu hỏi Test bao quát...'
    );
    try {
      const result = await callGeminiApi('import_onenote', {
        rawText: rawText.trim(),
        images: images.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
        existingSubjects: subjects.map((s) => ({
          id: s.id,
          title_de: s.title_de,
          title_vn: s.title_vn,
        })),
      });

      if (!result || !Array.isArray(result.lessons) || result.lessons.length === 0) {
        throw new Error('AI chưa tách được bài học nào. Hãy thử cung cấp nội dung rõ hơn.');
      }

      setStatusStep('Đang lưu bài học, ảnh bảng gốc, Từ vựng, Flashcards & Bài Test lên Supabase...');
      const firstBoardPhoto = images[0]?.storageUrl || '';
      await onSaveImportedData(result, firstBoardPhoto);
      onClose();
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra khi nhập kiến thức.');
    } finally {
      setLoading(false);
      setStatusStep('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Thêm kiến thức mới (OneNote / Ảnh bảng)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tự sửa viết tắt & thiếu chủ vị ngữ · Tự trích Từ vựng, Bảng/Biểu đồ, Flashcards & Test bao quát
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode switch */}
        <div className="px-6 pt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                inputMode === 'text'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FileText className="w-4 h-4" />
              Dán chữ từ OneNote
            </button>
            <button
              type="button"
              onClick={() => setInputMode('image')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                inputMode === 'image'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Chụp bảng / Chữ viết tay (tối đa 3 ảnh)
            </button>
          </div>

          {inputMode === 'text' && (
            <button
              type="button"
              onClick={() => setRawText(SAMPLE_GEMA_ONENOTE)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
            >
              + Dán mẫu GEMA (viết tắt kiểu thầy cô)
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {inputMode === 'text' ? (
            <textarea
              rows={9}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={loading}
              placeholder="Dán ghi chú OneNote tiếng Đức (kể cả viết tắt, gạch đầu dòng thiếu chủ vị ngữ)... Hoặc nhấn Cmd+V để dán thẳng ảnh chụp màn hình!"
              className="w-full p-4 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed resize-y"
            />
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesAdded(e.target.files);
                  e.target.value = '';
                }}
              />

              {images.length < 3 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFilesAdded(e.dataTransfer.files);
                  }}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 rounded-2xl p-6 text-center cursor-pointer transition"
                >
                  <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Bấm chọn ảnh chụp bảng/vở, kéo thả, hoặc nhấn{' '}
                    <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">Cmd + V</kbd>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Đã chọn {images.length}/3 ảnh · Ảnh đầu tiên sẽ được lưu kèm trong bài để bạn đối chiếu lại bất cứ lúc nào
                  </p>
                </div>
              )}

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 group"
                    >
                      <img src={img.previewUrl} alt={img.name} className="w-full h-28 object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-lg shadow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate bg-white/90 dark:bg-slate-900/90">
                        Ảnh {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={loading}
                placeholder="(Tùy chọn) Gợi ý thêm cho AI (VD: Đây là bài Netzplantechnik / chú ý ký hiệu GP = Gesamtpuffer)..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs rounded-xl p-3.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200 text-xs rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
              <div>
                <p className="font-bold">Gemini 2.5 Flash đang xử lý toàn diện...</p>
                <p className="opacity-85 mt-0.5">{statusStep}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition flex items-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Phân tích & Thêm vào Web
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { X, Sparkles, FileText, Image as ImageIcon, Loader2, AlertCircle, Upload, CheckCircle2 } from 'lucide-react';
import { callGeminiApi, compressImageToBase64 } from '../lib/api';
import { SAMPLE_GEMA_ONENOTE } from '../lib/seedData';

export default function ImportModal({ subjects, onClose, onSaveImportedData }) {
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'image'
  const [rawText, setRawText] = useState('');
  const [imageData, setImageData] = useState(null); // { base64, mimeType, previewUrl, name }
  const [loading, setLoading] = useState(false);
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = async (file) => {
    if (!file) return;
    setError('');
    try {
      const compressed = await compressImageToBase64(file);
      setImageData({ ...compressed, name: file.name || 'screenshot.jpg' });
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh.');
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setInputMode('image');
          await handleFileChange(file);
        }
        break;
      }
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!rawText.trim() && !imageData?.base64) {
      setError('Vui lòng dán ghi chú OneNote hoặc tải ảnh bài giảng lên.');
      return;
    }

    setLoading(true);
    setStatusStep('AI đang phân loại môn học, tách bài theo lộ trình Nền tảng → Mở rộng và tạo Flashcard + Bài Test...');
    try {
      const result = await callGeminiApi('import_onenote', {
        rawText: rawText.trim(),
        imageBase64: imageData?.base64 || '',
        imageMimeType: imageData?.mimeType || 'image/jpeg',
        existingSubjects: subjects.map((s) => ({
          id: s.id,
          title_de: s.title_de,
          title_vn: s.title_vn,
        })),
      });

      if (!result || !Array.isArray(result.lessons) || result.lessons.length === 0) {
        throw new Error('AI chưa tách được bài học nào. Hãy thử cung cấp đoạn ghi chú rõ hơn.');
      }

      setStatusStep('Đang lưu bài học, Flashcards và Bài Test lên Supabase...');
      await onSaveImportedData(result);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bạn muốn thêm gì vào trang web?</h2>
              <p className="text-xs text-slate-500">
                Dán ghi chú OneNote hoặc chụp ảnh vở/slide — AI tự phân loại, chia bài & dịch song ngữ Đức–Việt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-6 pt-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                inputMode === 'text' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              Dán chữ từ OneNote
            </button>
            <button
              type="button"
              onClick={() => setInputMode('image')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                inputMode === 'image' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Ảnh chụp vở / Slide (OCR)
            </button>
          </div>

          {inputMode === 'text' && (
            <button
              type="button"
              onClick={() => setRawText(SAMPLE_GEMA_ONENOTE)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
            >
              + Dán mẫu GEMA & Urheberrecht để test
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {inputMode === 'text' ? (
            <div>
              <textarea
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={loading}
                placeholder="Copy toàn bộ đoạn ghi chú tiếng Đức từ OneNote dán vào đây (hoặc nhấn Cmd+V để dán thẳng ảnh chụp màn hình)..."
                className="w-full p-4 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white leading-relaxed resize-y"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              {!imageData ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileChange(e.dataTransfer.files?.[0]);
                  }}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-2xl p-8 text-center cursor-pointer transition"
                >
                  <Upload className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-800">
                    Bấm chọn ảnh, kéo thả vào đây, hoặc nhấn <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-xs">Cmd + V</kbd>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Hỗ trợ ảnh chụp bảng, ảnh cắt từ OneNote, slide PDF tiếng Đức (tự động nén gọn siêu nhanh)
                  </p>
                </div>
              ) : (
                <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-100">
                  <img
                    src={imageData.previewUrl}
                    alt="Preview"
                    className="w-full max-h-64 object-contain mx-auto"
                  />
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-slate-200">
                    <span className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Đã sẵn sàng quét OCR: {imageData.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setImageData(null)}
                      className="text-xs font-semibold text-rose-600 hover:underline ml-2"
                    >
                      Chọn ảnh khác
                    </button>
                  </div>
                </div>
              )}

              <input
                type="text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={loading}
                placeholder="(Tùy chọn) Ghi chú thêm về môn học hoặc phần cần AI tập trung..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
              <div>
                <p className="font-semibold">Đang xử lý bằng Gemini 2.5 Flash...</p>
                <p className="text-indigo-700/80 mt-0.5">{statusStep}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Tự động giữ nguyên từ vựng IHK gốc + sinh 5–6 Flashcards + 4–5 câu Test
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
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
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  Pin,
  Copy,
  Check,
  Image as ImageIcon,
  X,
  Sparkles,
  Languages,
  AlertCircle,
  Cloud,
  HardDrive,
  RefreshCw,
  CornerDownRight,
} from 'lucide-react';
import { callGeminiApi } from '../lib/api';
import RichContent from './RichContent';

// Nén nhẹ ảnh chụp bài làm / ảnh dán clipboard trước khi gửi lên Vercel
function compressChatImage(file, maxWidth = 1280, quality = 0.78) {
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
          name: file.name || 'anh-bai-lam.jpg',
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatChatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function SectionAiChat({
  contextKey,
  contextType = 'section', // 'section' | 'quiz' | 'mistakes' | 'exam'
  subjectName = '',
  lessonTitle = '',
  sectionHeading = '',
  sectionContentDe = '',
  sectionContentVn = '',
  diagramJson = null,
  extraContext = '',
  messages = [],
  onUpdateMessages,
  onPinToNote = null,
  onWordClick = null,
  isCloudSynced = false,
  onClose = null,
  pendingQuote = '',
  onClearPendingQuote = null,
}) {
  const [input, setInput] = useState('');
  const [quotedText, setQuotedText] = useState('');
  const [attachedImg, setAttachedImg] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // 'mixed' = tự nhận diện & bấm dịch mọi từ tiếng Đức trong câu trả lời (MẶC ĐỊNH BẬT) | 'full' = mọi từ | 'off' = tắt
  const [chatDictMode, setChatDictMode] = useState('mixed');
  const [copiedId, setCopiedId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  // Nút nổi "↳ Hỏi Gia sư AI" khi người dùng tô đen chữ trong khung chat
  const [selectionPopup, setSelectionPopup] = useState(null); // null | { text, top, left }

  const listEndRef = useRef(null);
  const messagesBoxRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Nhận đoạn tô đen truyền từ bên ngoài (từ nội dung bài học) vào thẳng khung chat
  useEffect(() => {
    if (pendingQuote && String(pendingQuote).trim()) {
      setQuotedText(String(pendingQuote).trim().slice(0, 600));
      if (onClearPendingQuote) onClearPendingQuote();
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
    }
  }, [pendingQuote, onClearPendingQuote]);

  // Tự phát hiện mục có chứa tính toán / kế toán để gợi ý nút hỏi nhanh Casio phù hợp
  const isMathHeavy = useMemo(() => {
    const sample = `${subjectName} ${lessonTitle} ${sectionHeading} ${sectionContentDe}`.toLowerCase();
    return /€|%|bilanz|konto|guv|break-even|kalkulation|deckungsbeitrag|ust|vst|umsatzsteuer|vorsteuer|netto|brutto|elastizit|preisbildung|buchungssatz|rechnungs|ksk|bemessung|\\frac|fixkosten/.test(
      sample
    );
  }, [subjectName, lessonTitle, sectionHeading, sectionContentDe]);

  const quickPrompts = useMemo(() => {
    if (contextType === 'exam') {
      return [
        { label: 'Phân tích bẫy của đề thi này', text: 'Trong bộ đề thi thử này, các câu nào hay có bẫy của IHK nhất? Chỉ rõ cách tránh mất điểm.' },
        { label: 'Cách bấm Casio các câu tính toán', text: 'Liệt kê công thức và tổ hợp phím bấm Casio fx-580VN X cho các câu tính toán có trong đề thi này.' },
        { label: 'Cách viết câu trả lời ăn trọn Teilpunkte', text: 'Hướng dẫn tao cách trình bày câu tự luận bằng tiếng Đức sao cho ăn tối đa Teilpunkte trong đề thi này.' },
        { label: 'Hỏi ngược 1 câu mô phỏng thi thật', text: 'Ra cho tao 1 câu mô phỏng thi IHK dựa trên bộ đề này, chưa tiết lộ đáp án để tao tự trả lời trước.' },
      ];
    }
    if (contextType === 'quiz') {
      return [
        { label: 'Giải thích câu hay nhầm nhất', text: 'Trong bài test này, câu nào dễ dính bẫy IHK nhất? Giải thích rõ tại sao các đáp án nhiễu lại sai.' },
        { label: 'Cách bấm Casio bài test', text: 'Nếu bài test này có câu tính toán/kế toán, hãy chỉ tao công thức và từng phím bấm trên Casio fx-580VN X.' },
        { label: 'Tóm tắt mẹo ăn điểm', text: 'Tóm tắt ngắn gọn 3 mẹo nhớ từ khóa tiếng Đức ăn điểm cho toàn bộ bài test này.' },
        { label: 'Cho 1 câu tương tự luyện tay', text: 'Hỏi ngược lại tao 1 câu tình huống thực tế tương tự bài test này để tao tự trả lời rồi mày chấm.' },
      ];
    }
    if (contextType === 'mistakes') {
      return [
        { label: 'Phân tích lỗ hổng kiến thức', text: 'Nhìn danh sách các câu tao đang làm sai, tao hay bị hổng ở dạng kiến thức hay lỗi tư duy nào nhất?' },
        { label: 'Lập kế hoạch ôn lại nhanh', text: 'Chỉ tao thứ tự ôn lại các câu sai này sao cho nhớ chắc nhất trước khi thi IHK.' },
        { label: 'Giải thích lại câu sai đầu tiên', text: 'Giải thích thật bình dân câu sai mới nhất trong danh sách giúp tao hiểu bản chất.' },
        { label: 'Kiểm tra lại tao 1 câu', text: 'Dựa vào các lỗi sai của tao, hãy ra 1 câu hỏi nhỏ kiểu IHK để kiểm tra xem tao đã hết nhầm chưa.' },
      ];
    }
    if (isMathHeavy) {
      return [
        { label: 'Giải thích bản chất dễ hiểu', text: 'Giải thích phần này theo cách bình dân nhất có thể để tao hiểu bản chất, không cần đọc thuộc lòng máy móc.' },
        { label: 'Chỉ bấm Casio fx-580VN X', text: 'Hướng dẫn từng bước tính toán phần này kèm chính xác tổ hợp phím bấm trên máy Casio fx-580VN X.' },
        { label: 'Cho ví dụ số khác ngành sự kiện', text: 'Cho tao 1 bài toán ví dụ thực tế khác trong ngành tổ chức sự kiện (concert/club/hội nghị) rồi giải chi tiết từng bước.' },
        { label: 'Hỏi ngược lại tao 1 câu', text: 'Hãy đặt 1 câu hỏi tính toán/định khoản ngắn về đúng mục này để tao tự làm rồi mày chấm giúp.' },
      ];
    }
    return [
      { label: 'Giải thích bình dân hơn', text: 'Giải thích mục này theo kiểu đời thường dễ hiểu nhất đi, đừng dùng văn sách giáo khoa khô khan.' },
      { label: 'Ví dụ thực tế ngành sự kiện', text: 'Cho tao 1 tình huống thực tế sống động trong ngành sự kiện ở Đức để nhớ ngay kiến thức mục này.' },
      { label: '3 ý ăn điểm thi IHK', text: 'Tóm tắt 3 ý cốt lõi kèm từ khóa tiếng Đức bắt buộc phải viết nếu ra thi IHK phần này.' },
      { label: 'Hỏi ngược lại tao 1 câu', text: 'Đặt cho tao 1 câu hỏi tình huống ngắn về đúng mục này để tao tự trả lời rồi mày chấm và sửa giúp.' },
    ];
  }, [contextType, isMathHeavy]);

  // Cuộn mượt xuống tin nhắn mới nhất khi có tin nhắn mới
  useEffect(() => {
    if (messages.length > 0 || sending) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length, sending]);

  // Ẩn nút nổi tô đen khi click ra ngoài hoặc bấm Esc
  useEffect(() => {
    if (!selectionPopup) return undefined;
    const hideOnScrollOrKey = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      setSelectionPopup(null);
    };
    window.addEventListener('keydown', hideOnScrollOrKey);
    window.addEventListener('scroll', hideOnScrollOrKey, true);
    return () => {
      window.removeEventListener('keydown', hideOnScrollOrKey);
      window.removeEventListener('scroll', hideOnScrollOrKey, true);
    };
  }, [selectionPopup]);

  // Phát hiện khi người dùng tô đen một đoạn chữ trong khung tin nhắn chat -> bật nút "↳ Hỏi Gia sư AI"
  const handleDetectChatSelection = () => {
    setTimeout(() => {
      const box = messagesBoxRef.current;
      if (!box) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionPopup(null);
        return;
      }
      const selectedStr = sel.toString().replace(/\s+/g, ' ').trim();
      if (selectedStr.length < 3) {
        setSelectionPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const anchorEl = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
      if (!anchorEl || !box.contains(anchorEl)) {
        setSelectionPopup(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setSelectionPopup(null);
        return;
      }

      const top = rect.top > 56 ? rect.top - 44 : rect.bottom + 8;
      const left = Math.min(Math.max(rect.left + rect.width / 2, 92), window.innerWidth - 92);
      setSelectionPopup({
        text: selectedStr.slice(0, 600),
        top,
        left,
      });
    }, 15);
  };

  const handleApplyChatSelectionQuote = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionPopup?.text) return;
    setQuotedText(selectionPopup.text);
    setSelectionPopup(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 40);
  };

  const handleAttachFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('Chỉ hỗ trợ đính kèm tệp ảnh (PNG, JPG, ảnh chụp màn hình).');
      return;
    }
    setError('');
    try {
      const compressed = await compressChatImage(file);
      setAttachedImg(compressed);
    } catch (err) {
      setError(err.message || 'Không xử lý được ảnh đính kèm.');
    }
  };

  // Cho phép nhấn Command + V dán thẳng ảnh chụp màn hình vào ô chat
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await handleAttachFile(file);
          return;
        }
      }
    }
  };

  const handleSend = async (overrideText = null) => {
    const textToSend = (overrideText !== null ? overrideText : input).trim();
    const imgToSend = overrideText !== null ? null : attachedImg;
    const quoteToSend = overrideText !== null ? '' : quotedText.trim();

    if (!textToSend && !imgToSend && !quoteToSend) return;
    if (sending) return;

    setError('');
    setSelectionPopup(null);
    setSending(true);

    const effectiveUserText =
      textToSend ||
      (quoteToSend
        ? 'Giải thích chi tiết và dễ hiểu giúp tao đúng đoạn này.'
        : 'Hãy đọc ảnh bài làm / tài liệu này và giải thích giúp tôi.');

    const userMsgObj = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: effectiveUserText,
      ...(quoteToSend ? { quotedText: quoteToSend } : {}),
      hasImage: Boolean(imgToSend),
      createdAt: new Date().toISOString(),
    };

    const optimisticMessages = [...messages, userMsgObj];
    onUpdateMessages(contextKey, optimisticMessages, {
      contextType,
      title: sectionHeading || lessonTitle || 'Hội thoại AI',
    });

    if (overrideText === null) {
      setInput('');
      setQuotedText('');
      setAttachedImg(null);
    }

    try {
      const data = await callGeminiApi('chat_tutor', {
        contextType,
        subjectName,
        lessonTitle,
        sectionHeading,
        sectionContentDe,
        sectionContentVn,
        diagramJson,
        extraContext,
        quotedText: quoteToSend,
        history: messages.slice(-12).map((m) => ({
          role: m.role,
          content: m.quotedText ? `[Trích dẫn: "${m.quotedText}"]\n${m.content}` : m.content,
        })),
        userMessage: effectiveUserText,
        image: imgToSend ? { base64: imgToSend.base64, mimeType: imgToSend.mimeType } : null,
      });

      const replyText = (data?.reply || '').trim();
      if (!replyText) {
        throw new Error('Gia sư AI trả về câu trả lời trống. Hãy thử gửi lại.');
      }

      const aiMsgObj = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        createdAt: new Date().toISOString(),
      };

      onUpdateMessages(contextKey, [...optimisticMessages, aiMsgObj], {
        contextType,
        title: sectionHeading || lessonTitle || 'Hội thoại AI',
      });
    } catch (err) {
      // Khôi phục lại danh sách trước tin nhắn lỗi và giữ lại chữ + trích dẫn cho user bấm gửi lại
      onUpdateMessages(contextKey, messages, {
        contextType,
        title: sectionHeading || lessonTitle || 'Hội thoại AI',
      });
      if (overrideText === null) {
        setInput(textToSend);
        if (quoteToSend) setQuotedText(quoteToSend);
        if (imgToSend) setAttachedImg(imgToSend);
      }
      setError(err.message || 'Không kết nối được với Gia sư AI. Thử lại sau vài giây.');
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = () => {
    if (!messages.length) return;
    if (!window.confirm('Xóa toàn bộ lịch sử chat AI của riêng mục này? (Các mục khác vẫn giữ nguyên)')) return;
    onUpdateMessages(contextKey, [], {
      contextType,
      title: sectionHeading || lessonTitle || 'Hội thoại AI',
    });
    setError('');
  };

  const handleCopyReply = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 2000);
    } catch {
      // ignore clipboard fallback
    }
  };

  const handlePinReply = (msg) => {
    if (!onPinToNote) return;
    onPinToNote(msg.content);
    setPinnedId(msg.id);
    setTimeout(() => setPinnedId((cur) => (cur === msg.id ? null : cur)), 2500);
  };

  return (
    <div className="section-ai-chat-root mt-3 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/80 bg-gradient-to-b from-indigo-50/50 to-white dark:from-slate-900 dark:to-slate-950 overflow-hidden shadow-sm">
      {/* Floating Highlight-to-Ask Pill (giống nút "↳ Hỏi Gemini") */}
      {selectionPopup && (
        <button
          type="button"
          onMouseDown={handleApplyChatSelectionQuote}
          onTouchStart={handleApplyChatSelectionQuote}
          style={{
            top: `${selectionPopup.top}px`,
            left: `${selectionPopup.left}px`,
            transform: 'translateX(-50%)',
          }}
          className="fixed z-[80] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900 dark:bg-slate-800 hover:bg-indigo-600 text-white text-xs font-bold shadow-2xl border border-slate-700/80 transition animate-fadeIn whitespace-nowrap"
        >
          <CornerDownRight className="w-3.5 h-3.5 text-indigo-300" />
          Hỏi Gia sư AI
        </button>
      )}

      {/* Header */}
      <div className="px-4 py-3 bg-indigo-600/10 dark:bg-indigo-950/60 border-b border-indigo-200/80 dark:border-indigo-800/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-indigo-950 dark:text-indigo-100">
                Gia sư AI IHK · Riêng mục này
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                title={
                  isCloudSynced
                    ? 'Hội thoại được tự động lưu đồng bộ lên tài khoản Supabase của bạn'
                    : 'Hội thoại đang lưu cục bộ trên trình duyệt này'
                }
              >
                {isCloudSynced ? <Cloud className="w-3 h-3 text-emerald-500" /> : <HardDrive className="w-3 h-3 text-amber-500" />}
                {isCloudSynced ? 'Đồng bộ Cloud' : 'Lưu trên máy'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              Tô đen bất kỳ đoạn nào để bấm &ldquo;↳ Hỏi Gia sư AI&rdquo; · Lưu tách biệt cho &ldquo;{sectionHeading || lessonTitle}&rdquo;
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Toggle chạm-dịch từ tiếng Đức trong câu trả lời AI (mặc định tự bật cho mọi từ tiếng Đức!) */}
          {onWordClick && (
            <button
              type="button"
              onClick={() =>
                setChatDictMode((v) => (v === 'mixed' ? 'full' : v === 'full' ? 'off' : 'mixed'))
              }
              title="Bấm để chuyển chế độ chạm-dịch từ tiếng Đức trong câu trả lời AI (Tự động DE -> Mọi từ -> Tắt)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                chatDictMode !== 'off'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
              }`}
            >
              <Languages className="w-3 h-3" />
              Tra từ DE: {chatDictMode === 'mixed' ? 'BẬT' : chatDictMode === 'full' ? 'TẤT CẢ' : 'TẮT'}
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={sending}
              title="Xóa lịch sử chat riêng mục này"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 border border-slate-200 dark:border-slate-700"
            >
              <Trash2 className="w-3 h-3" /> Xóa
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Thu gọn khung chat"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Viewport */}
      <div
        ref={messagesBoxRef}
        onMouseUp={handleDetectChatSelection}
        onTouchEnd={handleDetectChatSelection}
        className="p-3.5 sm:p-4 max-h-[28rem] overflow-y-auto space-y-3"
      >
        {messages.length === 0 ? (
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-100">
                  Vướng chỗ nào cứ tô đen hoặc hỏi thẳng ở đây — tao đã đọc sẵn toàn bộ mục này rồi!
                </p>
                <p>
                  Mày có thể <strong>tô đen bất kỳ câu/công thức nào</strong> ở bài học phía trên (hoặc trong câu trả lời của tao) rồi bấm <strong>↳ Hỏi Gia sư AI</strong>, nhờ chỉ bấm <strong>Casio fx-580VN X</strong>, hoặc nhấn <strong>Command + V</strong> dán thẳng ảnh chụp bài làm vào để tao kiểm tra.
                </p>
              </div>
            </div>

            {/* Quick-ask suggestion chips */}
            <div className="flex flex-wrap gap-1.5 pl-9">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={sending}
                  onClick={() => handleSend(qp.text)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 transition shadow-sm text-left"
                >
                  ✨ {qp.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {isUser ? (
                    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 text-white px-3.5 py-2.5 text-xs sm:text-sm space-y-1.5 shadow-sm">
                      {msg.quotedText && (
                        <div className="rounded-xl bg-white/12 border-l-2 border-amber-300 px-2.5 py-1.5 text-[11px] text-indigo-100 space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-200">
                            <CornerDownRight className="w-3 h-3" /> Đoạn đang hỏi:
                          </span>
                          <p className="italic line-clamp-3">&ldquo;{msg.quotedText}&rdquo;</p>
                        </div>
                      )}
                      {msg.hasImage && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold">
                          <ImageIcon className="w-3 h-3" /> Đã gửi kèm ảnh bài làm
                        </span>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      {msg.createdAt && (
                        <p className="text-[9px] text-indigo-200 text-right">{formatChatTime(msg.createdAt)}</p>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-[96%] sm:max-w-[90%] rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm space-y-2.5">
                      <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 select-text">
                        <RichContent
                          text={msg.content}
                          isGerman={chatDictMode === 'full'}
                          mixedGerman={chatDictMode === 'mixed'}
                          dictMode={chatDictMode !== 'off'}
                          onWordClick={onWordClick}
                        />
                      </div>

                      {/* Footer Actions on AI Reply */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-400">
                          Gia sư IHK {msg.createdAt ? `· ${formatChatTime(msg.createdAt)}` : ''} · Tô đen chữ để hỏi sâu thêm
                        </span>
                        <div className="flex items-center gap-1.5">
                          {onPinToNote && (
                            <button
                              type="button"
                              onClick={() => handlePinReply(msg)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                                pinnedId === msg.id
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              }`}
                              title="Lưu câu trả lời này vào Ghi chú cá nhân (Eigene Notizen) của mục học"
                            >
                              {pinnedId === msg.id ? <Check className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                              {pinnedId === msg.id ? 'Đã ghim vào Note' : 'Ghim vào Ghi chú'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyReply(msg)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            {copiedId === msg.id ? 'Đã copy' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 px-4 py-3 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span className="font-semibold">Gia sư AI IHK đang phân tích & soạn câu trả lời...</span>
                </div>
              </div>
            )}

            {/* Quick follow-up chips even after chat started */}
            {!sending && messages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickPrompts.slice(0, 3).map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qp.text)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
                  >
                    + {qp.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Error Bar */}
      {error && (
        <div className="mx-3.5 mb-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </span>
          <button
            type="button"
            onClick={() => handleSend()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shrink-0"
          >
            <RefreshCw className="w-3 h-3" /> Thử lại
          </button>
        </div>
      )}

      {/* Highlighted Quote Focus Chip (hiển thị đoạn vừa tô đen ngay trên khung gõ) */}
      {quotedText && (
        <div className="mx-3.5 mb-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-700/80 flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex items-start gap-2">
            <CornerDownRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Đang hỏi tập trung vào đoạn đã tô đen:
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200 italic line-clamp-2 mt-0.5">
                &ldquo;{quotedText}&rdquo;
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQuotedText('')}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 shrink-0"
            title="Bỏ đoạn trích dẫn"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attached Image Preview */}
      {attachedImg && (
        <div className="mx-3.5 mb-2 p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={attachedImg.dataUrl}
              alt="Ảnh đính kèm"
              className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 truncate">
                {attachedImg.name}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                AI Vision sẽ đọc kỹ ảnh này cùng câu hỏi của bạn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedImg(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-600"
            title="Bỏ ảnh đính kèm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleAttachFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={sending}
          onClick={() => fileInputRef.current?.click()}
          title="Đính kèm ảnh chụp bài làm / giấy nháp (hoặc nhấn Command + V dán thẳng ảnh)"
          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-indigo-600 hover:border-indigo-400 transition shrink-0 disabled:opacity-40"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            quotedText
              ? 'Nhập câu hỏi về đoạn vừa tô đen (hoặc nhấn Enter để AI giải thích ngay)...'
              : 'Hỏi sâu về mục này... (Enter gửi · Shift+Enter xuống dòng · Cmd+V dán ảnh)'
          }
          className="flex-1 resize-none px-3.5 py-2.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-28"
        />

        <button
          type="button"
          disabled={sending || (!input.trim() && !attachedImg && !quotedText.trim())}
          onClick={() => handleSend()}
          className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold shadow-sm transition inline-flex items-center gap-1.5 shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Gửi</span>
        </button>
      </div>
    </div>
  );
}

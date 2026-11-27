import React, { useState, useMemo, useEffect } from 'react';
import {
  Volume2,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  List,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  Languages,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { isCardDue } from '../lib/seedData';
import { speakGerman } from '../lib/tts';
import { callGeminiApi } from '../lib/api';
import RichContent from './RichContent';

export default function FlashcardDeck({
  cards = [],
  progressMap = {},
  onSetMastery,
  showVn = true,
  ttsRate = 1.0,
  dictMode = true,
  onWordClick = null,
  isAdmin = false,
  onGenerateMoreCards = null,
  onAddManualCard = null,
  onDeleteCard = null,
  subjectMap = null,
}) {
  const [filterMode, setFilterMode] = useState('due'); // 'due' | 'all' | 'mastered'
  const [viewMode, setViewMode] = useState('deck'); // 'deck' | 'list'
  const [shuffledOrder, setShuffledOrder] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Luôn hiển thị bản dịch / gợi ý tiếng Việt ngay mặt trước khi Dịch VN đang BẬT (có thể bật/tắt nhanh)
  const [showFrontVn, setShowFrontVn] = useState(true);
  const [frontTranslations, setFrontTranslations] = useState({}); // { [cardId]: string }
  const [translatingCardId, setTranslatingCardId] = useState(null);

  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    category: 'Fachbegriff',
    front_de: '',
    hint_vn: '',
    back_de: '',
    back_vn: '',
    example_de: '',
    example_vn: '',
  });
  const [savingCard, setSavingCard] = useState(false);

  const dueCount = useMemo(() => cards.filter((c) => isCardDue(progressMap[c.id])).length, [cards, progressMap]);
  const masteredCount = useMemo(
    () => cards.filter((c) => progressMap[c.id]?.status === 'mastered').length,
    [cards, progressMap]
  );

  const filteredCards = useMemo(() => {
    let base = cards;
    if (filterMode === 'due') {
      base = cards.filter((c) => isCardDue(progressMap[c.id]));
      if (base.length === 0 && cards.length > 0) base = cards;
    } else if (filterMode === 'mastered') {
      base = cards.filter((c) => progressMap[c.id]?.status === 'mastered');
    }

    if (Array.isArray(shuffledOrder) && shuffledOrder.length > 0) {
      const byId = new Map(base.map((c) => [c.id, c]));
      const ordered = shuffledOrder.map((id) => byId.get(id)).filter(Boolean);
      const seen = new Set(ordered.map((c) => c.id));
      base.forEach((c) => {
        if (!seen.has(c.id)) ordered.push(c);
      });
      return ordered;
    }
    return base;
  }, [cards, progressMap, filterMode, shuffledOrder]);

  const safeIdx = Math.min(currentIdx, Math.max(0, filteredCards.length - 1));
  const activeCard = filteredCards[safeIdx] || null;

  // Reset flip when changing card
  useEffect(() => {
    setFlipped(false);
  }, [safeIdx, filterMode]);

  // Phím tắt Space (lật thẻ), mũi tên trái/phải (đổi thẻ), 1/2/3 (đánh giá SRS)
  useEffect(() => {
    if (viewMode !== 'deck' || !activeCard || showAddForm) return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIdx((i) => (i + 1) % Math.max(1, filteredCards.length));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIdx((i) => (i - 1 + Math.max(1, filteredCards.length)) % Math.max(1, filteredCards.length));
      } else if (e.key === '1') {
        handleRate('learning');
      } else if (e.key === '2') {
        handleRate('review');
      } else if (e.key === '3') {
        handleRate('mastered');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode, activeCard, filteredCards.length, showAddForm]);

  const handleRate = async (status) => {
    if (!activeCard || !onSetMastery) return;
    await onSetMastery(activeCard.id, status);
    setFlipped(false);
    if (filteredCards.length > 1) {
      setCurrentIdx((i) => (i + 1) % filteredCards.length);
    }
  };

  const handleShuffle = () => {
    const ids = filteredCards.map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setShuffledOrder(ids);
    setCurrentIdx(0);
    setFlipped(false);
  };

  const handleTranslateFront = async (card, e) => {
    if (e) e.stopPropagation();
    if (!card?.front_de || translatingCardId === card.id) return;
    setTranslatingCardId(card.id);
    try {
      const res = await callGeminiApi('translate_phrase', { text: card.front_de });
      if (res?.translation_vn) {
        setFrontTranslations((prev) => ({ ...prev, [card.id]: res.translation_vn }));
        setShowFrontVn(true);
      }
    } catch {
      // ignore transient error
    } finally {
      setTranslatingCardId(null);
    }
  };

  const handleCreateManual = async (e) => {
    e.preventDefault();
    if (!draft.front_de.trim() || !draft.back_de.trim() || !onAddManualCard) return;
    setSavingCard(true);
    try {
      await onAddManualCard(draft);
      setDraft({
        category: 'Fachbegriff',
        front_de: '',
        hint_vn: '',
        back_de: '',
        back_vn: '',
        example_de: '',
        example_vn: '',
      });
      setShowAddForm(false);
    } finally {
      setSavingCard(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!onGenerateMoreCards || generating) return;
    setGenerating(true);
    try {
      await onGenerateMoreCards();
    } finally {
      setGenerating(false);
    }
  };

  const pct = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header Controls Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
              Lặp lại ngắt quãng (SRS kiểu Anki): {masteredCount}/{cards.length} thẻ ({pct}%)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Bấm trực tiếp vào bất kỳ từ tiếng Đức nào trên thẻ để tra từ điển (không bị lật nhầm thẻ) · Bấm vùng trống trên thẻ hoặc Space để lật
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'due', label: `Cần ôn hôm nay (${dueCount})` },
              { id: 'all', label: `Tất cả (${cards.length})` },
              { id: 'mastered', label: `Đã thuộc (${masteredCount})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilterMode(f.id);
                  setCurrentIdx(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterMode === f.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                {f.label}
              </button>
            ))}

            <button
              type="button"
              onClick={handleShuffle}
              title="Trộn ngẫu nhiên thứ tự thẻ"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950 text-slate-600 dark:text-slate-300"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setViewMode((m) => (m === 'deck' ? 'list' : 'deck'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              {viewMode === 'deck' ? <List className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              {viewMode === 'deck' ? 'Danh sách' : 'Xem thẻ'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && onGenerateMoreCards && (
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerateAI}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                + Tạo thêm 5 thẻ bằng AI
              </button>
            )}
            {isAdmin && onAddManualCard && (
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Tự thêm thẻ mới
              </button>
            )}
          </div>

          {showVn && viewMode === 'deck' && (
            <button
              type="button"
              onClick={() => setShowFrontVn((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                showFrontVn
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              {showFrontVn ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Dịch VN mặt trước: {showFrontVn ? 'HIỆN' : 'ẨN'}
            </button>
          )}
        </div>

        {/* Manual Add Card Form */}
        {isAdmin && showAddForm && (
          <form
            onSubmit={handleCreateManual}
            className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-indigo-600">Tạo Flashcard mới</span>
              <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={draft.front_de}
                onChange={(e) => setDraft({ ...draft, front_de: e.target.value })}
                placeholder="Mặt trước tiếng Đức (Câu hỏi / Thuật ngữ) *"
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                required
              />
              <input
                value={draft.hint_vn}
                onChange={(e) => setDraft({ ...draft, hint_vn: e.target.value })}
                placeholder="Dịch tiếng Việt / Gợi ý mặt trước"
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <textarea
                rows={2}
                value={draft.back_de}
                onChange={(e) => setDraft({ ...draft, back_de: e.target.value })}
                placeholder="Mặt sau đáp án tiếng Đức *"
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                required
              />
              <textarea
                rows={2}
                value={draft.back_vn}
                onChange={(e) => setDraft({ ...draft, back_vn: e.target.value })}
                placeholder="Giải thích / Dịch đáp án tiếng Việt"
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingCard}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
              >
                {savingCard ? 'Đang lưu...' : 'Lưu thẻ'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Empty State */}
      {filteredCards.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Không có thẻ nào trong bộ lọc này.</p>
          {cards.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Xem tất cả {cards.length} thẻ
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredCards.map((c) => {
            const prog = progressMap[c.id];
            const status = prog?.status || 'new';
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {c.category || 'Fachbegriff'}
                    </span>
                    {subjectMap && c.subject_id && subjectMap[c.subject_id] && (
                      <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[140px]">
                        {subjectMap[c.subject_id].split('·')[0].trim()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => speakGerman(c.front_de, ttsRate)}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && onDeleteCard && (
                      <button
                        type="button"
                        onClick={() => onDeleteCard(c.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  <RichContent text={c.front_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                </div>
                {showVn && (frontTranslations[c.id] || c.hint_vn) && (
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {frontTranslations[c.id] || c.hint_vn}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    <RichContent text={c.back_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                  </div>
                  {showVn && c.back_vn && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <RichContent text={c.back_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  Trạng thái: {status === 'mastered' ? 'Đã thuộc' : status === 'review' ? 'Tạm nhớ' : 'Chưa thuộc'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DECK INTERACTIVE VIEW */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-slate-500 dark:text-slate-400">
              Thẻ {safeIdx + 1} / {filteredCards.length}
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                progressMap[activeCard.id]?.status === 'mastered'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : progressMap[activeCard.id]?.status === 'review'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              {progressMap[activeCard.id]?.status === 'mastered'
                ? 'Đã thuộc'
                : progressMap[activeCard.id]?.status === 'review'
                ? 'Tạm nhớ'
                : 'Chưa thuộc'}
            </span>
          </div>

          {/* Interactive Flashcard Face */}
          <div
            onClick={() => setFlipped((f) => !f)}
            className="min-h-[290px] sm:min-h-[330px] bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-700 p-6 sm:p-8 shadow-md cursor-pointer transition-all flex flex-col justify-between gap-5"
          >
            {/* Card Top Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {activeCard.category || 'Fachbegriff'}
                </span>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {flipped ? 'Mặt sau · Đáp án' : 'Mặt trước · Câu hỏi'}
                </span>
              </div>

              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => speakGerman(flipped ? activeCard.back_de : activeCard.front_de, ttsRate)}
                  title="Nghe phát âm tiếng Đức"
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-950 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                {isAdmin && onDeleteCard && (
                  <button
                    type="button"
                    onClick={() => onDeleteCard(activeCard.id)}
                    title="Xóa thẻ này"
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Card Center Content */}
            {!flipped ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-3">
                {/* CLICKABLE GERMAN QUESTION/TERM */}
                <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug max-w-2xl">
                  <RichContent text={activeCard.front_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                </div>

                {/* VIETNAMESE TRANSLATION / HINT RIGHT ON FRONT FACE */}
                {showVn && showFrontVn && (
                  <div
                    className="max-w-xl w-full space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(frontTranslations[activeCard.id] || activeCard.hint_vn) ? (
                      <div className="inline-block px-4 py-2 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/80 text-xs sm:text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                        <RichContent
                          text={frontTranslations[activeCard.id] || activeCard.hint_vn}
                          mixedGerman
                          dictMode={dictMode}
                          onWordClick={onWordClick}
                        />
                      </div>
                    ) : null}

                    {/* Nút dịch đầy đủ câu hỏi bằng AI nếu thẻ cũ chưa có bản dịch rõ ràng */}
                    {!frontTranslations[activeCard.id] && (
                      <div>
                        <button
                          type="button"
                          disabled={translatingCardId === activeCard.id}
                          onClick={(e) => handleTranslateFront(activeCard, e)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 bg-slate-100/80 dark:bg-slate-800/70 transition"
                        >
                          {translatingCardId === activeCard.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" /> Đang dịch câu hỏi...
                            </>
                          ) : (
                            <>
                              <Languages className="w-3 h-3" />
                              {activeCard.hint_vn ? 'Dịch sát nghĩa cả câu tiếng Đức' : 'Dịch câu hỏi sang tiếng Việt'}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center space-y-4 py-2">
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                  <RichContent text={activeCard.back_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                </div>

                {showVn && activeCard.back_vn && (
                  <div className="bg-indigo-50/60 dark:bg-indigo-950/40 border-l-4 border-indigo-500 rounded-r-2xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                    <RichContent text={activeCard.back_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                  </div>
                )}

                {(activeCard.example_de || activeCard.example_vn) && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Ví dụ thực tế (Beispiel)
                    </span>
                    {activeCard.example_de && (
                      <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                        <RichContent text={activeCard.example_de} isGerman dictMode={dictMode} onWordClick={onWordClick} />
                      </div>
                    )}
                    {showVn && activeCard.example_vn && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                        <RichContent text={activeCard.example_vn} mixedGerman dictMode={dictMode} onWordClick={onWordClick} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Card Footer Hint */}
            <div className="text-center text-[11px] text-slate-400 font-medium">
              Bấm khoảng trống trên thẻ hoặc nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">Space</kbd> để lật · Bấm trực tiếp từng từ tiếng Đức để tra từ điển
            </div>
          </div>

          {/* Bottom Nav & SRS Rating Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCurrentIdx((i) => (i - 1 + filteredCards.length) % filteredCards.length)
                }
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400"
                title="Thẻ trước (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-xs font-bold"
              >
                <RotateCw className="w-3.5 h-3.5" /> Lật thẻ
              </button>
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => (i + 1) % filteredCards.length)}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400"
                title="Thẻ sau (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleRate('learning')}
                className="px-4 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-center transition"
              >
                <div className="text-xs font-extrabold">1. Quên</div>
                <div className="text-[10px] text-rose-100">Ôn ngay</div>
              </button>
              <button
                type="button"
                onClick={() => handleRate('review')}
                className="px-4 py-2.5 rounded-xl bg-amber-600/90 hover:bg-amber-600 text-white text-center transition"
              >
                <div className="text-xs font-extrabold">2. Tạm nhớ</div>
                <div className="text-[10px] text-amber-100">Hẹn 1 ngày</div>
              </button>
              <button
                type="button"
                onClick={() => handleRate('mastered')}
                className="px-4 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white text-center transition"
              >
                <div className="text-xs font-extrabold">3. Đã thuộc</div>
                <div className="text-[10px] text-emerald-100">Hẹn 3+ ngày</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

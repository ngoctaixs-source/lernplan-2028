import React, { useState, useEffect, useMemo } from 'react';
import {
  Volume2,
  Shuffle,
  List,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Trash2,
} from 'lucide-react';
import { speakGerman } from '../lib/tts';

const STATUS_META = {
  new: { label: 'Chưa thuộc', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  learning: { label: 'Tạm nhớ', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  mastered: { label: 'Đã thuộc', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function FlashcardDeck({
  cards,
  progressMap,
  onSetMastery,
  showVn,
  ttsRate,
  isAdmin,
  onGenerateMoreCards,
  onAddManualCard,
  onDeleteCard,
  subjectMap = {},
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'due' | 'mastered'
  const [viewMode, setViewMode] = useState('deck'); // 'deck' | 'list'
  const [orderedIds, setOrderedIds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCard, setNewCard] = useState({
    category: 'Fachbegriff',
    front_de: '',
    hint_vn: '',
    back_de: '',
    back_vn: '',
    example_de: '',
    example_vn: '',
  });

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      const st = progressMap[c.id] || 'new';
      if (filter === 'due') return st !== 'mastered';
      if (filter === 'mastered') return st === 'mastered';
      return true;
    });
  }, [cards, progressMap, filter]);

  useEffect(() => {
    setOrderedIds(filteredCards.map((c) => c.id));
    setCurrentIndex(0);
    setFlipped(false);
    setShowHint(false);
  }, [filter, cards.length]);

  const deckCards = useMemo(() => {
    const map = new Map(filteredCards.map((c) => [c.id, c]));
    const arranged = orderedIds.map((id) => map.get(id)).filter(Boolean);
    const arrangedSet = new Set(arranged.map((c) => c.id));
    filteredCards.forEach((c) => {
      if (!arrangedSet.has(c.id)) arranged.push(c);
    });
    return arranged;
  }, [filteredCards, orderedIds]);

  const currentCard = deckCards[currentIndex] || null;

  const masteredCount = cards.filter((c) => progressMap[c.id] === 'mastered').length;
  const dueCount = cards.length - masteredCount;
  const pct = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;

  const goNext = () => {
    if (!deckCards.length) return;
    setFlipped(false);
    setShowHint(false);
    setCurrentIndex((prev) => (prev + 1) % deckCards.length);
  };

  const goPrev = () => {
    if (!deckCards.length) return;
    setFlipped(false);
    setShowHint(false);
    setCurrentIndex((prev) => (prev - 1 + deckCards.length) % deckCards.length);
  };

  const handleShuffle = () => {
    const ids = [...deckCards.map((c) => c.id)];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrderedIds(ids);
    setCurrentIndex(0);
    setFlipped(false);
    setShowHint(false);
  };

  const handleRate = (status) => {
    if (!currentCard) return;
    onSetMastery(currentCard.id, status);
    if (deckCards.length > 1) {
      setTimeout(() => {
        setFlipped(false);
        setShowHint(false);
        setCurrentIndex((prev) => (prev + 1) % deckCards.length);
      }, 150);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (viewMode !== 'deck' || showAddForm) return;
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === '1') {
        handleRate('new');
      } else if (e.key === '2') {
        handleRate('learning');
      } else if (e.key === '3') {
        handleRate('mastered');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleAiGenerate = async () => {
    if (!onGenerateMoreCards) return;
    setGenerating(true);
    try {
      await onGenerateMoreCards();
    } finally {
      setGenerating(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!newCard.front_de.trim() || !newCard.back_de.trim()) return;
    await onAddManualCard?.(newCard);
    setNewCard({
      category: 'Fachbegriff',
      front_de: '',
      hint_vn: '',
      back_de: '',
      back_vn: '',
      example_de: '',
      example_vn: '',
    });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Progress & Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <span>Tiến độ ghi nhớ: {masteredCount}/{cards.length} thẻ ({pct}%)</span>
            </div>
            <div className="w-56 sm:w-72 h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {[
                { id: 'all', label: `Tất cả (${cards.length})` },
                { id: 'due', label: `Cần ôn (${dueCount})` },
                { id: 'mastered', label: `Đã thuộc (${masteredCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg transition ${
                    filter === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleShuffle}
              title="Trộn thẻ"
              className="p-2 text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 rounded-xl transition"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'deck' ? 'list' : 'deck')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              {viewMode === 'deck' ? <List className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              {viewMode === 'deck' ? 'Danh sách' : 'Thẻ 3D'}
            </button>
          </div>
        </div>

        {/* Admin Actions */}
        {isAdmin && (onGenerateMoreCards || onAddManualCard) && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            {onGenerateMoreCards && (
              <button
                onClick={handleAiGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                + Tạo thêm 4 thẻ bằng AI
              </button>
            )}
            {onAddManualCard && (
              <button
                onClick={() => setShowAddForm((s) => !s)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Tự thêm thẻ mới
              </button>
            )}
          </div>
        )}

        {/* Manual Add Card Form */}
        {showAddForm && (
          <form onSubmit={handleManualSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phân loại</label>
                <select
                  value={newCard.category}
                  onChange={(e) => setNewCard({ ...newCard, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Fachbegriff">Fachbegriff (Thuật ngữ)</option>
                  <option value="Recht">Recht (Luật / Điều khoản)</option>
                  <option value="Formel">Formel (Công thức)</option>
                  <option value="Praxis">Praxis (Thực tế)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gợi ý tiếng Việt (mặt trước)</label>
                <input
                  value={newCard.hint_vn}
                  onChange={(e) => setNewCard({ ...newCard, hint_vn: e.target.value })}
                  placeholder="VD: Hợp đồng chế tác"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mặt trước (Thuật ngữ / Câu hỏi tiếng Đức) *</label>
                <input
                  required
                  value={newCard.front_de}
                  onChange={(e) => setNewCard({ ...newCard, front_de: e.target.value })}
                  placeholder="VD: Werkvertrag (§ 631 BGB)"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Đáp án chuẩn IHK (Tiếng Đức) *</label>
                <textarea
                  required
                  rows={2}
                  value={newCard.back_de}
                  onChange={(e) => setNewCard({ ...newCard, back_de: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bản dịch tiếng Việt *</label>
                <textarea
                  required
                  rows={2}
                  value={newCard.back_vn}
                  onChange={(e) => setNewCard({ ...newCard, back_vn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ví dụ tiếng Đức</label>
                <input
                  value={newCard.example_de}
                  onChange={(e) => setNewCard({ ...newCard, example_de: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ví dụ tiếng Việt</label>
                <input
                  value={newCard.example_vn}
                  onChange={(e) => setNewCard({ ...newCard, example_vn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Lưu thẻ
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Empty state */}
      {deckCards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-800">
            {filter === 'due' ? 'Tuyệt vời! Bạn đã thuộc hết toàn bộ thẻ trong nhóm này.' : 'Chưa có thẻ Flashcard nào.'}
          </p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="mt-3 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-xl hover:bg-indigo-100"
            >
              Xem lại tất cả thẻ
            </button>
          )}
        </div>
      ) : viewMode === 'deck' ? (
        /* 3D FLIP CARD VIEW */
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Thẻ <strong>{currentIndex + 1}</strong> / {deckCards.length}
              {subjectMap[currentCard.subject_id] && (
                <span className="ml-2 text-indigo-600 font-medium">· {subjectMap[currentCard.subject_id]}</span>
              )}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full border font-semibold ${STATUS_META[progressMap[currentCard.id] || 'new'].cls}`}>
              {STATUS_META[progressMap[currentCard.id] || 'new'].label}
            </span>
          </div>

          {/* 3D Card Container */}
          <div
            onClick={() => setFlipped((f) => !f)}
            className="perspective-1000 cursor-pointer select-none"
          >
            <div
              className={`relative w-full min-h-[340px] sm:min-h-[360px] transition-transform duration-500 transform-style-3d ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* FRONT */}
              <div className="absolute inset-0 backface-hidden bg-white rounded-3xl border-2 border-slate-200 shadow-sm hover:border-indigo-300 transition p-6 sm:p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {currentCard.category || 'Fachbegriff'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakGerman(currentCard.front_de, ttsRate);
                    }}
                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 transition"
                    title="Nghe phát âm tiếng Đức"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-center my-auto py-4 space-y-4">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug">
                    {currentCard.front_de}
                  </h3>
                  {currentCard.hint_vn && (
                    <div>
                      {showHint ? (
                        <span className="inline-block px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
                          Gợi ý VN: {currentCard.hint_vn}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowHint(true);
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 underline underline-offset-4"
                        >
                          Xem gợi ý tiếng Việt
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center text-xs text-slate-400 font-medium">
                  Bấm vào thẻ hoặc nhấn <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">Space</kbd> để lật xem đáp án IHK
                </div>
              </div>

              {/* BACK */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 text-white rounded-3xl border-2 border-indigo-500/40 shadow-lg p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                    IHK-Definition & Bản dịch
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakGerman(currentCard.back_de, ttsRate);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                    title="Nghe đáp án tiếng Đức"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 my-auto py-3">
                  <p className="text-base sm:text-lg font-medium leading-relaxed text-white">
                    {currentCard.back_de}
                  </p>
                  {showVn && currentCard.back_vn && (
                    <div className="bg-white/10 border-l-2 border-indigo-400 rounded-r-xl px-4 py-3 text-sm text-indigo-100 leading-relaxed">
                      {currentCard.back_vn}
                    </div>
                  )}
                  {(currentCard.example_de || currentCard.example_vn) && (
                    <div className="bg-emerald-500/15 border border-emerald-400/30 rounded-xl px-4 py-2.5 text-xs space-y-1">
                      <p className="text-emerald-200 font-semibold">Praxisbeispiel:</p>
                      {currentCard.example_de && <p className="text-white/95">{currentCard.example_de}</p>}
                      {showVn && currentCard.example_vn && (
                        <p className="text-emerald-100/80 italic">{currentCard.example_vn}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center text-xs text-slate-400">
                  Đánh giá mức độ ghi nhớ bên dưới (phím 1 · 2 · 3)
                </div>
              </div>
            </div>
          </div>

          {/* Rating & Navigation Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                title="Thẻ trước (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setFlipped((f) => !f)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Lật thẻ
              </button>
              <button
                onClick={goNext}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                title="Thẻ tiếp (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleRate('new')}
                className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition"
              >
                1. Chưa thuộc
              </button>
              <button
                onClick={() => handleRate('learning')}
                className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold transition"
              >
                2. Tạm nhớ
              </button>
              <button
                onClick={() => handleRate('mastered')}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
              >
                3. Đã thuộc
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* LIST VIEW */
        <div className="grid grid-cols-1 gap-3">
          {deckCards.map((card) => {
            const st = progressMap[card.id] || 'new';
            return (
              <div key={card.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                      {card.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-base">{card.front_de}</h4>
                    <button
                      onClick={() => speakGerman(card.front_de, ttsRate)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={st}
                      onChange={(e) => onSetMastery(card.id, e.target.value)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_META[st].cls}`}
                    >
                      <option value="new">Chưa thuộc</option>
                      <option value="learning">Tạm nhớ</option>
                      <option value="mastered">Đã thuộc</option>
                    </select>
                    {isAdmin && onDeleteCard && (
                      <button
                        onClick={() => onDeleteCard(card.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        title="Xóa thẻ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{card.back_de}</p>
                {showVn && card.back_vn && (
                  <p className="text-sm text-slate-600 bg-slate-50 border-l-2 border-indigo-400 px-3 py-2 rounded-r-lg">
                    {card.back_vn}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

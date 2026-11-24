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
  Clock,
} from 'lucide-react';
import { speakGerman } from '../lib/tts';
import { isCardDue } from '../lib/seedData';
import RichContent from './RichContent';

const STATUS_META = {
  new: { label: 'Chưa thuộc', cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
  learning: { label: 'Tạm nhớ', cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  mastered: { label: 'Đã thuộc', cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
};

export default function FlashcardDeck({
  cards,
  progressMap, // { [id]: { status, interval_days, next_review_at, repetitions, ease_factor } }
  onSetMastery,
  showVn,
  ttsRate,
  dictMode,
  onWordClick,
  isAdmin,
  onGenerateMoreCards,
  onAddManualCard,
  onDeleteCard,
  subjectMap = {},
}) {
  const [filter, setFilter] = useState('due'); // 'due' | 'all' | 'mastered'
  const [viewMode, setViewMode] = useState('deck');
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

  const getRec = (id) => progressMap[id] || { status: 'new', interval_days: 0, repetitions: 0 };

  // Smart Anki sort: 'new' first -> 'learning' -> overdue 'mastered'
  const filteredCards = useMemo(() => {
    const list = cards.filter((c) => {
      const rec = getRec(c.id);
      if (filter === 'due') return isCardDue(rec);
      if (filter === 'mastered') return rec.status === 'mastered';
      return true;
    });
    const priority = { new: 0, learning: 1, mastered: 2 };
    return [...list].sort((a, b) => (priority[getRec(a.id).status] ?? 0) - (priority[getRec(b.id).status] ?? 0));
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
  const currentRec = currentCard ? getRec(currentCard.id) : null;

  const masteredCount = cards.filter((c) => getRec(c.id).status === 'mastered').length;
  const dueCount = cards.filter((c) => isCardDue(getRec(c.id))).length;
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

  const nextMasteredDays = currentRec?.repetitions >= 2 ? '14+ ngày' : currentRec?.repetitions === 1 ? '7 ngày' : '3 ngày';

  return (
    <div className="space-y-5">
      {/* Progress & Controls Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <span>Lặp lại ngắt quãng (SRS kiểu Anki): {masteredCount}/{cards.length} thẻ ({pct}%)</span>
            </div>
            <div className="w-56 sm:w-72 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {[
                { id: 'due', label: `Cần ôn hôm nay (${dueCount})` },
                { id: 'all', label: `Tất cả (${cards.length})` },
                { id: 'mastered', label: `Đã thuộc (${masteredCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg transition ${
                    filter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleShuffle}
              title="Trộn thẻ"
              className="p-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-xl transition"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'deck' ? 'list' : 'deck')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
            >
              {viewMode === 'deck' ? <List className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              {viewMode === 'deck' ? 'Danh sách' : 'Thẻ 3D'}
            </button>
          </div>
        </div>

        {isAdmin && (onGenerateMoreCards || onAddManualCard) && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            {onGenerateMoreCards && (
              <button
                onClick={handleAiGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl transition disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                + Tạo thêm 5 thẻ bằng AI
              </button>
            )}
            {onAddManualCard && (
              <button
                onClick={() => setShowAddForm((s) => !s)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Tự thêm thẻ mới
              </button>
            )}
          </div>
        )}

        {showAddForm && (
          <form
            onSubmit={handleManualSubmit}
            className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phân loại</label>
                <select
                  value={newCard.category}
                  onChange={(e) => setNewCard({ ...newCard, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="Fachbegriff">Fachbegriff</option>
                  <option value="Recht">Recht</option>
                  <option value="Formel">Formel</option>
                  <option value="Praxis">Praxis</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Gợi ý VN</label>
                <input
                  value={newCard.hint_vn}
                  onChange={(e) => setNewCard({ ...newCard, hint_vn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mặt trước (Tiếng Đức) *</label>
                <input
                  required
                  value={newCard.front_de}
                  onChange={(e) => setNewCard({ ...newCard, front_de: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Đáp án IHK (Đức) *</label>
                <textarea
                  required
                  rows={2}
                  value={newCard.back_de}
                  onChange={(e) => setNewCard({ ...newCard, back_de: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Bản dịch Việt *</label>
                <textarea
                  required
                  rows={2}
                  value={newCard.back_vn}
                  onChange={(e) => setNewCard({ ...newCard, back_vn: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-slate-500">
                Hủy
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg">
                Lưu thẻ
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Deck or Empty */}
      {deckCards.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-base font-bold text-slate-800 dark:text-white">
            {filter === 'due' ? 'Xuất sắc! Hôm nay bạn đã ôn hết toàn bộ thẻ đến hạn.' : 'Chưa có thẻ Flashcard nào.'}
          </p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              className="px-4 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 rounded-xl"
            >
              Ôn lại toàn bộ ({cards.length} thẻ)
            </button>
          )}
        </div>
      ) : viewMode === 'deck' ? (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>
              Thẻ <strong>{currentIndex + 1}</strong> / {deckCards.length}
              {subjectMap[currentCard.subject_id] && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-medium">· {subjectMap[currentCard.subject_id]}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {currentRec?.interval_days > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="w-3 h-3" /> Chu kỳ: {currentRec.interval_days} ngày
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full border font-semibold ${STATUS_META[currentRec.status || 'new'].cls}`}>
                {STATUS_META[currentRec.status || 'new'].label}
              </span>
            </div>
          </div>

          <div onClick={() => setFlipped((f) => !f)} className="perspective-1000 cursor-pointer select-none">
            <div
              className={`relative w-full min-h-[340px] sm:min-h-[370px] transition-transform duration-500 transform-style-3d ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* FRONT */}
              <div className="absolute inset-0 backface-hidden bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 shadow-sm hover:border-indigo-400 transition p-6 sm:p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                    {currentCard.category || 'Fachbegriff'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakGerman(currentCard.front_de, ttsRate);
                    }}
                    className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 text-slate-700 dark:text-slate-200 transition"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-center my-auto py-4 space-y-4">
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug">
                    {currentCard.front_de}
                  </h3>
                  {currentCard.hint_vn && (
                    <div>
                      {showHint ? (
                        <span className="inline-block px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm font-medium">
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
                  Bấm vào thẻ hoặc nhấn <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Space</kbd> để lật
                </div>
              </div>

              {/* BACK */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 dark:bg-slate-950 text-white rounded-3xl border-2 border-indigo-500/50 shadow-lg p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">IHK-Definition & Bản dịch</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakGerman(currentCard.back_de, ttsRate);
                    }}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 my-auto py-3" onClick={(e) => dictMode && e.stopPropagation()}>
                  <div className="text-base sm:text-lg font-medium leading-relaxed text-white">
                    <RichContent
                      text={currentCard.back_de}
                      isGerman
                      dictMode={dictMode}
                      onWordClick={onWordClick}
                    />
                  </div>
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

                <div className="text-center text-xs text-slate-400">Đánh giá SRS bên dưới (phím 1 · 2 · 3)</div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setFlipped((f) => !f)}
                className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Lật thẻ
              </button>
              <button
                onClick={goNext}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleRate('new')}
                className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold transition text-center"
              >
                <div>1. Quên</div>
                <div className="text-[10px] opacity-75">Ôn ngay</div>
              </button>
              <button
                onClick={() => handleRate('learning')}
                className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold transition text-center"
              >
                <div>2. Tạm nhớ</div>
                <div className="text-[10px] opacity-75">Hẹn 1 ngày</div>
              </button>
              <button
                onClick={() => handleRate('mastered')}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition text-center"
              >
                <div>3. Đã thuộc</div>
                <div className="text-[10px] text-emerald-100">Hẹn {nextMasteredDays}</div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {deckCards.map((card) => {
            const rec = getRec(card.id);
            return (
              <div
                key={card.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {card.category}
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base">{card.front_de}</h4>
                    <button onClick={() => speakGerman(card.front_de, ttsRate)} className="p-1.5 text-slate-400 hover:text-indigo-600">
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={rec.status}
                      onChange={(e) => onSetMastery(card.id, e.target.value)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_META[rec.status].cls}`}
                    >
                      <option value="new">Chưa thuộc</option>
                      <option value="learning">Tạm nhớ</option>
                      <option value="mastered">Đã thuộc</option>
                    </select>
                    {isAdmin && onDeleteCard && (
                      <button onClick={() => onDeleteCard(card.id)} className="p-1.5 text-slate-400 hover:text-rose-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <RichContent
                  text={card.back_de}
                  isGerman
                  dictMode={dictMode}
                  onWordClick={onWordClick}
                  className="text-sm text-slate-800 dark:text-slate-200"
                />
                {showVn && card.back_vn && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-l-4 border-indigo-400 px-3 py-2 rounded-r-lg">
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

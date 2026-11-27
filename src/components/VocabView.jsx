import React, { useState, useMemo } from 'react';
import {
  Search,
  Volume2,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  BookOpen,
  ExternalLink,
  X,
  Globe,
  Check,
  AlertCircle,
  BookMarked,
} from 'lucide-react';
import { speakGerman } from '../lib/tts';
import RichContent from './RichContent';

function getArticleColor(article = '') {
  const a = String(article || '').trim().toLowerCase();
  if (a === 'der') return 'text-sky-600 dark:text-sky-400';
  if (a === 'die') return 'text-rose-600 dark:text-rose-400';
  if (a === 'das') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-500 dark:text-slate-400';
}

export default function VocabView({
  vocabularies = [],
  subjects = [],
  lessons = [],
  dictCache = {},
  ttsRate = 1.0,
  isAdmin = false,
  isLessonScoped = false,
  onGenerateMoreVocab = null,
  onAddManualVocab = null,
  onDeleteVocab = null,
  onOpenLesson = null,
  onLookupDictionary = null,
  onWordClick = null,
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [includeCachedDict, setIncludeCachedDict] = useState(true);

  // Tra từ điển Đức–Việt / Việt–Đức trực tiếp (mọi từ ngoài bài học!)
  const [liveLookup, setLiveLookup] = useState(null); // null | { query, loading, data, error, saved }

  // Admin actions
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingWord, setSavingWord] = useState(false);
  const [draft, setDraft] = useState({
    article: 'der',
    word_de: '',
    plural: '',
    word_type: 'Nomen',
    meaning_vn: '',
    example_de: '',
    example_vn: '',
    grammar_note_vn: '',
  });

  const lessonMap = useMemo(() => {
    const m = {};
    (lessons || []).forEach((l) => (m[l.id] = l));
    return m;
  }, [lessons]);

  const wordTypes = useMemo(() => {
    const s = new Set();
    vocabularies.forEach((v) => {
      if (v.word_type) s.add(v.word_type);
    });
    return Array.from(s);
  }, [vocabularies]);

  // Lọc kho từ vựng IHK (từ các bài học)
  const filteredVocabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vocabularies.filter((v) => {
      if (typeFilter !== 'all' && v.word_type !== typeFilter) return false;
      if (!isLessonScoped && subjectFilter !== 'all' && v.subject_id !== subjectFilter) return false;
      if (!q) return true;
      return (
        (v.word_de || '').toLowerCase().includes(q) ||
        (v.meaning_vn || '').toLowerCase().includes(q) ||
        (v.plural || '').toLowerCase().includes(q) ||
        (v.example_de || '').toLowerCase().includes(q)
      );
    });
  }, [vocabularies, search, typeFilter, subjectFilter, isLessonScoped]);

  // Lọc thêm trong kho Từ điển đã từng tra (dictCache - 0ms!) khi có gõ tìm kiếm (ở trang Từ vựng tổng)
  const matchingCachedWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isLessonScoped || !includeCachedDict || !q || q.length < 2) return [];
    const existingSet = new Set(vocabularies.map((v) => (v.word_de || '').trim().toLowerCase()));
    const seen = new Set();
    const out = [];
    Object.values(dictCache || {}).forEach((entry) => {
      if (!entry || !entry.lemma_de) return;
      const lemmaKey = String(entry.lemma_de).trim().toLowerCase();
      if (existingSet.has(lemmaKey) || seen.has(lemmaKey)) return;
      if (
        lemmaKey.includes(q) ||
        (entry.word_key || '').toLowerCase().includes(q) ||
        (entry.meaning_vn || '').toLowerCase().includes(q)
      ) {
        seen.add(lemmaKey);
        out.push(entry);
      }
    });
    return out.slice(0, 12);
  }, [dictCache, vocabularies, search, isLessonScoped, includeCachedDict]);

  const handleRunLiveDictionary = async (overrideQuery = null) => {
    const q = String(overrideQuery !== null ? overrideQuery : search).trim();
    if (!q || !onLookupDictionary) return;
    setLiveLookup({ query: q, loading: true, data: null, error: '', saved: false });
    try {
      const entry = await onLookupDictionary(q);
      setLiveLookup({ query: q, loading: false, data: entry, error: '', saved: false });
    } catch (err) {
      setLiveLookup({
        query: q,
        loading: false,
        data: null,
        error: err.message || 'Không tra được từ này lúc này.',
        saved: false,
      });
    }
  };

  const handleSaveLiveEntry = async (entry) => {
    if (!isAdmin || !onAddManualVocab || !entry) return;
    await onAddManualVocab({
      word_de: entry.lemma_de || liveLookup?.query || '',
      article: entry.article || '',
      plural: entry.plural || '',
      word_type: entry.word_type || 'Nomen',
      meaning_vn: entry.meaning_vn || '',
      example_de: entry.example_de || '',
      example_vn: entry.example_vn || '',
      grammar_note_vn: entry.grammar_note_vn || '',
    });
    setLiveLookup((prev) => (prev ? { ...prev, saved: true } : null));
  };

  const handleGenerate = async () => {
    if (!onGenerateMoreVocab || generating) return;
    setGenerating(true);
    try {
      await onGenerateMoreVocab();
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    if (!draft.word_de.trim() || !draft.meaning_vn.trim() || !onAddManualVocab) return;
    setSavingWord(true);
    try {
      await onAddManualVocab(draft);
      setDraft({
        article: 'der',
        word_de: '',
        plural: '',
        word_type: 'Nomen',
        meaning_vn: '',
        example_de: '',
        example_vn: '',
        grammar_note_vn: '',
      });
      setShowAddForm(false);
    } finally {
      setSavingWord(false);
    }
  };

  const cachedTotalCount = useMemo(() => {
    const s = new Set();
    Object.values(dictCache || {}).forEach((e) => {
      if (e?.lemma_de) s.add(String(e.lemma_de).toLowerCase());
    });
    return s.size;
  }, [dictCache]);

  return (
    <div className="space-y-5">
      {/* Header + Real Dictionary Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              {isLessonScoped
                ? `Từ vựng bài học (${vocabularies.length})`
                : `Từ điển Đức–Việt & Từ vựng IHK (${vocabularies.length} từ bài học${
                    cachedTotalCount > 0 ? ` · ${cachedTotalCount} từ đã tra` : ''
                  })`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phân màu giống danh từ:{' '}
              <strong className="text-sky-600 dark:text-sky-400">der</strong> ·{' '}
              <strong className="text-rose-600 dark:text-rose-400">die</strong> ·{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">das</strong> — gõ bất kỳ từ tiếng Đức hoặc tiếng Việt nào rồi nhấn{' '}
              <strong>Enter</strong> để tra từ điển đầy đủ!
            </p>
          </div>

          {isAdmin && isLessonScoped && (
            <div className="flex flex-wrap items-center gap-2">
              {onGenerateMoreVocab && (
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  + Trích thêm từ bằng AI
                </button>
              )}
              {onAddManualVocab && (
                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" /> Tự thêm từ
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search & Dictionary Lookup Row */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value.trim()) setLiveLookup(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim() && onLookupDictionary) {
                  e.preventDefault();
                  handleRunLiveDictionary();
                }
              }}
              placeholder="Gõ từ tiếng Đức HOẶC tiếng Việt để lọc & nhấn Enter tra từ điển đầy đủ..."
              className="w-full pl-10 pr-8 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setLiveLookup(null);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {onLookupDictionary && (
            <button
              type="button"
              disabled={!search.trim() || liveLookup?.loading}
              onClick={() => handleRunLiveDictionary()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-extrabold shadow-sm inline-flex items-center justify-center gap-1.5 shrink-0 transition"
            >
              {liveLookup?.loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
              Tra từ điển Đ–V
            </button>
          )}

          {wordTypes.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="all">Tất cả loại từ ({wordTypes.length})</option>
              {wordTypes.map((wt) => (
                <option key={wt} value={wt}>
                  {wt}
                </option>
              ))}
            </select>
          )}

          {!isLessonScoped && subjects.length > 0 && (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-2.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl max-w-[200px]"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title_de}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* LIVE DICTIONARY RESULT CARD (TRA BẤT KỲ TỪ ĐỨC / VIỆT NÀO NHƯ TỪ ĐIỂN THẬT!) */}
        {liveLookup && (
          <div className="rounded-2xl border-2 border-indigo-400 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/40 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                <Globe className="w-3.5 h-3.5" /> Kết quả Từ điển Đức–Việt cho &ldquo;{liveLookup.query}&rdquo;
              </span>
              <button
                type="button"
                onClick={() => setLiveLookup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {liveLookup.loading ? (
              <div className="py-4 flex items-center gap-2.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tra từ điển Đức–Việt (~0.3s)...
              </div>
            ) : liveLookup.error ? (
              <div className="text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {liveLookup.error}
              </div>
            ) : liveLookup.data ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {liveLookup.data.article && (
                        <span className={`text-base sm:text-lg font-black ${getArticleColor(liveLookup.data.article)}`}>
                          {liveLookup.data.article}
                        </span>
                      )}
                      <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                        {liveLookup.data.lemma_de || liveLookup.query}
                      </span>
                      {liveLookup.data.plural && (
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          (Pl.: {liveLookup.data.plural})
                        </span>
                      )}
                      {liveLookup.data.word_type && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300">
                          {liveLookup.data.word_type}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300">
                      {liveLookup.data.meaning_vn}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        speakGerman(
                          `${liveLookup.data.article ? `${liveLookup.data.article} ` : ''}${liveLookup.data.lemma_de || liveLookup.query}`,
                          ttsRate
                        )
                      }
                      className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100"
                      title="Nghe phát âm tiếng Đức"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    {isAdmin && isLessonScoped && onAddManualVocab && (
                      <button
                        type="button"
                        disabled={liveLookup.saved}
                        onClick={() => handleSaveLiveEntry(liveLookup.data)}
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition ${
                          liveLookup.saved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {liveLookup.saved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {liveLookup.saved ? 'Đã lưu vào bài' : 'Lưu vào bài'}
                      </button>
                    )}
                  </div>
                </div>

                {liveLookup.data.grammar_note_vn && (
                  <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 rounded-xl px-3 py-2">
                    <strong>Ngữ pháp / Ghi chú:</strong> {liveLookup.data.grammar_note_vn}
                  </p>
                )}

                {liveLookup.data.example_de && (
                  <div className="bg-white/90 dark:bg-slate-900/80 rounded-xl px-3.5 py-2.5 border border-slate-200/80 dark:border-slate-700 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
                        <RichContent
                          text={liveLookup.data.example_de}
                          isGerman
                          dictMode={Boolean(onWordClick)}
                          onWordClick={onWordClick}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => speakGerman(liveLookup.data.example_de, ttsRate)}
                        className="p-1 text-slate-400 hover:text-indigo-600 shrink-0"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {liveLookup.data.example_vn && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">{liveLookup.data.example_vn}</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Admin Manual Add Word Form */}
        {isAdmin && showAddForm && (
          <form
            onSubmit={handleSubmitManual}
            className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-indigo-600">Thêm từ vựng mới</span>
              <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={draft.article}
                onChange={(e) => setDraft({ ...draft, article: e.target.value })}
                className="sm:col-span-2 px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold"
              >
                <option value="der">der</option>
                <option value="die">die</option>
                <option value="das">das</option>
                <option value="">(Không)</option>
              </select>
              <input
                value={draft.word_de}
                onChange={(e) => setDraft({ ...draft, word_de: e.target.value })}
                placeholder="Từ tiếng Đức *"
                className="sm:col-span-4 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                required
              />
              <input
                value={draft.plural}
                onChange={(e) => setDraft({ ...draft, plural: e.target.value })}
                placeholder="Số nhiều (die ...)"
                className="sm:col-span-3 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <input
                value={draft.word_type}
                onChange={(e) => setDraft({ ...draft, word_type: e.target.value })}
                placeholder="Loại từ (Nomen/Verb)"
                className="sm:col-span-3 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <input
                value={draft.meaning_vn}
                onChange={(e) => setDraft({ ...draft, meaning_vn: e.target.value })}
                placeholder="Nghĩa tiếng Việt *"
                className="sm:col-span-6 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                required
              />
              <input
                value={draft.grammar_note_vn}
                onChange={(e) => setDraft({ ...draft, grammar_note_vn: e.target.value })}
                placeholder="Ghi chú ngữ pháp / mẹo nhớ"
                className="sm:col-span-6 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <input
                value={draft.example_de}
                onChange={(e) => setDraft({ ...draft, example_de: e.target.value })}
                placeholder="Ví dụ tiếng Đức"
                className="sm:col-span-6 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
              <input
                value={draft.example_vn}
                onChange={(e) => setDraft({ ...draft, example_vn: e.target.value })}
                placeholder="Dịch ví dụ tiếng Việt"
                className="sm:col-span-6 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingWord}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
              >
                {savingWord ? 'Đang lưu...' : 'Lưu từ vựng'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Matching Previously Looked-up Words from Real Dictionary Cache */}
      {matchingCachedWords.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Từ ngoài bài học đã tra trong Từ điển ({matchingCachedWords.length})
            </h3>
            <button
              type="button"
              onClick={() => setIncludeCachedDict(false)}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              Ẩn
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {matchingCachedWords.map((entry, idx) => (
              <div
                key={`${entry.lemma_de}-${idx}`}
                className="bg-indigo-50/40 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      {entry.article && (
                        <span className={`text-sm font-black ${getArticleColor(entry.article)}`}>{entry.article}</span>
                      )}
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">{entry.lemma_de}</span>
                      {entry.plural && <span className="text-xs text-slate-400">({entry.plural})</span>}
                    </div>
                    <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">{entry.meaning_vn}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakGerman(`${entry.article ? `${entry.article} ` : ''}${entry.lemma_de}`, ttsRate)}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 shrink-0"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                {entry.example_de && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {entry.example_de}
                    {entry.example_vn ? <span className="block text-slate-400 italic mt-0.5">{entry.example_vn}</span> : null}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lesson / Curriculum Vocabulary Cards */}
      {filteredVocabs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {search.trim()
              ? `Không có từ "${search.trim()}" trong danh sách từ trích từ bài học.`
              : 'Chưa có từ vựng nào.'}
          </p>
          {search.trim() && onLookupDictionary && !liveLookup && (
            <button
              type="button"
              onClick={() => handleRunLiveDictionary()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm"
            >
              <Globe className="w-4 h-4" /> Tra &ldquo;{search.trim()}&rdquo; ngay trong Từ điển Đức–Việt
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredVocabs.map((v) => {
            const srcLesson = v.lesson_id ? lessonMap[v.lesson_id] : null;
            return (
              <div
                key={v.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      {v.article && (
                        <span className={`text-sm sm:text-base font-black ${getArticleColor(v.article)}`}>
                          {v.article}
                        </span>
                      )}
                      <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                        {v.word_de}
                      </span>
                      {v.plural && (
                        <span className="text-xs font-medium text-slate-400">({v.plural})</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{v.meaning_vn}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {v.word_type && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {v.word_type}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => speakGerman(`${v.article ? `${v.article} ` : ''}${v.word_de}`, ttsRate)}
                      title="Nghe phát âm tiếng Đức"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    {isAdmin && onDeleteVocab && (
                      <button
                        type="button"
                        onClick={() => onDeleteVocab(v.id)}
                        title="Xóa từ này"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {v.example_de && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2 text-xs space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-slate-800 dark:text-slate-100 font-medium">
                        <RichContent
                          text={v.example_de}
                          isGerman
                          dictMode={Boolean(onWordClick)}
                          onWordClick={onWordClick}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => speakGerman(v.example_de, ttsRate)}
                        className="p-0.5 text-slate-400 hover:text-indigo-600 shrink-0"
                        title="Nghe câu ví dụ"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {v.example_vn && (
                      <p className="text-slate-500 dark:text-slate-400 italic">{v.example_vn}</p>
                    )}
                  </div>
                )}

                {v.grammar_note_vn && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 rounded-lg px-2.5 py-1.5">
                    {v.grammar_note_vn}
                  </p>
                )}

                {!isLessonScoped && srcLesson && onOpenLesson && (
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 truncate max-w-[210px] inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3 shrink-0" /> {srcLesson.title_de}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenLesson(srcLesson.id)}
                      className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline inline-flex items-center gap-0.5 shrink-0"
                    >
                      Mở bài <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

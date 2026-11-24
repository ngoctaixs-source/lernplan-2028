import React, { useState, useMemo } from 'react';
import {
  Search,
  Volume2,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  BookMarked,
  ChevronRight,
} from 'lucide-react';
import { speakGerman } from '../lib/tts';
import { ARTICLE_STYLE } from '../lib/seedData';

export default function VocabView({
  vocabularies,
  subjects = [],
  lessons = [],
  ttsRate,
  isAdmin,
  isLessonScoped = false,
  onGenerateMoreVocab,
  onAddManualVocab,
  onDeleteVocab,
  onOpenLesson,
}) {
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [lessonFilter, setLessonFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    word_de: '',
    article: 'der',
    plural: '',
    word_type: 'Nomen',
    meaning_vn: '',
    example_de: '',
    example_vn: '',
    grammar_note_vn: '',
  });

  const subjectMap = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [subjects]);

  const lessonMap = useMemo(() => {
    const m = {};
    lessons.forEach((l) => {
      m[l.id] = l;
    });
    return m;
  }, [lessons]);

  const availableLessons = useMemo(() => {
    if (subjectFilter === 'all') return lessons;
    return lessons.filter((l) => l.subject_id === subjectFilter);
  }, [lessons, subjectFilter]);

  const wordTypes = useMemo(() => {
    const set = new Set(vocabularies.map((v) => v.word_type).filter(Boolean));
    return Array.from(set);
  }, [vocabularies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vocabularies.filter((v) => {
      if (!isLessonScoped && subjectFilter !== 'all' && v.subject_id !== subjectFilter) return false;
      if (!isLessonScoped && lessonFilter !== 'all' && v.lesson_id !== lessonFilter) return false;
      if (typeFilter !== 'all' && v.word_type !== typeFilter) return false;
      if (!q) return true;
      return (
        (v.word_de || '').toLowerCase().includes(q) ||
        (v.meaning_vn || '').toLowerCase().includes(q) ||
        (v.example_de || '').toLowerCase().includes(q) ||
        (v.article || '').toLowerCase().includes(q)
      );
    });
  }, [vocabularies, isLessonScoped, subjectFilter, lessonFilter, typeFilter, query]);

  // Group by subject -> lesson when global
  const grouped = useMemo(() => {
    if (isLessonScoped) return [{ key: 'single', items: filtered }];
    const groups = new Map();
    filtered.forEach((v) => {
      const key = `${v.subject_id || 'none'}::${v.lesson_id || 'none'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          subject: subjectMap[v.subject_id],
          lesson: lessonMap[v.lesson_id],
          items: [],
        });
      }
      groups.get(key).items.push(v);
    });
    return Array.from(groups.values());
  }, [filtered, isLessonScoped, subjectMap, lessonMap]);

  const handleGenerate = async () => {
    if (!onGenerateMoreVocab) return;
    setGenerating(true);
    try {
      await onGenerateMoreVocab();
    } finally {
      setGenerating(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!form.word_de.trim() || !form.meaning_vn.trim()) return;
    await onAddManualVocab?.({
      ...form,
      article: form.word_type === 'Nomen' ? form.article : '',
      plural: form.word_type === 'Nomen' ? form.plural : '',
    });
    setForm({
      word_de: '',
      article: 'der',
      plural: '',
      word_type: 'Nomen',
      meaning_vn: '',
      example_de: '',
      example_vn: '',
      grammar_note_vn: '',
    });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Header / Search / Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              {isLessonScoped ? `Từ vựng bài học (${vocabularies.length})` : `Từ điển chuyên ngành IHK (${vocabularies.length} từ)`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phân màu giống danh từ:{' '}
              <span className="font-bold text-sky-600 dark:text-sky-400">der</span> ·{' '}
              <span className="font-bold text-rose-600 dark:text-rose-400">die</span> ·{' '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">das</span> — kèm loại từ, số nhiều, ví dụ & phát âm chuẩn Đức
            </p>
          </div>

          {isAdmin && (onGenerateMoreVocab || onAddManualVocab) && (
            <div className="flex flex-wrap items-center gap-2">
              {onGenerateMoreVocab && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl transition disabled:opacity-60"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  + Trích thêm từ bằng AI
                </button>
              )}
              {onAddManualVocab && (
                <button
                  onClick={() => setShowAddForm((s) => !s)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tự thêm từ
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tra từ tiếng Đức hoặc nghĩa Việt..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {!isLessonScoped && (
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setLessonFilter('all');
              }}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="all">Tất cả môn học</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title_de}
                </option>
              ))}
            </select>
          )}

          {!isLessonScoped && (
            <select
              value={lessonFilter}
              onChange={(e) => setLessonFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="all">Tất cả các bài học</option>
              {availableLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title_de}
                </option>
              ))}
            </select>
          )}

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl"
          >
            <option value="all">Tất cả loại từ ({wordTypes.length})</option>
            {wordTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Manual Add Form */}
        {showAddForm && (
          <form
            onSubmit={handleManualSubmit}
            className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Loại từ</label>
                <select
                  value={form.word_type}
                  onChange={(e) => setForm({ ...form, word_type: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="Nomen">Nomen (Danh từ)</option>
                  <option value="Verb">Verb (Động từ)</option>
                  <option value="Adjektiv">Adjektiv (Tính từ)</option>
                  <option value="Abkürzung">Abkürzung (Viết tắt)</option>
                  <option value="Redewendung">Redewendung (Cụm từ)</option>
                </select>
              </div>
              {form.word_type === 'Nomen' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Giống (Artikel)</label>
                  <select
                    value={form.article}
                    onChange={(e) => setForm({ ...form, article: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="der">der (Giống đực)</option>
                    <option value="die">die (Giống cái)</option>
                    <option value="das">das (Giống trung)</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Từ tiếng Đức *
                </label>
                <input
                  required
                  value={form.word_de}
                  onChange={(e) => setForm({ ...form, word_de: e.target.value })}
                  placeholder="VD: Gewährleistung"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              {form.word_type === 'Nomen' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Số nhiều (Plural)</label>
                  <input
                    value={form.plural}
                    onChange={(e) => setForm({ ...form, plural: e.target.value })}
                    placeholder="VD: die Gewährleistungen"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nghĩa tiếng Việt *</label>
                <input
                  required
                  value={form.meaning_vn}
                  onChange={(e) => setForm({ ...form, meaning_vn: e.target.value })}
                  placeholder="VD: Quyền bảo hành / chịu trách nhiệm về lỗi sản phẩm"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={form.example_de}
                  onChange={(e) => setForm({ ...form, example_de: e.target.value })}
                  placeholder="Ví dụ tiếng Đức..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <input
                  value={form.example_vn}
                  onChange={(e) => setForm({ ...form, example_vn: e.target.value })}
                  placeholder="Dịch ví dụ tiếng Việt..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  value={form.grammar_note_vn}
                  onChange={(e) => setForm({ ...form, grammar_note_vn: e.target.value })}
                  placeholder="Ghi chú ngữ pháp / mẹo nhớ đi thi..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Lưu từ vựng
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Vocabulary Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <BookMarked className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy từ vựng phù hợp.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mẹo: Khi đọc bài học, bạn có thể bấm trực tiếp vào bất kỳ từ tiếng Đức nào để dịch và lưu vào đây!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((grp) => (
            <div key={grp.key} className="space-y-3">
              {!isLessonScoped && (grp.subject || grp.lesson) && (
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="min-w-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {grp.subject?.title_de || 'Môn học'}
                    </span>
                    {grp.lesson && (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {grp.lesson.title_de}
                      </h3>
                    )}
                  </div>
                  {grp.lesson && onOpenLesson && (
                    <button
                      onClick={() => onOpenLesson(grp.lesson.id)}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0"
                    >
                      Vào bài <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {grp.items.map((v) => {
                  const artKey = (v.article || '').toLowerCase();
                  const artClass =
                    ARTICLE_STYLE[artKey] ||
                    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

                  return (
                    <div
                      key={v.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {v.article && (
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-extrabold border ${artClass}`}>
                                {v.article}
                              </span>
                            )}
                            <span className="text-base font-extrabold text-slate-900 dark:text-white break-words">
                              {v.word_de}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {v.word_type || 'Fachbegriff'}
                            </span>
                          </div>
                          {v.plural && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              Số nhiều: {v.plural}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              speakGerman(v.article ? `${v.article} ${v.word_de}` : v.word_de, ttsRate)
                            }
                            className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 transition"
                            title="Nghe phát âm"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          {isAdmin && onDeleteVocab && (
                            <button
                              type="button"
                              onClick={() => onDeleteVocab(v.id)}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                              title="Xóa từ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{v.meaning_vn}</p>

                      {(v.example_de || v.example_vn) && (
                        <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl px-3 py-2 text-xs space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-slate-800 dark:text-slate-200 font-medium">{v.example_de}</p>
                            {v.example_de && (
                              <button
                                type="button"
                                onClick={() => speakGerman(v.example_de, ttsRate)}
                                className="text-slate-400 hover:text-indigo-600 shrink-0"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {v.example_vn && (
                            <p className="text-slate-500 dark:text-slate-400 italic">{v.example_vn}</p>
                          )}
                        </div>
                      )}

                      {v.grammar_note_vn && (
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg">
                          <strong>Mẹo ngữ pháp:</strong> {v.grammar_note_vn}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

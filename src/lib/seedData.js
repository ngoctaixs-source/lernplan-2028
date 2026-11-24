export const SAMPLE_GEMA_ONENOTE = `GEMA & Urheberrecht bei VA (Stichpunkte Lehrer)

1. UrhG: schützt geistige Schöpfungen (Musik, Texte, Fotos). Entsteht autom. mit Schöpfung -> keine Anmeldung nötig! Schutzfrist: 70 J. nach Tod d. Urhebers (§ 64 UrhG), danach gemeinfrei.

2. GEMA = Verwertungsgesellschaft -> nimmt Nutzungsrechte von Komponisten & Textdichtern wahr.

3. Pflichten Veranstalter:
- Jede öffentl. Wiedergabe geschützter Musik (Live, DJ, Hintergrundmusik) VOR VA anmelden!
- Tarife abhängig von: Raumgröße (m²), Eintritt (Brutto), Art (Live vs. Tonträger).
- Nach Live-VA: Musikfolge (Setlist) einreichen.

4. Nichtanmeldung -> doppelter Tarif (100% Kontrollzuschlag als Schadensersatz).`;

export function calcIhkGrade(percent) {
  if (percent >= 92) return { note: '1 (Sehr gut)', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' };
  if (percent >= 81) return { note: '2 (Gut)', color: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800' };
  if (percent >= 67) return { note: '3 (Befriedigend)', color: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800' };
  if (percent >= 50) return { note: '4 (Ausreichend — Đạt)', color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' };
  if (percent >= 30) return { note: '5 (Mangelhaft — Trượt)', color: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800' };
  return { note: '6 (Ungenügend — Trượt)', color: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800' };
}

export const LEVEL_META = {
  foundation: {
    label: '1. Nền tảng',
    de: 'Grundlagen',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  connected: {
    label: '2. Liên kết',
    de: 'Verknüpft',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  advanced: {
    label: '3. Mở rộng',
    de: 'Vertiefung',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
};

export const ARTICLE_STYLE = {
  der: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  die: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  das: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
};

// Anki-style SRS schedule calculator
export function calculateNextSrs(currentRecord, status) {
  const now = Date.now();
  const prevInterval = Number(currentRecord?.interval_days || 0);
  const prevReps = Number(currentRecord?.repetitions || 0);
  const prevEase = Number(currentRecord?.ease_factor || 2.5);

  if (status === 'new') {
    return {
      status: 'new',
      interval_days: 0,
      repetitions: 0,
      ease_factor: Math.max(1.3, prevEase - 0.2),
      next_review_at: new Date(now).toISOString(), // due immediately
    };
  }
  if (status === 'learning') {
    return {
      status: 'learning',
      interval_days: 1,
      repetitions: Math.max(1, prevReps),
      ease_factor: Math.max(1.3, prevEase - 0.05),
      next_review_at: new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  // status === 'mastered'
  let nextInterval = 3;
  if (prevReps === 1) nextInterval = 7;
  else if (prevReps >= 2) nextInterval = Math.min(60, Math.round(Math.max(7, prevInterval) * prevEase));

  return {
    status: 'mastered',
    interval_days: nextInterval,
    repetitions: prevReps + 1,
    ease_factor: Math.min(3.0, prevEase + 0.1),
    next_review_at: new Date(now + nextInterval * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function isCardDue(record) {
  if (!record || record.status !== 'mastered') return true;
  if (!record.next_review_at) return false;
  return new Date(record.next_review_at).getTime() <= Date.now();
}

export function extractYouTubeId(url) {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

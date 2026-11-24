export const SAMPLE_GEMA_ONENOTE = `GEMA & Urheberrecht bei Veranstaltungen

1. Urheberrecht (UrhG)
Das Urheberrecht schützt geistige Schöpfungen (Musik, Texte, Filme, Fotos) eines Urhebers. Es entsteht automatisch mit der Schöpfung – eine Anmeldung ist nicht erforderlich. Die Schutzfrist endet 70 Jahre nach dem Tod des Urhebers (§ 64 UrhG), danach wird das Werk gemeinfrei.

2. Aufgabe der GEMA
Die GEMA (Gesellschaft für musikalische Aufführungs- und mechanische Vervielfältigungsrechte) ist eine Verwertungsgesellschaft. Sie nimmt die Nutzungsrechte von Komponisten, Textdichtern und Musikverlegern wahr.

3. Pflichten des Veranstalters
Jede öffentliche Wiedergabe von urheberrechtlich geschützter Musik (Live-Band, DJ, Hintergrundmusik im Bowlingcenter oder auf einer Messe) muss VOR der Veranstaltung bei der GEMA angemeldet werden.
Berechnungsgrundlage der Tarife: Raumgröße (m²), Eintrittsgeld (Brutto) und Art der Musikwiedergabe (Live vs. Tonträger).
Nach der Veranstaltung muss bei Live-Musik eine Musikfolge (Setlist) eingereicht werden.

4. Rechtsfolgen bei Nichtanmeldung
Wird eine Veranstaltung nicht rechtzeitig angemeldet, droht der doppelte Tarif (100 % Kontrollzuschlag als Schadensersatz).`;

export function calcIhkGrade(percent) {
  if (percent >= 92) return { note: '1 (Sehr gut)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (percent >= 81) return { note: '2 (Gut)', color: 'text-teal-700 bg-teal-50 border-teal-200' };
  if (percent >= 67) return { note: '3 (Befriedigend)', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
  if (percent >= 50) return { note: '4 (Ausreichend — Đạt)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (percent >= 30) return { note: '5 (Mangelhaft — Trượt)', color: 'text-orange-700 bg-orange-50 border-orange-200' };
  return { note: '6 (Ungenügend — Trượt)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
}

export const LEVEL_META = {
  foundation: {
    label: '1. Nền tảng',
    de: 'Grundlagen',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  connected: {
    label: '2. Liên kết',
    de: 'Verknüpft',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  advanced: {
    label: '3. Mở rộng',
    de: 'Vertiefung',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

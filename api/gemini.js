const ADMIN_EMAIL = 'ngoctaixs@gmail.com';
const FAST_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest'];
const REASONING_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest'];
async function verifyUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function cleanJsonString(raw) {
  if (!raw) return '';
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

async function discoverAvailableModels(apiKey) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'X-goog-api-key': apiKey },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const list = (data.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          typeof m.name === 'string' &&
          /gemini/i.test(m.name) &&
          !/embedding|imagen|veo|tts|audio|robotics/i.test(m.name)
      )
      .map((m) => m.name.replace(/^models\//, ''));

    // Prioritize flash models first
    const flashFirst = [
      ...list.filter((n) => /flash/i.test(n) && !/lite/i.test(n)),
      ...list.filter((n) => /flash/i.test(n) && /lite/i.test(n)),
      ...list.filter((n) => !/flash/i.test(n)),
    ];
    return Array.from(new Set(flashFirst));
  } catch {
    return [];
  }
}

async function requestModel(apiKey, model, parts, expectJson) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3,
      ...(expectJson ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    return { ok: false, error: `[${model}] Lỗi mạng: ${netErr.message}` };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, error: `[${model}] (${response.status}): ${msg}` };
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    return { ok: false, error: `[${model}] Trả về nội dung trống.` };
  }

  if (!expectJson) {
    return { ok: true, data: text, model };
  }

  try {
    return { ok: true, data: JSON.parse(cleanJsonString(text)), model };
  } catch {
    return { ok: false, error: `[${model}] JSON chưa chuẩn hoặc bị cắt.` };
  }
}

async function callGemini({ parts, expectJson = true, preferReasoning = false }) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Thiếu biến môi trường GEMINI_API_KEY trên Vercel.');
  }

  const initialList = preferReasoning ? REASONING_MODELS : FAST_MODELS;
  const tried = new Set();
  const errorLog = [];

  // 1. Try primary known models
  for (const model of initialList) {
    tried.add(model);
    const res = await requestModel(apiKey, model, parts, expectJson);
    if (res.ok) return res.data;
    errorLog.push(res.error);
  }

  // 2. Auto-discover enabled models for this API key if primary list failed
  const discovered = await discoverAvailableModels(apiKey);
  for (const model of discovered.slice(0, 4)) {
    if (tried.has(model)) continue;
    tried.add(model);
    const res = await requestModel(apiKey, model, parts, expectJson);
    if (res.ok) return res.data;
    errorLog.push(res.error);
  }

  throw new Error(`Không gọi được Gemini AI. Chi tiết: ${errorLog.slice(0, 3).join(' | ')}`);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Health-check endpoint: mở https://lernplan-2028.vercel.app/api/gemini để kiểm tra kết nối AI
  if (req.method === 'GET') {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(200).json({ ok: false, error: 'Thiếu biến GEMINI_API_KEY trên Vercel' });
    }
    const discovered = await discoverAvailableModels(apiKey);
    const probeModel = FAST_MODELS[0];
    const probe = await requestModel(apiKey, probeModel, [{ text: 'Reply with OK only.' }], false);
    return res.status(200).json({
      ok: probe.ok,
      keyPrefix: `${apiKey.slice(0, 6)}...`,
      testedModel: probeModel,
      testReply: probe.ok ? probe.data : probe.error,
      availableModels: discovered.slice(0, 8),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const bodyObj = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { action, payload } = bodyObj;
    if (!action) {
      return res.status(400).json({ error: 'Thiếu tham số action.' });
    }

    const adminActions = [
      'import_onenote',
      'import_exam_batch',
      'generate_more_cards',
      'generate_more_quiz',
      'generate_more_vocab',
    ];
    if (adminActions.includes(action)) {
      const user = await verifyUser(req);
      const email = (user?.email || '').toLowerCase();
      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({
          error: `Chỉ tài khoản Admin (${ADMIN_EMAIL}) mới có quyền thêm hoặc tạo nội dung mới.`,
        });
      }
    }

    // =========================================================================
    // ACTION 1: NHẬP KIẾN THỨC ONENOTE / CHỮ VIẾT TAY BẢNG
    // =========================================================================
    if (action === 'import_onenote') {
      const { rawText = '', images = [], existingSubjects = [] } = payload || {};

      if (!rawText.trim() && (!Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: 'Vui lòng dán ghi chú hoặc tải lên ít nhất 1 ảnh.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ID: "${s.id}" | DE: "${s.title_de}" | VN: "${s.title_vn}"`).join('\n')
        : '(Chưa có môn học nào)';

      const prompt = `Du bist ein erfahrener IHK-Prüfer und Fachlehrer für "Veranstaltungskaufmann / Veranstaltungskauffrau" in Deutschland, der perfekt Deutsch und Vietnamesisch spricht.

AUFGABE:
Analysiere das bereitgestellte Unterrichtsmaterial (OneNote-Text und/oder Fotos von Tafelanschrieben/Handschrift/Folien).

WICHTIGE REGELN:
1. HANDSCHRIFT & ABKÜRZUNGEN KORRIGIEREN:
   - Lehrkräfte nutzen oft Stichpunkte, fehlende Subjekte/Prädikate oder Abkürzungen (z. B. VA = Veranstaltung, TN = Teilnehmer, MA = Mitarbeiter, z.B., bzw., i.d.R., VStättV, K = Kosten, E = Erlöse, DB = Deckungsbeitrag).
   - Wandle bruchstückhafte Stichpunkte in vollständige, grammatikalisch saubere, prüfungstaugliche deutsche Sätze im IHK-Stil um, OHNE die fachlichen Originalbegriffe und Paragraphen zu verlieren!
2. FACHZUORDNUNG & LEKTIONEN:
   - Ordne den Stoff einem bestehenden Fach zu ODER erstelle ein neues Fach.
   Bestehende Fächer:
   ${subjectListText}
   - Zerlege den Inhalt in 1 bis 3 logisch geordnete Lektionen: "foundation" (Nền tảng) -> "connected" (Liên kết) -> "advanced" (Mở rộng).
3. TABELLEN & DIAGRAMME (für Kalkulation, Rechnungswesen, Netzplan, Prozesse):
   - Wenn Tabellen/Kalkulationsschemata vorkommen, nutze saubere Markdown-Tabellen (| Spalte 1 | Spalte 2 |) direkt in content_de und content_vn.
   - Wenn ein Abschnitt eine grafische Darstellung sinnvoll macht, gib optional "diagram_json" in EINEM dieser Formate an (sonst null):
     a) Break-even-Point: {"type":"break_even","title":"...","kf":6000,"kv":6,"price":26,"unit":"Tickets","currency":"€"}
     b) Buchhaltung T-Konto: {"type":"t_konto","title":"...","account":"Bank / Kasse","soll":[{"label":"Anfangsbestand","amount":"10.000 €"}],"haben":[{"label":"Miete","amount":"2.500 €"}]}
     c) Prozess / Netzplan / Organigramm: {"type":"flow","title":"...","steps":[{"title":"Schritt 1","subtitle":"Beschreibung","badge":"Tag 1 / Puffer 0"}]}
     d) Balkendiagramm: {"type":"bar","title":"...","unit":"€","items":[{"label":"Miete","value":4000},{"label":"Technik","value":2500}]}
4. YOUTUBE-LERNVIDEOS:
   - Gib pro Abschnitt 2 präzise deutsche YouTube-Suchbegriffe in "video_keywords" an (z. B. Simpleclub, Studyflix, IHK-Erklärung).
5. FACHWORTSCHATZ (VOKABELN) PRO LEKTION:
   - Extrahiere 6 bis 12 wichtige deutsche Fachwörter/Verben/Adjektive aus jeder Lektion:
     * Bei Nomen IMMER exakten Artikel ("der" / "die" / "das") und Pluralform ("die ...") angeben.
     * Bei anderen Wortarten article: "", plural: "", word_type genau benennen ("Verb", "Adjektiv", "Abkürzung", "Redewendung").
     * Immer mit vietnamesischer Bedeutung, konkretem Praxisbeispiel (DE + VN) und Grammatik-/Prüfungshinweis.
6. ADAPTIVE TESTFRAGEN (UMFASSEND):
   - Kurze Lektion (1-2 Abschnitte): 5-6 Fragen
   - Mittlere Lektion (3-4 Abschnitte): 7-9 Fragen
   - Lange Lektion (5+ Abschnitte): 10-12 Fragen
   - Gute Mischung aus Multiple-Choice ("mc") und offenen Aufgaben/Rechenaufgaben ("essay").
7. FLASHCARDS:
   - Erstelle 5 bis 8 präzise zweisprachige Flashcards pro Lektion.

ANTWORTE AUSSCHLIESSLICH MIT VALIDEM JSON:
{
  "existing_subject_id": "UUID oder null",
  "subject": {
    "title_de": "Fachname Deutsch",
    "title_vn": "Tên môn tiếng Việt",
    "description_de": "Kurzbeschreibung Deutsch",
    "description_vn": "Mô tả ngắn tiếng Việt"
  },
  "lessons": [
    {
      "title_de": "Lektionstitel Deutsch",
      "title_vn": "Tiêu đề bài tiếng Việt",
      "level": "foundation",
      "overview_de": "Überblick auf Deutsch",
      "overview_vn": "Tổng quan tiếng Việt",
      "sections": [
        {
          "heading_de": "1. Überschrift",
          "heading_vn": "1. Tiêu đề",
          "content_de": "Sauber ausformulierter Fachtext (gern mit Markdown-Tabellen bei Kalkulation)",
          "content_vn": "Bản dịch tiếng Việt rõ ràng",
          "diagram_json": null,
          "video_keywords": [
            {"label": "Video giải thích ngắn", "query": "exakte deutsche YouTube Suchanfrage"}
          ]
        }
      ],
      "vocabularies": [
        {
          "word_de": "Grundform ohne Artikel",
          "article": "der",
          "plural": "die ...",
          "word_type": "Nomen",
          "meaning_vn": "Nghĩa tiếng Việt chính xác",
          "example_de": "Beispielsatz im Event-Kontext",
          "example_vn": "Dịch ví dụ tiếng Việt",
          "grammar_note_vn": "Ghi chú ngữ pháp / mẹo nhớ"
        }
      ],
      "flashcards": [
        {
          "category": "Fachbegriff",
          "front_de": "Begriff / Formel",
          "hint_vn": "Gợi ý ngắn VN",
          "back_de": "IHK-Definition DE",
          "back_vn": "Định nghĩa VN",
          "example_de": "Beispiel DE",
          "example_vn": "Ví dụ VN"
        }
      ],
      "quiz_questions": [
        {
          "q_type": "mc",
          "question_de": "Frage DE",
          "question_vn": "Câu hỏi VN",
          "options": [
            {"de": "A", "vn": "A"},
            {"de": "B", "vn": "B"},
            {"de": "C", "vn": "C"},
            {"de": "D", "vn": "D"}
          ],
          "correct_index": 0,
          "explanation_de": "Begründung DE",
          "explanation_vn": "Giải thích VN"
        },
        {
          "q_type": "essay",
          "question_de": "Situations-/Rechenaufgabe DE",
          "question_vn": "Tình huống / Bài toán VN",
          "model_answer_de": "IHK-Musterlösung DE",
          "model_answer_vn": "Đáp án mẫu VN",
          "explanation_de": "Bewertungshinweis DE",
          "explanation_vn": "Lưu ý chấm điểm IHK VN"
        }
      ]
    }
  ]
}

${rawText.trim() ? `ZUSÄTZLICHER TEXT / HINWEIS:\n${rawText.trim()}` : 'Lies alle angehängten Fotos sorgfältig aus (OCR) und korrigiere Stichpunkte/Abkürzungen zu klarem Prüfungsdeutsch.'}`;

      const parts = [{ text: prompt }];
      if (Array.isArray(images)) {
        for (const img of images.slice(0, 3)) {
          if (img?.base64) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: img.base64,
              },
            });
          }
        }
      }

      const result = await callGemini({ parts, expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 2: NẠP ĐỀ THI CŨ (ALTKLAUSUREN)
    // =========================================================================
    if (action === 'import_exam_batch') {
      const { rawText = '', images = [], examTitle = '', startNumber = 1 } = payload || {};
      if (!rawText.trim() && (!Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: 'Vui lòng dán nội dung đề thi hoặc tải ảnh trang đề thi.' });
      }

      const prompt = `Du digitalisierst echte IHK-Altklausuren für den Beruf "Veranstaltungskaufmann" (Deutsch + Vietnamesisch).
Prüfung: "${examTitle}"
Startnummer der Aufgaben: ${startNumber}

AUFGABE:
Extrahiere JEDE Aufgabe aus dem Text / den angehängten Klausurseiten sauber und vollständig.
- Behalte Tabellen (als Markdown-Tabellen), Zahlen, Paragraphen und Situationsbeschreibungen exakt bei!
- Multiple-Choice -> q_type: "mc" mit options und correct_index.
- Offene Text-, Rechen- oder Zeichnungsaufgabe -> q_type: "essay" mit ausführlicher IHK-Musterlösung (inkl. Rechenweg!).
- Schätze realistische IHK-Punkte (5, 10, 15 oder 20) oder übernimm Originalpunkte.
- Übersetze jede Aufgabe klar ins Vietnamesische (question_vn).

ANTWORTE NUR ALS VALIDES JSON:
{
  "questions": [
    {
      "section_label": "Aufgabe ${startNumber} · Thema",
      "q_type": "essay",
      "points": 10,
      "question_de": "Vollständige Originalaufgabe",
      "question_vn": "Bản dịch tiếng Việt rõ ràng",
      "options": [],
      "correct_index": null,
      "model_answer_de": "Vollständige IHK-Musterlösung mit Rechenweg",
      "model_answer_vn": "Bài mẫu tiếng Việt",
      "explanation_de": "Prüferhinweis DE",
      "explanation_vn": "Lưu ý ăn điểm / bẫy đề IHK VN",
      "diagram_json": null
    }
  ]
}

${rawText.trim() ? `KLAUSUR-TEXT:\n${rawText.trim()}` : 'Lies alle Aufgaben vollständig aus den angehängten Prüfungsseiten aus.'}`;

      const parts = [{ text: prompt }];
      if (Array.isArray(images)) {
        for (const img of images.slice(0, 3)) {
          if (img?.base64) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: img.base64,
              },
            });
          }
        }
      }

      const result = await callGemini({ parts, expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 3: GIẢI THÍCH DỄ HIỂU & VÍ DỤ THỰC TẾ
    // =========================================================================
    if (action === 'explain_section') {
      const { lessonTitle, headingDe, contentDe } = payload || {};
      const prompt = `Du erklärst einem Auszubildenden (Veranstaltungskaufmann, Deutsch B2, Muttersprache Vietnamesisch) einen Berufsschul-Abschnitt extrem verständlich und praxisnah.

Lektion: ${lessonTitle || ''}
Abschnitt: ${headingDe || ''}
Originaltext: ${contentDe || ''}

ANTWORTE NUR ALS VALIDES JSON:
{
  "explanation_de": "Sehr einfache, alltagsnahe Erklärung auf Deutsch (2-4 Sätze)",
  "explanation_vn": "Giải thích siêu dễ hiểu bằng tiếng Việt (2-4 câu)",
  "example_de": "Konkretes Praxisbeispiel aus der Eventbranche auf Deutsch",
  "example_vn": "Bản dịch ví dụ thực tế tiếng Việt",
  "exam_tip_vn": "Mẹo nhớ từ khóa tiếng Đức ăn điểm thi IHK"
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 4: CHẤM BÀI TỰ LUẬN & ẢNH GIẤY NHÁP
    // =========================================================================
    if (action === 'grade_quiz') {
      const { essays = [] } = payload || {};
      if (!essays.length) {
        return res.status(200).json({ data: { results: [] } });
      }

      const parts = [];
      const essaySummaries = essays.map((e, idx) => ({
        index: idx + 1,
        question_id: e.question_id,
        question_de: e.question_de,
        model_answer_de: e.model_answer_de,
        typed_answer: e.user_answer || '(Không gõ chữ)',
        has_handwritten_image: Boolean(e.image_base64),
      }));

      parts.push({
        text: `Du bist ein wohlwollender, aber fachlich genauer IHK-Prüfer für Veranstaltungskaufleute.
Bewerte die folgenden offenen Aufgaben. Der Prüfling darf auf Deutsch, Vietnamesisch oder gemischt antworten — UND bei Rechenaufgaben/Diagrammen/T-Konten kann ein Foto eines handgeschriebenen Lösungsblatts beigefügt sein!

WICHTIG BEI FOTOS VON HANDSCHRIFTLICHEN LÖSUNGEN:
- Lies den handgeschriebenen Rechenweg, Zahlen, Tabellen, T-Konten oder gezeichneten Diagramme (Achsen, Schnittpunkte, Kurven) sehr genau ab.
- Vergib Teilpunkte für richtige Rechenwege, auch wenn am Ende ein kleiner Rundungsfehler passiert ist, und erkläre genau, in welcher Zeile/Achse der Fehler lag.

Aufgabenliste:
${JSON.stringify(essaySummaries, null, 2)}

ANTWORTE NUR ALS VALIDES JSON:
{
  "results": [
    {
      "question_id": "exakte question_id",
      "score": 85,
      "feedback_de": "Konkretes Feedback, Lob für Richtiges & genaue Fehlerkorrektur auf Deutsch",
      "feedback_vn": "Nhận xét chi tiết bằng tiếng Việt (nêu rõ đúng chỗ nào, sai/thiếu dòng nào)",
      "musterloesung_de": "Saubere IHK-Musterlösung auf Deutsch",
      "musterloesung_vn": "Bài mẫu tiếng Việt"
    }
  ]
}`,
      });

      essays.forEach((e, idx) => {
        if (e.image_base64) {
          parts.push({
            text: `>>> HANDSCHRIFTLICHES LÖSUNGSFOTO ZU AUFGABE #${idx + 1} (question_id: "${e.question_id}"):`,
          });
          parts.push({
            inlineData: {
              mimeType: e.image_mime_type || 'image/jpeg',
              data: e.image_base64,
            },
          });
        }
      });

      const result = await callGemini({ parts, expectJson: true, preferReasoning: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 5: TRA TỪ ĐIỂN BẤM-ĐÂU-DỊCH-ĐÓ
    // =========================================================================
    if (action === 'lookup_word') {
      const { word = '', contextSentence = '' } = payload || {};
      const cleaned = word.trim();
      if (!cleaned) {
        return res.status(400).json({ error: 'Thiếu từ cần tra.' });
      }

      const prompt = `Du bist ein präzises Deutsch-Vietnamesisch Fachwörterbuch für Auszubildende im Beruf Veranstaltungskaufmann (B2-Niveau).
Analysiere das angeklickte deutsche Wort im Kontext seines Satzes.

Angeklicktes Wort: "${cleaned}"
Kontext-Satz: "${(contextSentence || '').slice(0, 400)}"

REGELN:
- Bestimme die Grundform (Lemma) des Wortes.
- Wenn es ein Nomen ist: gib zwingend den richtigen Artikel ("der", "die" oder "das") und den Plural ("die ...") an!
- Wenn es kein Nomen ist: article: "", plural: "", und gib die genaue Wortart an ("Verb", "Adjektiv", "Adverb", "Präposition", "Konjunktion", "Abkürzung", "Pronomen").
- Erkläre die Bedeutung präzise im Kontext des Satzes.
- Gib 1 kurzes, praxisnahes Beispiel (DE + VN) und einen kompakten Grammatik-Hinweis.

ANTWORTE NUR ALS VALIDES JSON:
{
  "lemma_de": "Grundform ohne Artikel",
  "article": "der",
  "plural": "die ...",
  "word_type": "Nomen",
  "meaning_vn": "Nghĩa tiếng Việt rõ ràng trong ngữ cảnh",
  "example_de": "Kurzer Beispielsatz auf Deutsch",
  "example_vn": "Bản dịch ví dụ tiếng Việt",
  "grammar_note_vn": "Ghi chú ngắn về giống/chia động từ/cách dùng"
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 6: TẠO THÊM FLASHCARDS
    // =========================================================================
    if (action === 'generate_more_cards') {
      const { lessonTitle, sectionsText, existingFronts = [] } = payload || {};
      const prompt = `Erstelle 5 NEUE, prüfungsrelevante zweisprachige Flashcards (Deutsch + Vietnamesisch) für "${lessonTitle}".
Vermeide Duplikate zu: ${JSON.stringify(existingFronts)}.

Inhalt:
${sectionsText}

ANTWORTE NUR ALS VALIDES JSON:
{
  "flashcards": [
    {
      "category": "Fachbegriff",
      "front_de": "Begriff DE",
      "hint_vn": "Gợi ý VN",
      "back_de": "IHK-Definition DE",
      "back_vn": "Định nghĩa VN",
      "example_de": "Beispiel DE",
      "example_vn": "Ví dụ VN"
    }
  ]
}`;
      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 7: TẠO THÊM CÂU HỎI TEST
    // =========================================================================
    if (action === 'generate_more_quiz') {
      const { lessonTitle, sectionsText, existingQuestions = [] } = payload || {};
      const prompt = `Erstelle 5 WEITERE, NEUE IHK-Prüfungsfragen (3 Multiple-Choice "mc" + 2 offene Aufgaben "essay") für "${lessonTitle}".
Bereits vorhandene Fragen (NICHT wiederholen): ${JSON.stringify(existingQuestions.slice(0, 15))}.

Inhalt:
${sectionsText}

ANTWORTE NUR ALS VALIDES JSON:
{
  "quiz_questions": [
    {
      "q_type": "mc",
      "question_de": "Frage DE",
      "question_vn": "Câu hỏi VN",
      "options": [{"de":"A","vn":"A"},{"de":"B","vn":"B"},{"de":"C","vn":"C"},{"de":"D","vn":"D"}],
      "correct_index": 0,
      "explanation_de": "Erklärung DE",
      "explanation_vn": "Giải thích VN"
    },
    {
      "q_type": "essay",
      "question_de": "Praxisfall DE",
      "question_vn": "Tình huống VN",
      "model_answer_de": "Musterlösung DE",
      "model_answer_vn": "Bài mẫu VN",
      "explanation_de": "Hinweis DE",
      "explanation_vn": "Lưu ý VN"
    }
  ]
}`;
      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 8: TRÍCH XUẤT THÊM TỪ VỰNG
    // =========================================================================
    if (action === 'generate_more_vocab') {
      const { lessonTitle, sectionsText, existingWords = [] } = payload || {};
      const prompt = `Extrahiere 6 bis 8 weitere wichtige deutsche Fachwörter, Verben und Adjektive aus der Lektion "${lessonTitle}" für das Wörterbuch.
Bereits vorhandene Wörter (nicht wiederholen): ${JSON.stringify(existingWords)}.

Text:
${sectionsText}

ANTWORTE NUR ALS VALIDES JSON:
{
  "vocabularies": [
    {
      "word_de": "Grundform ohne Artikel",
      "article": "der",
      "plural": "die ...",
      "word_type": "Nomen",
      "meaning_vn": "Nghĩa tiếng Việt",
      "example_de": "Beispielsatz DE",
      "example_vn": "Dịch ví dụ VN",
      "grammar_note_vn": "Ghi chú ngữ pháp"
    }
  ]
}`;
      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    return res.status(400).json({ error: `Action không hợp lệ: ${action}` });
  } catch (err) {
    console.error('Gemini API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi gọi AI.' });
  }
}

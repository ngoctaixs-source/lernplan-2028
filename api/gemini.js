const ADMIN_EMAIL = 'ngoctaixs@gmail.com';
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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

async function callGemini({ parts, expectJson = true }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Thiếu biến môi trường GEMINI_API_KEY trên Vercel.');
  }

  let lastError = 'Không thể kết nối Gemini API.';

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.35,
        ...(expectJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 404) {
      lastError = `Model ${model} không khả dụng (404), đang thử model dự phòng...`;
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini API lỗi (${response.status}): ${msg}`);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new Error('Gemini trả về kết quả trống. Hãy thử lại.');
    }

    if (!expectJson) return text;

    try {
      return JSON.parse(cleanJsonString(text));
    } catch (e) {
      throw new Error('AI trả về định dạng JSON chưa chuẩn, vui lòng bấm thử lại.');
    }
  }

  throw new Error(lastError);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, payload } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: 'Thiếu tham số action.' });
    }

    // Các thao tác ghi/nhập liệu vào kho chung yêu cầu đúng Admin ngoctaixs@gmail.com
    const adminActions = ['import_onenote', 'generate_more_cards', 'generate_more_quiz'];
    if (adminActions.includes(action)) {
      const user = await verifyUser(req);
      const email = (user?.email || '').toLowerCase();
      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({
          error: `Chỉ tài khoản Admin (${ADMIN_EMAIL}) mới có quyền thêm hoặc tạo nội dung mới.`,
        });
      }
    }

    // ACTION 1: NHẬP KIẾN THỨC TỪ ONENOTE (TEXT HOẶC ẢNH OCR)
    if (action === 'import_onenote') {
      const { rawText = '', imageBase64 = '', imageMimeType = 'image/jpeg', existingSubjects = [] } = payload || {};
      if (!rawText.trim() && !imageBase64) {
        return res.status(400).json({ error: 'Vui lòng dán văn bản OneNote hoặc tải ảnh ghi chú.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ID: "${s.id}" | DE: "${s.title_de}" | VN: "${s.title_vn}"`).join('\n')
        : '(Chưa có môn học nào)';

      const prompt = `Du bist ein erfahrener IHK-Prüfer und Fachlehrer für den Ausbildungsberuf "Veranstaltungskaufmann / Veranstaltungskauffrau" in Deutschland, der perfekt Deutsch und Vietnamesisch spricht.

AUFGABE:
Analysiere die bereitgestellten OneNote-Notizen (Text und/oder Foto/Screenshot).
1. Ordne den Inhalt einem passenden bestehenden Fach zu ODER erstelle ein neues Fach (Deutsch + Vietnamesisch).
Bestehende Fächer:
${subjectListText}

2. Zerlege den Stoff in 1 bis 3 logisch aufeinander aufbauende, gut lernbare kleine Lektionen.
   - Sortiere zwingend von GRUNDLAGEN (level: "foundation") -> VERKNÜPFT (level: "connected") -> VERTIEFUNG (level: "advanced"), sodass Vorwissen immer zuerst kommt.
3. BEWAHRE den exakten deutschen Fachwortschatz, Paragraphen und die prüfungsrelevante Formulierung aus den Originalnotizen (wichtig für IHK-Prüfungen!), strukturiere ihn aber sauber in übersichtliche Abschnitte (sections).
4. Füge UNTER JEDEM deutschen Textblock eine klare, natürliche vietnamesische Übersetzung hinzu.
5. Erstelle für JEDE Lektion:
   - 5 bis 6 zweisprachige Flashcards (Fachbegriff / Formel / Recht / Praxis)
   - 4 bis 5 gemischte Prüfungsfragen: mindestens 2 Multiple-Choice-Fragen ("mc") und 2 praxisnahe offene Situations-/Textaufgaben ("essay") im IHK-Stil.

ANTWORTE AUSSCHLIESSLICH MIT VALIDEM JSON in exakt diesem Schema:
{
  "existing_subject_id": "UUID eines bestehenden Fachs oder null wenn neues Fach",
  "subject": {
    "title_de": "Deutscher Fachname",
    "title_vn": "Tên môn tiếng Việt",
    "description_de": "Kurze Beschreibung auf Deutsch",
    "description_vn": "Mô tả ngắn tiếng Việt"
  },
  "lessons": [
    {
      "title_de": "Prägnanter deutscher Lektionstitel",
      "title_vn": "Tiêu đề bài học tiếng Việt",
      "level": "foundation",
      "overview_de": "Allgemeiner Überblick aus den Originalnotizen auf Deutsch",
      "overview_vn": "Khái quát tổng quan tiếng Việt",
      "sections": [
        {
          "heading_de": "1. Überschrift",
          "heading_vn": "1. Tiêu đề mục",
          "content_de": "Prüfungsnaher Original-Fachtext auf Deutsch",
          "content_vn": "Bản dịch tiếng Việt rõ ràng, chính xác"
        }
      ],
      "flashcards": [
        {
          "category": "Fachbegriff",
          "front_de": "Begriff / Frage auf Deutsch",
          "hint_vn": "Gợi ý ngắn tiếng Việt",
          "back_de": "Prüfungsgerechte Definition auf Deutsch",
          "back_vn": "Định nghĩa tiếng Việt",
          "example_de": "Praxisbeispiel Eventbranche auf Deutsch",
          "example_vn": "Ví dụ thực tế tiếng Việt"
        }
      ],
      "quiz_questions": [
        {
          "q_type": "mc",
          "question_de": "Frage auf Deutsch",
          "question_vn": "Câu hỏi tiếng Việt",
          "options": [
            {"de": "Option A", "vn": "Đáp án A"},
            {"de": "Option B", "vn": "Đáp án B"},
            {"de": "Option C", "vn": "Đáp án C"},
            {"de": "Option D", "vn": "Đáp án D"}
          ],
          "correct_index": 0,
          "explanation_de": "Begründung auf Deutsch",
          "explanation_vn": "Giải thích chi tiết tiếng Việt"
        },
        {
          "q_type": "essay",
          "question_de": "Praxisfall / offene IHK-Frage auf Deutsch",
          "question_vn": "Câu hỏi tự luận tình huống tiếng Việt",
          "model_answer_de": "IHK-Musterlösung auf Deutsch",
          "model_answer_vn": "Đáp án mẫu tiếng Việt",
          "explanation_de": "Worauf Prüfer achten",
          "explanation_vn": "Lưu ý chấm điểm IHK"
        }
      ]
    }
  ]
}

${rawText.trim() ? `ONENOTE-TEXT:\n${rawText.trim()}` : 'Lies den gesamten deutschen Text sorgfältig aus dem angehängten Bild (OCR) aus.'}`;

      const parts = [{ text: prompt }];
      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType || 'image/jpeg',
            data: imageBase64,
          },
        });
      }

      const result = await callGemini({ parts, expectJson: true });
      return res.status(200).json({ data: result });
    }

    // ACTION 2: GIẢI THÍCH DỄ HIỂU & VÍ DỤ THỰC TẾ CHO TỪNG MỤC
    if (action === 'explain_section') {
      const { lessonTitle, headingDe, contentDe } = payload || {};
      const prompt = `Du erklärst einem Auszubildenden (Veranstaltungskaufmann, Deutsch B2, Muttersprache Vietnamesisch) einen trockenen Berufsschul-Abschnitt extrem verständlich und praxisnah.

Lektion: ${lessonTitle || ''}
Abschnitt: ${headingDe || ''}
Originaltext: ${contentDe || ''}

Erstelle eine glasklare Erklärung, ein konkretes Beispiel aus der Eventbranche (Konzert, Messe, Gala, Konferenz, Bowling/Eventlocation) und einen knackigen IHK-Prüfungstipp.

ANTWORTE NUR ALS VALIDES JSON:
{
  "explanation_de": "Sehr einfache, alltagsnahe Erklärung auf Deutsch (2-4 Sätze)",
  "explanation_vn": "Giải thích siêu dễ hiểu bằng tiếng Việt như bạn bè giảng lại (2-4 câu)",
  "example_de": "Konkretes Praxisbeispiel aus dem Event-Alltag auf Deutsch",
  "example_vn": "Bản dịch ví dụ thực tế tiếng Việt",
  "exam_tip_vn": "Mẹo nhớ từ khóa tiếng Đức ăn điểm thi IHK (tiếng Việt kèm từ khóa Đức)"
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // ACTION 3: CHẤM BÀI TỰ LUẬN & SỬA LỖI CHI TIẾT
    if (action === 'grade_quiz') {
      const { essays = [] } = payload || {};
      if (!essays.length) {
        return res.status(200).json({ data: { results: [] } });
      }

      const prompt = `Du bist ein wohlwollender, aber fachlich genauer IHK-Prüfer für Veranstaltungskaufleute.
Bewerte die folgenden offenen Antworten des Auszubildenden (der Prüfling darf auf Deutsch, Vietnamesisch oder gemischt antworten – bewerte primär das fachliche Verständnis und gib Hinweise zu wichtigen deutschen Fachbegriffen für die echte IHK-Prüfung).

Aufgaben & Antworten:
${JSON.stringify(essays, null, 2)}

Vergib für jede Antwort eine Punktzahl von 0 bis 100 ("score").
Erkläre präzise, was richtig war, was fehlt oder falsch ist, und liefere die saubere IHK-Musterlösung (immer zweisprachig Deutsch + Vietnamesisch).

ANTWORTE NUR ALS VALIDES JSON:
{
  "results": [
    {
      "question_id": "ID der Frage",
      "score": 85,
      "feedback_de": "Konkretes Feedback & Fehlerkorrektur auf Deutsch",
      "feedback_vn": "Nhận xét & sửa lỗi chi tiết bằng tiếng Việt",
      "musterloesung_de": "Musterlösung im IHK-Stil auf Deutsch",
      "musterloesung_vn": "Bài mẫu tiếng Việt"
    }
  ]
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // ACTION 4: TẠO THÊM FLASHCARDS BẰNG AI
    if (action === 'generate_more_cards') {
      const { lessonTitle, sectionsText, existingFronts = [] } = payload || {};
      const prompt = `Erstelle 4 NEUE, prüfungsrelevante zweisprachige Flashcards (Deutsch + Vietnamesisch) für die Veranstaltungskaufmann-Lektion "${lessonTitle}".
Vermeide Duplikate zu diesen bereits vorhandenen Karten: ${JSON.stringify(existingFronts)}.

Lektionsinhalt:
${sectionsText}

ANTWORTE NUR ALS VALIDES JSON:
{
  "flashcards": [
    {
      "category": "Fachbegriff",
      "front_de": "Begriff auf Deutsch",
      "hint_vn": "Gợi ý tiếng Việt",
      "back_de": "IHK-Definition auf Deutsch",
      "back_vn": "Định nghĩa tiếng Việt",
      "example_de": "Praxisbeispiel auf Deutsch",
      "example_vn": "Ví dụ tiếng Việt"
    }
  ]
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    // ACTION 5: TẠO BỘ CÂU HỎI TEST MỚI BẰNG AI
    if (action === 'generate_more_quiz') {
      const { lessonTitle, sectionsText } = payload || {};
      const prompt = `Erstelle 5 FRISCHE IHK-Prüfungsfragen (3 Multiple-Choice "mc" + 2 praxisnahe offene Situationsaufgaben "essay") zweisprachig (Deutsch + Vietnamesisch) für die Veranstaltungskaufmann-Lektion "${lessonTitle}".

Lektionsinhalt:
${sectionsText}

ANTWORTE NUR ALS VALIDES JSON:
{
  "quiz_questions": [
    {
      "q_type": "mc",
      "question_de": "Frage auf Deutsch",
      "question_vn": "Câu hỏi tiếng Việt",
      "options": [
        {"de": "A", "vn": "A"},
        {"de": "B", "vn": "B"},
        {"de": "C", "vn": "C"},
        {"de": "D", "vn": "D"}
      ],
      "correct_index": 0,
      "explanation_de": "Erklärung auf Deutsch",
      "explanation_vn": "Giải thích tiếng Việt"
    },
    {
      "q_type": "essay",
      "question_de": "Praxisfall auf Deutsch",
      "question_vn": "Tình huống thực tế tiếng Việt",
      "model_answer_de": "Musterlösung Deutsch",
      "model_answer_vn": "Bài mẫu tiếng Việt",
      "explanation_de": "Prüfungshinweis Deutsch",
      "explanation_vn": "Lưu ý IHK tiếng Việt"
    }
  ]
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true });
      return res.status(200).json({ data: result });
    }

    return res.status(400).json({ error: `Action không hợp lệ: ${action}` });
  } catch (err) {
    console.error('Gemini serverless error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi gọi AI.' });
  }
}

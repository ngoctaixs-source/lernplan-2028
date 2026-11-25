const ADMIN_EMAIL = 'ngoctaixs@gmail.com';

// Groq: siêu tốc, miễn phí 1.000 - 14.400 lượt/ngày
// - INSTANT: dành riêng cho tra từ điển 1 từ (~150-300ms!)
const GROQ_INSTANT_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
];
// - TEXT: dành cho phân tích bài học, lọc PDF, tạo flashcard/test chuẩn IHK
const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
];
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];

// Gemini (dự phòng khi cần hoặc nếu chưa gắn GROQ_API_KEY)
const GEMINI_LITE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
];
const GEMINI_REASONING_MODELS = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-latest',
];

let cachedGeminiModels = { models: null, at: 0 };
let cachedGroqModels = { models: null, at: 0 };
const modelCooldown = new Map();

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

// =============================================================================
// GROQ ENGINE (Bỏ qua gọi list-models lúc khởi động để giảm độ trễ xuống tối thiểu)
// =============================================================================
async function discoverGroqModels(groqKey, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedGroqModels.models && now - cachedGroqModels.at < 10 * 60 * 1000) {
    return cachedGroqModels.models;
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const blocked = /whisper|guard|tts|playai|orpheus|embed|moderation|prompt-guard|safeguard/i;
    const ids = (data.data || [])
      .map((m) => m.id)
      .filter((id) => typeof id === 'string' && !blocked.test(id));
    cachedGroqModels = { models: ids, at: now };
    return ids;
  } catch {
    return [];
  }
}

function partsToOpenAIContent(parts) {
  const hasImages = parts.some((p) => p.inlineData?.data);
  if (!hasImages) {
    return parts.map((p) => p.text || '').join('\n\n');
  }
  return parts.map((p) => {
    if (p.inlineData?.data) {
      const mime = p.inlineData.mimeType || 'image/jpeg';
      return {
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${p.inlineData.data}` },
      };
    }
    return { type: 'text', text: p.text || '' };
  });
}

async function requestGroqModel(
  groqKey,
  model,
  parts,
  expectJson,
  { timeoutMs = 45000, maxTokens = 8000, temperature = 0.25 } = {}
) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const content = partsToOpenAIContent(parts);
  const messages = [
    ...(expectJson
      ? [{ role: 'system', content: 'Respond with valid JSON only. No markdown fences or extra text.' }]
      : []),
    { role: 'user', content },
  ];

  const attempt = async (useJsonFormat) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } catch (err) {
      clearTimeout(timer);
      return { netErr: err };
    }
  };

  let { res, data, netErr } = await attempt(expectJson);
  if (netErr) {
    return { ok: false, error: `[Groq/${model}] Lỗi mạng/timeout: ${netErr.message}` };
  }

  if (!res.ok && res.status === 400 && expectJson && /json|response_format/i.test(data?.error?.message || '')) {
    const retry = await attempt(false);
    if (retry.netErr) {
      return { ok: false, error: `[Groq/${model}] Lỗi mạng/timeout: ${retry.netErr.message}` };
    }
    res = retry.res;
    data = retry.data;
  }

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 404) modelCooldown.set(`groq:${model}`, Date.now() + 30 * 60 * 1000);
    else if (res.status === 429) modelCooldown.set(`groq:${model}`, Date.now() + 2 * 60 * 1000);
    else if (res.status === 503) modelCooldown.set(`groq:${model}`, Date.now() + 30 * 1000);
    return { ok: false, error: `[Groq/${model}] (${res.status}): ${msg}` };
  }

  const text = (data?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    return { ok: false, error: `[Groq/${model}] Trả về nội dung trống.` };
  }

  if (!expectJson) return { ok: true, data: text, model: `groq/${model}` };

  try {
    return { ok: true, data: JSON.parse(cleanJsonString(text)), model: `groq/${model}` };
  } catch {
    return { ok: false, error: `[Groq/${model}] JSON chưa chuẩn hoặc bị cắt.` };
  }
}

async function callGroq({
  parts,
  expectJson = true,
  preferReasoning = false,
  instant = false,
  maxTokens = 8000,
}) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqKey) return { ok: false, errors: [] };

  const hasImages = parts.some((p) => p.inlineData?.data);
  const preferred = hasImages
    ? GROQ_VISION_MODELS
    : instant
    ? GROQ_INSTANT_MODELS
    : GROQ_TEXT_MODELS;

  const now = Date.now();
  const ready = preferred.filter((m) => (modelCooldown.get(`groq:${m}`) || 0) <= now);
  const cooling = preferred.filter((m) => (modelCooldown.get(`groq:${m}`) || 0) > now);
  const primaryOrder = [...ready, ...cooling];

  const reqOpts = {
    timeoutMs: instant ? 12000 : 45000,
    maxTokens: instant ? Math.min(maxTokens, 360) : maxTokens,
    temperature: instant ? 0.1 : 0.25,
  };

  const errors = [];
  // 1. Gọi thẳng danh sách model ưu tiên (0ms trễ tìm model!)
  for (const model of primaryOrder.slice(0, instant ? 2 : 3)) {
    const res = await requestGroqModel(groqKey, model, parts, expectJson, reqOpts);
    if (res.ok) return { ok: true, data: res.data, model: res.model };
    errors.push(res.error);
  }

  // 2. Chỉ dò thêm model trên tài khoản nếu tất cả model chính thất bại
  if (!hasImages && !instant) {
    const discovered = await discoverGroqModels(groqKey);
    const extras = discovered.filter((m) => !preferred.includes(m));
    for (const model of extras.slice(0, 2)) {
      const res = await requestGroqModel(groqKey, model, parts, expectJson, reqOpts);
      if (res.ok) return { ok: true, data: res.data, model: res.model };
      errors.push(res.error);
    }
  }

  return { ok: false, errors };
}

// =============================================================================
// GEMINI ENGINE (DỰ PHÒNG)
// =============================================================================
async function discoverGeminiModels(apiKey, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedGeminiModels.models && now - cachedGeminiModels.at < 10 * 60 * 1000) {
    return cachedGeminiModels.models;
  }

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
      headers: { 'X-goog-api-key': apiKey },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));

    const blockedPattern =
      /embedding|imagen|image|veo|tts|audio|robotics|omni|live|computer-use|deep-research|aqa|bison|gecko|learnlm|nano|thinking-exp|gemini-2\.5-flash$|gemini-2\.0/i;

    const allNames = (data.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          typeof m.name === 'string' &&
          !blockedPattern.test(m.name.replace(/^models\//, ''))
      )
      .map((m) => m.name.replace(/^models\//, ''));

    const geminiLite = allNames.filter((n) => /^gemini/i.test(n) && /lite/i.test(n));
    const geminiFlash = allNames.filter((n) => /^gemini/i.test(n) && /flash/i.test(n) && !/lite/i.test(n));
    const gemmaBig = allNames
      .filter((n) => /^gemma-3-(27b|12b)/i.test(n))
      .sort((a, b) => (b.includes('27b') ? 1 : 0) - (a.includes('27b') ? 1 : 0));
    const geminiOther = allNames.filter((n) => /^gemini/i.test(n) && !/flash/i.test(n));

    const ordered = Array.from(new Set([...geminiLite, ...geminiFlash, ...gemmaBig, ...geminiOther]));
    cachedGeminiModels = { models: ordered, at: now };
    return ordered;
  } catch {
    return [];
  }
}

async function requestGeminiModel(apiKey, model, parts, expectJson, timeoutMs = 45000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const isGemma = /^gemma/i.test(model);
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3,
      ...(expectJson && !isGemma ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (netErr) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      error: `[${model}] Lỗi mạng/timeout: ${netErr.message}`,
    };
  }
  clearTimeout(timer);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    if (response.status === 404) {
      modelCooldown.set(model, Date.now() + 30 * 60 * 1000);
    } else if (response.status === 429) {
      modelCooldown.set(model, Date.now() + 5 * 60 * 1000);
    } else if (response.status === 503) {
      modelCooldown.set(model, Date.now() + 45 * 1000);
    }
    return { ok: false, status: response.status, error: `[${model}] (${response.status}): ${msg}` };
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    return { ok: false, status: 200, error: `[${model}] Trả về nội dung trống.` };
  }

  if (!expectJson) {
    return { ok: true, data: text, model };
  }

  try {
    return { ok: true, data: JSON.parse(cleanJsonString(text)), model };
  } catch {
    return { ok: false, status: 200, error: `[${model}] JSON chưa chuẩn hoặc bị cắt.` };
  }
}

async function callGemini({ parts, expectJson = true, preferReasoning = false, instant = false, maxTokens = 8000 }) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const errorLog = [];

  if (!groqKey && !geminiKey) {
    throw new Error('Thiếu biến môi trường GROQ_API_KEY hoặc GEMINI_API_KEY trên Vercel.');
  }

  // 1. Ưu tiên Groq (nhanh, ổn định, không bị 503)
  if (groqKey) {
    const groqRes = await callGroq({ parts, expectJson, preferReasoning, instant, maxTokens });
    if (groqRes.ok) return groqRes.data;
    errorLog.push(...groqRes.errors);
  }

  // 2. Dự phòng Google Gemini
  if (geminiKey) {
    const preferred = preferReasoning ? GEMINI_REASONING_MODELS : GEMINI_LITE_MODELS;
    const now = Date.now();
    const readyNow = preferred.filter((m) => (modelCooldown.get(m) || 0) <= now);
    const coolingDown = preferred.filter((m) => (modelCooldown.get(m) || 0) > now);
    const orderedToTry = [...readyNow, ...coolingDown];

    for (const model of orderedToTry.slice(0, instant ? 2 : 5)) {
      const res = await requestGeminiModel(geminiKey, model, parts, expectJson, instant ? 12000 : 45000);
      if (res.ok) return res.data;
      errorLog.push(res.error);
    }
  }

  throw new Error(`Không gọi được AI. Chi tiết: ${errorLog.slice(0, 3).join(' | ')}`);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Health-check: mở https://lernplan-2028.vercel.app/api/gemini để kiểm tra Groq + tốc độ phản hồi
  if (req.method === 'GET') {
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    const t0 = Date.now();
    const report = {
      ok: false,
      activeEngine: null,
      latencyMs: null,
      groqConfigured: Boolean(groqKey),
      geminiConfigured: Boolean(geminiKey),
    };

    if (groqKey) {
      const groqRes = await callGroq({ parts: [{ text: 'Reply OK' }], expectJson: false, instant: true });
      report.latencyMs = Date.now() - t0;
      report.groq = groqRes.ok
        ? { ok: true, model: groqRes.model, reply: groqRes.data }
        : { ok: false, errors: groqRes.errors };
      if (groqRes.ok) {
        report.ok = true;
        report.activeEngine = groqRes.model;
      }
    }

    if (geminiKey && !report.ok) {
      const discovered = await discoverGeminiModels(geminiKey, true);
      const probes = [];
      for (const model of discovered.slice(0, 4)) {
        const probe = await requestGeminiModel(geminiKey, model, [{ text: 'Reply OK' }], false, 12000);
        probes.push({ model, ok: probe.ok, reply: probe.ok ? probe.data : probe.error });
        if (probe.ok) {
          report.ok = true;
          report.activeEngine = model;
          report.latencyMs = Date.now() - t0;
          break;
        }
      }
      report.gemini = { probes, availableTextModels: discovered };
    }

    return res.status(200).json(report);
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
      'filter_pdf_pages',
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
    // ACTION 0: TỰ ĐỘNG LỌC TRANG NHÁP & GOM CHỦ ĐỀ TỪ FILE PDF ONENOTE (CÓ VISION ĐỌC ẢNH)
    // =========================================================================
    if (action === 'filter_pdf_pages') {
      const { fileName = 'OneNote.pdf', pages = [], pageImages = [], existingSubjects = [] } = payload || {};
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: 'File PDF không có trang nào để phân tích.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ${s.title_de} (${s.title_vn})`).join('\n')
        : '(Chưa có môn nào)';

      const attachedImgNums = new Set((Array.isArray(pageImages) ? pageImages : []).map((im) => Number(im.pageNum)));

      const pagesDigest = pages
        .map((p) => {
          const flags = [];
          if (p.isBlank) flags.push('TRANG TRẮNG THẬT SỰ');
          else if (p.hasVisualContent) flags.push('CÓ HÌNH ẢNH / PHIẾU BÀI TẬP / SƠ ĐỒ');
          if (attachedImgNums.has(Number(p.pageNum))) flags.push('ĐÃ ĐÍNH KÈM ẢNH BÊN DƯỚI ĐỂ BẠN ĐỌC TRỰC TIẾP');
          else if (!p.isBlank && p.charCount < 160) flags.push('TRANG ẢNH CHƯA ĐÍNH KÈM — MẶC ĐỊNH GIỮ LẠI');

          const preview = p.textPreview
            ? p.textPreview.slice(0, 700)
            : p.isBlank
            ? '(Trang trắng hoàn toàn)'
            : attachedImgNums.has(Number(p.pageNum))
            ? '(Chữ nằm trong ảnh/PDF printout — HÃY ĐỌC TRỰC TIẾP ẢNH ĐÍNH KÈM BÊN DƯỚI!)'
            : '(Chữ nằm trong ảnh/PDF printout — KHÔNG PHẢI TRANG TRỐNG, MẶC ĐỊNH GIỮ LẠI)';

          return `[Trang ${p.pageNum}] (${p.charCount} ký tự${flags.length ? ' | ' + flags.join(' · ') : ''}):\n${preview}`;
        })
        .join('\n---\n');

      const prompt = `Du bist ein erfahrener IHK-Fachlehrer für "Veranstaltungskaufmann" (Deutsch + Vietnamesisch).
Ein Azubi hat Seiten aus OneNote als PDF ("${fileName}", ${pages.length} Seiten) exportiert.
WICHTIG: Lehrer fügen in OneNote oft Arbeitsblätter, Fälle und Diagramme als Bilder/Ausdrucke ein (0 getippte Zeichen, aber VOLL mit wichtigem Text im Bild!).

DEINE AUFGABE — SORTIERE JEDE SEITE (1 bis ${pages.length}) SEHR SORGFÄLTIG:
1. IMMER BEHALTEN (in "groups"):
   - Seiten mit Theorie, Definitionen, Gesetzen (§ BGB, VStättV, UrhG, GEMA...), Schemata, Tabellen, Diagrammen.
   - SEHR WICHTIG: Seiten mit PRAXISFÄLLEN, SITUATIONEN, FALLBEISPIELEN, AUFGABEN & ÜBUNGSFÄLLEN (z. B. Situation 1–4, Fall A / Fall B, Fallstudien, Anwendungsfragen) — diese sind die WERTVOLLSTEN Inhalte für die IHK-Prüfung und MÜSSEN IMMER BEHALTEN werden!
   - Jede Seite mit "CÓ HÌNH ẢNH" / nicht-leere Seiten: Lies das angehängte Bild sorgfältig! Wenn ein Bild nicht angehängt wurde, die Seite aber NICHT "TRANG TRẮNG THẬT SỰ" ist -> IM ZWEIFEL IMMER BEHALTEN!
2. NUR DANN AUSSORTIEREN (in "skipped_pages"):
   - Seiten mit "TRANG TRẮNG THẬT SỰ" (komplett leer).
   - Reine Organisations-/Terminnotizen (Stundenplan, Pausen, "Hausaufgabe bis Montag", Sitzordnung ohne Fachstoff).
   - Zusammenhanglose Kritzeleien / leere Lückentext-Reste ohne brauchbare Fallbeschreibung oder Theorie.
3. GRUPPIERUNG:
   - Fasse zusammengehörige Seiten (z. B. Theorie + zugehörige Praxisfälle/Situationen) in sinnvolle Lektions-Pakete zusammen (maximal 4 Seiten pro Paket).
   - Wenn eine Seite viele Praxisfälle enthält (z. B. Situation 1–4, Fall A/B), darf sie entweder mit der Theorie zusammen (wenn insgesamt <= 4 Seiten) ODER als eigenes Paket "Praxisfälle & Lösungen" gruppiert werden.

Bestehende Fächer in der App:
${subjectListText}

SEITEN-ÜBERSICHT:
${pagesDigest}

ANTWORTE NUR ALS VALIDES JSON:
{
  "summary_vn": "Tóm tắt ngắn gọn bằng tiếng Việt (nêu rõ giữ mấy bài lý thuyết/tình huống thực tế, bỏ mấy trang trống/nháp)",
  "groups": [
    {
      "id": "g1",
      "title_de": "Thementitel Deutsch",
      "title_vn": "Tên bài học tiếng Việt",
      "subject_hint": "Tên môn học phù hợp",
      "pageNums": [1, 2, 3, 4],
      "reason_vn": "Lý do giữ lại (nêu cụ thể có lý thuyết gì, có các tình huống/câu hỏi thực tế nào)"
    }
  ],
  "skipped_pages": [
    {
      "pageNum": 5,
      "title_hint": "Mô tả ngắn trang bị bỏ",
      "reason_vn": "Lý do loại bỏ cụ thể"
    }
  ]
}`;

      const parts = [{ text: prompt }];
      if (Array.isArray(pageImages)) {
        for (const img of pageImages.slice(0, 5)) {
          if (img?.base64) {
            parts.push({ text: `>>> ẢNH XEM TRƯỚC TRANG ${img.pageNum} (HÃY ĐỌC KỸ NỘI DUNG TRONG ẢNH NÀY):` });
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: img.base64,
              },
            });
          }
        }
      }

      const result = await callGemini({ parts, expectJson: true, maxTokens: 4000 });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 1: NHẬP KIẾN THỨC ONENOTE / PDF / CHỮ VIẾT TAY + GIẢI ĐÁP TÌNH HUỐNG THỰC TẾ
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
Analysiere das bereitgestellte Unterrichtsmaterial (OneNote-Text, PDF-Seiten und/oder Fotos von Arbeitsblättern, Tafelanschrieben, Handschrift, Folien).

WICHTIGE REGELN:
1. HANDSCHRIFT, BILDER & ABKÜRZUNGEN KORRIGIEREN:
   - Lies ALLE angehängten Fotos/PDF-Seiten vollständig und sorgfältig aus (OCR)!
   - Wandle bruchstückhafte Stichpunkte oder Abkürzungen (VA, TN, MA, RO, BGB, VStättV, K, E, DB...) in vollständige, grammatikalisch saubere, prüfungstaugliche deutsche Sätze im IHK-Stil um, OHNE fachliche Originalbegriffe und Paragraphen zu verlieren!
2. PRAXISFÄLLE, SITUATIONEN & FRAGEN IM MATERIAL IMMER VOLLSTÄNDIG LÖSEN & ERKLÄREN (EXTREM WICHTIG!):
   - Wenn das Material konkrete Praxisbeispiele, Situationen, Fallstudien oder Aufgaben enthält (z. B. "Situation 1, 2, 3, 4", "Fall A", "Fall B", "Aufgabe 1", konkrete Rechts-/Kalkulationsfälle):
     * ÜBERSPRINGE SIE NIEMALS!
     * Erstelle dafür eigene, klar gegliederte Abschnitte in "sections" (z. B. "Praxisfälle & Lösungen: Situation 1–4 / Phân tích & Giải đáp chi tiết từng tình huống").
     * Gehe JEDEN einzelnen Fall / JEDE Situation konkret durch:
       1) Kurzfassung des Sachverhalts (DE + VN),
       2) Konkrete IHK-Antwort / Zuordnung / Berechnung,
       3) Präzise fachliche & rechtliche Begründung WARUM das in genau dieser Situation gilt (z. B. Gleichordnung vs. Über-/Unterordnung, konkrete Gesetze/Paragraphen/Begriffe) — komplett zweisprachig (DE + VN)!
     * Übernimm außerdem die besten konkreten Praxisfälle/Situationen direkt als Prüfungsfragen in "quiz_questions" (mit vollständiger Musterlösung & Erklärung)!
3. FACHZUORDNUNG & LEKTIONEN:
   - Ordne den Stoff einem bestehenden Fach zu ODER erstelle ein neues Fach.
   Bestehende Fächer:
   ${subjectListText}
   - Zerlege den Inhalt in 1 bis 3 logisch geordnete Lektionen: "foundation" (Nền tảng) -> "connected" (Liên kết) -> "advanced" (Mở rộng).
4. TABELLEN & DIAGRAMME (für Kalkulation, Rechnungswesen, Netzplan, Prozesse, Rechtsvergleiche):
   - Nutze saubere Markdown-Tabellen (| Spalte 1 | Spalte 2 |) direkt in content_de und content_vn, wenn Vergleiche (z. B. Privatrecht vs. Öffentliches Recht) oder Tabellen sinnvoll sind.
   - Optional "diagram_json" in EINEM dieser Formate (sonst null):
     a) Break-even-Point: {"type":"break_even","title":"...","kf":6000,"kv":6,"price":26,"unit":"Tickets","currency":"€"}
     b) Buchhaltung T-Konto: {"type":"t_konto","title":"...","account":"Bank / Kasse","soll":[{"label":"Anfangsbestand","amount":"10.000 €"}],"haben":[{"label":"Miete","amount":"2.500 €"}]}
     c) Prozess / Netzplan / Struktur: {"type":"flow","title":"...","steps":[{"title":"Schritt 1","subtitle":"Beschreibung","badge":"Tag 1 / Merkmal"}]}
     d) Balkendiagramm: {"type":"bar","title":"...","unit":"€","items":[{"label":"Miete","value":4000},{"label":"Technik","value":2500}]}
5. YOUTUBE-LERNVIDEOS:
   - Gib pro Abschnitt 2 präzise deutsche YouTube-Suchbegriffe in "video_keywords" an (z. B. Simpleclub, Studyflix, IHK-Erklärung).
6. FACHWORTSCHATZ (VOKABELN) PRO LEKTION:
   - Extrahiere 6 bis 12 wichtige deutsche Fachwörter/Verben/Adjektive aus jeder Lektion:
     * Bei Nomen IMMER exakten Artikel ("der" / "die" / "das") und Pluralform ("die ...") angeben.
     * Bei anderen Wortarten article: "", plural: "", word_type genau benennen ("Verb", "Adjektiv", "Abkürzung", "Redewendung").
     * Immer mit vietnamesischer Bedeutung, konkretem Praxisbeispiel (DE + VN) und Grammatik-/Prüfungshinweis.
7. ADAPTIVE TESTFRAGEN (UMFASSEND + PRAXISFÄLLE):
   - Kurze Lektion (1-2 Abschnitte): 5-6 Fragen
   - Mittlere Lektion (3-4 Abschnitte): 7-9 Fragen
   - Lange Lektion (5+ Abschnitte): 10-12 Fragen
   - Gute Mischung aus Multiple-Choice ("mc") und offenen Situations-/Rechenaufgaben ("essay"). Nutze bevorzugt die konkreten Situationen/Fälle aus dem Unterrichtsmaterial!
8. FLASHCARDS:
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
          "content_de": "Sauber ausformulierter Fachtext (inkl. Tabellen oder konkreter Falllösungen)",
          "content_vn": "Bản dịch & giải thích tiếng Việt rõ ràng",
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

${rawText.trim() ? `ZUSÄTZLICHER TEXT / HINWEIS:\n${rawText.trim()}` : 'Lies alle angehängten Fotos/PDF-Seiten vollständig aus (OCR), löse alle darin enthaltenen Situationen/Fälle/Aufgaben konkret und korrigiere Stichpunkte zu klarem Prüfungsdeutsch.'}`;

      const parts = [{ text: prompt }];
      if (Array.isArray(images)) {
        for (const img of images.slice(0, 5)) {
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

      const result = await callGemini({ parts, expectJson: true, maxTokens: 8000 });
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
    // ACTION 5: TRA TỪ ĐIỂN BẤM-ĐÂU-DỊCH-ĐÓ (CHẾ ĐỘ SIÊU TỐC ~200ms)
    // =========================================================================
    if (action === 'lookup_word') {
      const { word = '', contextSentence = '' } = payload || {};
      const cleaned = word.trim();
      if (!cleaned) {
        return res.status(400).json({ error: 'Thiếu từ cần tra.' });
      }

      const ctx = (contextSentence || '').slice(0, 220);
      const prompt = `Deutsch-Vietnamesisch Wörterbuch (Veranstaltungskaufmann IHK, B2).
Wort: "${cleaned}"
Satz: "${ctx}"
Gib NUR JSON zurück:
{"lemma_de":"Grundform ohne Artikel","article":"der|die|das oder leer bei Nicht-Nomen","plural":"die ... oder leer","word_type":"Nomen|Verb|Adjektiv|Adverb|Präposition|Abkürzung","meaning_vn":"Nghĩa tiếng Việt ngắn gọn, đúng ngữ cảnh","example_de":"1 câu ví dụ ngắn DE","example_vn":"Dịch ví dụ VN","grammar_note_vn":"1 dòng ghi chú giống/chia từ nếu cần"}`;

      const result = await callGemini({
        parts: [{ text: prompt }],
        expectJson: true,
        instant: true,
        maxTokens: 320,
      });
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

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
  { timeoutMs = 45000, maxTokens = 8000, temperature = 0.25, chatMessages = null } = {}
) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const messages =
    Array.isArray(chatMessages) && chatMessages.length > 0
      ? chatMessages
      : [
          ...(expectJson
            ? [{ role: 'system', content: 'Respond with valid JSON only. No markdown fences or extra text.' }]
            : []),
          { role: 'user', content: partsToOpenAIContent(parts) },
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
  parts = [],
  chatMessages = null,
  expectJson = true,
  preferReasoning = false,
  instant = false,
  maxTokens = 8000,
  temperature = null,
}) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqKey) return { ok: false, errors: [] };

  const hasImagesInParts = Array.isArray(parts) && parts.some((p) => p.inlineData?.data);
  const hasImagesInChat =
    Array.isArray(chatMessages) &&
    chatMessages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'));
  const hasImages = hasImagesInParts || hasImagesInChat;

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
    temperature: temperature !== null ? temperature : instant ? 0.1 : 0.25,
    chatMessages,
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

function openAIChatToGeminiBody(chatMessages, isGemma) {
  let systemText = '';
  const contents = [];

  for (const m of chatMessages) {
    if (m.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + (typeof m.content === 'string' ? m.content : '');
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    if (Array.isArray(m.content)) {
      for (const item of m.content) {
        if (item.type === 'image_url' && item.image_url?.url) {
          const match = String(item.image_url.url).match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        } else if (item.text) {
          parts.push({ text: item.text });
        }
      }
    } else if (typeof m.content === 'string' && m.content.trim()) {
      parts.push({ text: m.content });
    }
    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  if (systemText) {
    if (isGemma && contents.length > 0 && contents[0].role === 'user') {
      contents[0].parts.unshift({ text: `[SYSTEM INSTRUCTION]\n${systemText}\n\n` });
      return { contents };
    }
    return {
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
    };
  }
  return { contents };
}

async function requestGeminiModel(apiKey, model, parts, expectJson, timeoutMs = 45000, chatMessages = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const isGemma = /^gemma/i.test(model);
  const basePayload =
    Array.isArray(chatMessages) && chatMessages.length > 0
      ? openAIChatToGeminiBody(chatMessages, isGemma)
      : { contents: [{ role: 'user', parts }] };

  const body = {
    ...basePayload,
    generationConfig: {
      temperature: 0.35,
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

async function callGemini({
  parts = [],
  chatMessages = null,
  expectJson = true,
  preferReasoning = false,
  instant = false,
  maxTokens = 8000,
  temperature = null,
}) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const errorLog = [];

  if (!groqKey && !geminiKey) {
    throw new Error('Thiếu biến môi trường GROQ_API_KEY hoặc GEMINI_API_KEY trên Vercel.');
  }

  // 1. Ưu tiên Groq (nhanh, ổn định, không bị 503)
  if (groqKey) {
    const groqRes = await callGroq({ parts, chatMessages, expectJson, preferReasoning, instant, maxTokens, temperature });
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
      const res = await requestGeminiModel(
        geminiKey,
        model,
        parts,
        expectJson,
        instant ? 12000 : 45000,
        chatMessages
      );
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
      'ocr_pdf_page',
      'import_onenote',
      'generate_study_pack',
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
    // ACTION -1: OCR TỪNG TRANG PDF / ẢNH CHỤP BẢNG + CHỮ VIẾT TAY ĐÈ LÊN (CHUẨN RECHNUNGSWESEN)
    // =========================================================================
    if (action === 'ocr_pdf_page') {
      const { pageNum = 1, image = null, existingText = '' } = payload || {};
      if (!image?.base64) {
        return res.status(400).json({ error: 'Thiếu dữ liệu ảnh trang PDF để đọc OCR.' });
      }

      const prompt = `Du bist ein hochpräzises OCR-System für deutsche Berufsschul-Unterlagen (Veranstaltungskaufmann IHK — inkl. Rechnungswesen, Kalkulation, Recht, BWL/VWL, KSK).
Lies diese EINE Seite (Seite ${pageNum}) VOLLSTÄNDIG, WORTGETREU und LÜCKENLOS aus!

STRENGE REGELN:
1. NICHTS KÜRZEN UND NICHTS ÜBERSPRINGEN:
   - Lies JEDE Überschrift, JEDEN Theorie-Absatz, JEDE Aufzählung (z. B. "Was gehört dazu / Was gehört NICHT dazu"), JEDE Situation, JEDE einzelne Aufgabe (Aufgabe 1, 2, 3, 4, 5, 6, 7...) und JEDES Formular/Schaubild komplett ab!
   - Lies SOWOHL gedruckten Text ALS AUCH alle darüber oder an den Rand geschriebenen handschriftlichen Notizen (blaue/rote/lila Tinte) aus und kennzeichne Handschrift klar mit [Handschrift: ...].
2. ZAHLEN, DATEN, ZEITSTRAHLEN & RECHNUNGSWESEN:
   - Übernimm JEDE Zahl, JEDES Datum (z. B. 01.04.–31.03., 31. März, 300.000,00 €, 4,1%, 950,00 €/mtl.) und JEDEN Paragraphen (§ 25 KSVG, § 28p SGB IV...) EXAKT ohne Rundung oder Veränderung!
   - Bei Zeitstrahlen/Diagrammen/T-Konten/Bilanz/GuV: beschreibe alle Zeiträume, Pfeile, Soll/Haben-Einträge und Summen präzise.
3. Wenn die Seite wirklich KOMPLETT leer ist (nur leeres Karopapier ohne Aufgabe/Text), antworte exakt mit: [[EMPTY_PAGE]]
4. Antworte NUR mit dem sauber strukturierten deutschen Originaltext (kein JSON, keine Einleitung).${
        existingText?.trim()
          ? `\n\nBereits maschinell erkannter Teiltext (bitte VOLLSTÄNDIG erhalten und um alle fehlenden Bild-, Tabellen-, Zeitstrahl-, Formular- & Handschrift-Teile ergänzen):\n${existingText.trim().slice(0, 2600)}`
          : ''
      }`;

      const parts = [
        { text: prompt },
        {
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.base64,
          },
        },
      ];

      const text = await callGemini({ parts, expectJson: false, maxTokens: 4000 });
      const cleanedText = String(text || '').trim();
      const isEmpty = cleanedText === '[[EMPTY_PAGE]]' || cleanedText.length < 10;
      return res.status(200).json({
        data: {
          pageNum,
          text: isEmpty ? '' : cleanedText,
          isEmpty,
        },
      });
    }

    // =========================================================================
    // ACTION 0: TỰ ĐỘNG LỌC TRANG NHÁP & GOM CHỦ ĐỀ TỪ TOÀN BỘ NỘI DUNG ĐÃ ĐỌC OCR
    // =========================================================================
    if (action === 'filter_pdf_pages') {
      const { fileName = 'OneNote.pdf', pages = [], existingSubjects = [], targetSubjectName = '' } = payload || {};
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: 'File PDF không có trang nào để phân tích.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ${s.title_de} (${s.title_vn})`).join('\n')
        : '(Chưa có môn nào)';

      const pagesDigest = pages
        .map((p) => {
          const textBody = (p.textPreview || '').trim();
          const status = p.isBlank || !textBody ? 'TRANG TRẮNG' : `${p.charCount || textBody.length} ký tự`;
          return `[Trang ${p.pageNum}] (${status}):\n${textBody ? textBody.slice(0, 1400) : '(Trang trống hoàn toàn)'}`;
        })
        .join('\n---\n');

      const prompt = `Du bist ein erfahrener IHK-Fachlehrer für "Veranstaltungskaufmann" (Deutsch + Vietnamesisch).
Ein Azubi hat Seiten aus OneNote als PDF ("${fileName}", ${pages.length} Seiten) exportiert. Alle Seiten wurden bereits per OCR vollständig ausgelesen.

DEINE AUFGABE — SORTIERE JEDE SEITE (1 bis ${pages.length}) PRÄZISE:
1. IMMER BEHALTEN (in "groups"):
   - Jede Seite mit Theorie, Definitionen, Gesetzen (§ BGB, KSVG, VStättV, UrhG, GEMA...), Schemata, Tabellen, Formularen, Diagrammen.
   - EXTREM WICHTIG: Jede Seite mit PRAXISFÄLLEN, SITUATIONEN, RECHENAUFGABEN, BUCHUNGSSÄTZEN, T-KONTEN, BILANZ/GuV oder HANDSCHRIFTLICHEN LEHRER-LÖSUNGEN!
2. NUR AUSSORTIEREN (in "skipped_pages"):
   - Komplett leere Seiten ("TRANG TRẮNG") oder reines leeres Karopapier ohne neue Theorie/Aufgabe.
   - Reine Organisations-/Terminnotizen (Pausen, "Hausaufgabe bis Montag", Sitzordnung ohne Fachstoff).
3. SMARTE GRUPPIERUNG (DAMIT DIE LEHRKRAFT-ERKLÄRUNG AUSFÜHRLICH BLEIBT):
   - Packe maximal 1–2 sehr dichte Seiten (oder bis zu 3 lockere Seiten) in EIN Paket!
   - Wenn eine Seite extrem viel Theorie + eine Situation enthält (z. B. Seite 1 mit Theorie + Situation + Organisation/Meldefristen) und Seite 2 eine eigene Rechen-Situation mit Aufgabe 1–7 hat -> mache daraus am besten 2 getrennte Pakete, damit JEDES Paket zu 100% vollständig gelehrt, übersetzt, analysiert und gelöst wird (nichts wird gekürzt!).

FACHZUORDNUNG (SEHR WICHTIG):
${
  targetSubjectName
    ? `- Der Schüler hat das Zielfach FEST AUSGEWÄHLT: "${targetSubjectName}". Setze "subject_hint" bei JEDEM Paket exakt auf "${targetSubjectName}"!`
    : `- Ordne jedes Paket einem der bestehenden Hauptfächer zu. Erfinde KEINE Unterthemen als Fachname und übernimm NIEMALS Lehrerkürzel wie "_ZeH", "_HsA", "_GeM", "_MuC", "_DoR", "_ScT", "_MaS", "_KiK"!
- Typische Hauptfächer (Berufsschule Veranstaltungskaufmann):
  * VKO · Veranstaltungskonzeption & -organisation
  * BWT · Betriebswirtschaftliche Themen
  * RW · Rechnungswesen
  * BuB · Recht & Betriebliche Grundlagen
  * IuF · Information & Finanzierung
  * Mt · Märkte & Marketing
  * PuG · Politik und Gesellschaft
  * D · Deutsch & Kommunikation`
}
Bestehende Fächer in der App:
${subjectListText}

VOLLSTÄNDIGE SEITEN-ÜBERSICHT:
${pagesDigest}

ANTWORTE NUR ALS VALIDES JSON:
{
  "summary_vn": "Tóm tắt ngắn gọn bằng tiếng Việt (nêu rõ giữ mấy bài lý thuyết/bài tập, bỏ mấy trang trống/nháp)",
  "groups": [
    {
      "id": "g1",
      "title_de": "Thementitel Deutsch",
      "title_vn": "Tên bài học tiếng Việt",
      "subject_hint": "Tên môn học phù hợp",
      "pageNums": [1],
      "reason_vn": "Mô tả cụ thể nội dung của các trang này"
    }
  ],
  "skipped_pages": [
    {
      "pageNum": 3,
      "title_hint": "Mô tả ngắn trang bị bỏ",
      "reason_vn": "Lý do loại bỏ cụ thể"
    }
  ]
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true, maxTokens: 4000 });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 1: NHẬP KIẾN THỨC CHẾ ĐỘ GIÁO VIÊN KÈM 1-1 (ĐỌC HẾT FILE -> DỊCH -> PHÂN TÍCH ĐỀ -> GIẢNG & GIẢI TỪNG BƯỚC)
    // =========================================================================
    if (action === 'import_onenote') {
      const {
        rawText = '',
        images = [],
        existingSubjects = [],
        targetSubjectId = null,
        targetSubjectName = '',
        teachingOnly = false,
      } = payload || {};

      if (!rawText.trim() && (!Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: 'Vui lòng dán ghi chú hoặc tải lên ít nhất 1 ảnh.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ID: "${s.id}" | DE: "${s.title_de}" | VN: "${s.title_vn}"`).join('\n')
        : '(Chưa có môn học nào)';

      const prompt = `Du bist ein herausragender, geduldiger und extrem gründlicher **Privatlehrer (IHK-Fachlehrer)** für "Veranstaltungskaufmann / Veranstaltungskauffrau" in Deutschland, der perfekt Deutsch und Vietnamesisch spricht.

WICHTIGSTER GRUNDSATZ (BITTE GENAU VERSTEHEN!):
Der Schüler hat das hochgeladene PDF/Foto **NOCH KEIN EINZIGES WORT SELBST GELESEN**!
Deine Aufgabe ist NICHT, wie ein Lösungs-Bot nur kurz das Endergebnis auszuspucken!
Deine Aufgabe ist es, **das GESAMTE Dokument stellvertretend für den Schüler komplett aufzubereiten, zu übersetzen, wie ein echter Lehrer verständlich zu erklären, Aufgabenstellungen vollständig wiederzugeben & zu analysieren, und erst DANN Schritt für Schritt jede einzelne Aufgabe zu lösen!**

PFLICHT-AUFBAU DER ABSCHNITTE ("sections") — STRIKT EINHALTEN:
Erstelle für das Material **3 bis 6 klar strukturierte, tiefgehende Abschnitte** in dieser logischen Lehrer-Reihenfolge (je nachdem, was im Dokument vorkommt):

1. **THEORIE-ABSCHNITTE (wenn das Dokument Theorie, Definitionen, Gesetze, Listen, Fristen, Organisation, Regeln enthält):**
   - **NICHTS WEGLASSEN!** Übernimm JEDEN wichtigen Themenblock aus dem Dokument in eigene, übersichtliche Abschnitte (z. B. Abschnitt 1: *Bemessungsgrundlage — Was gehört dazu & was NICHT?*; Abschnitt 2: *Organisation der KSK, Meldebogen & Betriebsprüfung durch die DRV*).
   - **In "content_de":** Präsentiere das komplette deutsche Fachwissen aus dem Dokument sauber geordnet (mit Zwischenüberschriften \`###\`, Aufzählungen oder Markdown-Tabellen, z. B. \`| Gehört zur BMG (Tính phí) | Gehört NICHT zur BMG (Không tính phí) |\`), inklusive aller Paragraphen (§), Fristen und Beträge!
   - **In "content_vn":**
     * **Bản dịch đầy đủ sang tiếng Việt** (sát nghĩa từng ý trong phần tiếng Đức, không cắt bớt).
     * **Giáo viên giảng dễ hiểu (Hiểu bản chất):** Giải thích lại bằng ngôn ngữ đời thường gần gũi (*"Nói nôm na là..."*, *"Tại sao luật lại quy định như vậy?"*, *"Mẹo phân biệt nhanh để không bị lừa khi đi thi"*).

2. **AUFGABENSTELLUNG & DE-ANALYSE (IMMER Pflicht, sobald im Dokument eine Situation, ein Fall, Zahlen/Daten oder Aufgaben 1..N stehen!):**
   - Erstelle dafür einen **EIGENEN Abschnitt** (z. B. *"Original-Situation & Aufgabenstellung aus dem Dokument / Nguyên văn Đề bài & Phân tích đề"*), BEVOR du die Lösung zeigst!
   - **In "content_de":**
     * Gib die **VOLLSTÄNDIGE Original-Situation**, ALLE gegebenen Daten/Zahlen/Zeiträume (am besten übersichtlich als Liste oder Tabelle!) und **JEDE EINZELNE Aufgabenfrage** (Aufgabe 1, Aufgabe 2, ..., Aufgabe 7 bzw. Fall A, Fall B) originalgetreu wieder!
   - **In "content_vn":**
     * **Dịch trọn vẹn 100% Tình huống, Bảng dữ kiện & từng câu hỏi Aufgabe 1..N sang tiếng Việt** để học viên đọc hiểu đề mà không cần mở file PDF gốc.
     * **Phân tích đề bài (Góc nhìn giáo viên):** Chỉ rõ đề bài đang yêu cầu làm gì, đâu là **dữ kiện dùng để tính**, đâu là **thông tin bẫy/nhiễu phải loại bỏ**, và những quy tắc ngầm phải chú ý trước khi bấm máy (VD: *kỳ đóng ứng trước KSK chạy từ 01.04 đến 31.03 chứ không phải 01.01*, hay *chi phí nào thuộc BMG, chi phí nào loại*).

3. **SCHRITT-FÜR-SCHRITT-LÖSUNG ZU JEDER EINZELNEN AUFGABE (Giải chi tiết từng câu, không bỏ sót câu nào!):**
   - Erstelle danach **1 bis 2 eigene Lösungs-Abschnitte** (z. B. *"Schritt-für-Schritt-Lösung: Aufgabe 1–4 (Abrechnung Jahr X)"* und *"Schritt-für-Schritt-Lösung: Aufgabe 5–7 (Abrechnung Jahr Y)"* oder *"Ausführliche Lösung der Situation"*).
   - **VERBOTE:** Löse NIEMALS nur 1 Beispielaufgabe und lasse die anderen weg! Bearbeite **JEDE EINZELNE Aufgabe / JEDEN einzelnen Posten** aus dem Dokument der Reihe nach!
   - Für JEDE Aufgabe / JEDEN Rechenschritt zeige klar:
     1) **Yêu cầu câu hỏi** (nhắc lại ngắn câu đang giải)
     2) **Công thức / Quy tắc áp dụng** (dùng LaTeX chuẩn \`$$...$$\` hoặc \`$...$\` để app hiển thị phân số đẹp)
     3) **Thay số & Kết quả** (định dạng số kiểu Đức chính xác, VD: \`12.000,00 €\`)
     4) **Giải thích TẠI SAO làm bước này** (như giáo viên giảng cặn kẽ)
     5) **Bấm máy Casio fx-580VN X:** ghi chính xác tổ hợp phím trong backtick, tận dụng phím phân số \`[ ■/□ ]\` + \`[ ▼ ]\`, nối phép tính bằng \`[ Ans ]\`, chuyển thập phân \`[ S⇔D ]\`, và \`SOLVE\` (\`[ x ]\`, \`[ ALPHA ] [ CALC ]\`, \`[ SHIFT ] [ CALC ] [ = ]\`) cho bài tìm ẩn!

4. **RECHNUNGSWESEN, TABELLEN & DIAGRAMME ("diagram_json"):**
   - Buchungssätze als Markdown-Tabelle im Grundbuch-Format (\`| Nr. | Soll-Konto | Betrag (€) | an | Haben-Konto | Betrag (€) | Begründung |\`).
   - Vergleiche & Kalkulationen als saubere Markdown-Tabellen.
   - Nutze "diagram_json" aktiv, wenn ein Schaubild, eine Bilanz/GuV/T-Konto, ein Ablauf/Zeitstrahl ("flow") oder ein Diagramm das Verständnis erleichtert (sonst null):
     a) Einzelnes T-Konto / Bilanz / GuV: {"type":"t_konto","title":"...","account":"...","leftHeader":"Soll","rightHeader":"Haben","soll":[{"label":"...","amount":"..."}],"haben":[{"label":"...","amount":"..."}],"totalLeft":"...","totalRight":"..."}
     b) Mehrere T-Konten: {"type":"multi_t_konto","title":"...","accounts":[...]}
     c) Break-even: {"type":"break_even","title":"...","kf":6000,"kv":6,"price":26,"unit":"Tickets","currency":"€"}
     d) Angebot & Nachfrage: {"type":"supply_demand","title":"...","xLabel":"Menge","yLabel":"Preis (€)","eqPrice":50,"eqQty":400,"maxPrice":100,"maxQty":800}
     e) Prozess / Zeitstrahl / Ablauf: {"type":"flow","title":"...","steps":[{"title":"...","subtitle":"...","badge":"..."}]}
     f) Balkendiagramm: {"type":"bar","title":"...","unit":"€","items":[{"label":"...","value":4000}]}

5. **STRENGE FACHZUORDNUNG (KEINE ZERSPLITTERUNG!):**
   ${
     targetSubjectId
       ? `- FESTES ZIELFACH: Setze "existing_subject_id" ZWINGEND auf "${targetSubjectId}" (${targetSubjectName || 'ausgewähltes Fach'}) und erfinde KEIN neues Fach!`
       : `- Wähle ZWINGEND eines der bestehenden Hauptfächer aus der Liste unten, wenn es thematisch passt!
   - Erstelle ein neues Fach NUR, wenn es ein eigenes Schulfach ist, im Format "KÜRZEL · Voller Fachname" (VKO, BWT, RW, BuB, IuF, Mt, PuG, D).
   - VERBOTEN: Keine engen Unterthemen als Fachname und NIEMALS Lehrerkürzel ("_ZeH", "_HsA", "_GeM", "_MuC", "_DoR", "_ScT", "_MaS", "_KiK")!`
   }
   Bestehende Fächer:
   ${subjectListText}

6. **LEKTIONSAUFBAU & YOUTUBE:**
   - Erstelle **genau 1 vollständige, tiefgehende Lektion** für dieses Paket (mit **mindestens 3 bis 6 ausführlichen Abschnitten** in "sections" — NIEMALS nur 1 kurzer Abschnitt!).
   - Gib pro Abschnitt 2 präzise deutsche YouTube-Suchbegriffe in "video_keywords" an.
${
  teachingOnly
    ? `7. **FOKUS NUR AUF DEN LEHRINHALT:**
   - Lasse "vocabularies", "flashcards" und "quiz_questions" als leere Arrays [] — diese werden direkt im nächsten Schritt separat in voller Länge erzeugt, damit du JETZT 100% deiner Kraft in das gründliche Lehren, Übersetzen, Analysieren und Schritt-für-Schritt-Lösen stecken kannst!`
    : `7. **VOKABELN, FLASHCARDS & TESTFRAGEN:**
   - Extrahiere 8–12 wichtige deutsche Fachwörter ("vocabularies", Nomen IMMER mit der/die/das & Plural), 6–8 zweisprachige "flashcards" und 6–8 "quiz_questions" (Mix aus "mc" und "essay").`
}

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
      "title_de": "Aussagekräftiger Lektionstitel Deutsch",
      "title_vn": "Tiêu đề bài học rõ ràng tiếng Việt",
      "level": "foundation",
      "overview_de": "Klarer Überblick: Was lernst du in dieser Lektion und welche Aufgaben/Theorie enthält das Dokument? (2-3 Sätze DE)",
      "overview_vn": "Tổng quan kiểu giáo viên: Bài này gồm những phần kiến thức & bài tập nào, học xong sẽ làm được gì (2-3 câu VN)",
      "sections": [
        {
          "heading_de": "1. Theorie & Grundlagen aus dem Dokument (bzw. konkreter Thementitel)",
          "heading_vn": "1. Kiến thức cốt lõi trong tài liệu (tiêu đề cụ thể)",
          "content_de": "Vollständige, sauber strukturierte deutsche Theorie aus dem Dokument (Markdown-Tabellen, Aufzählungen, Paragraphen, KEINE Kürzung!)",
          "content_vn": "Bản dịch đầy đủ sang tiếng Việt + Giảng giải bình dân cực dễ hiểu như giáo viên kèm 1-1",
          "diagram_json": null,
          "video_keywords": [
            {"label": "Video giải thích ngắn", "query": "deutsche YouTube Suchanfrage"}
          ]
        },
        {
          "heading_de": "2. Original-Situation & Aufgabenstellung aus dem Dokument",
          "heading_vn": "2. Nguyên văn Đề bài / Tình huống & Phân tích đề",
          "content_de": "Vollständiger Originaltext der Situation, ALLE gegebenen Zahlen/Daten/Tabellen und JEDE Aufgabenstellung (Aufgabe 1, 2, 3...)",
          "content_vn": "Dịch trọn vẹn 100% đề bài & bảng số liệu sang tiếng Việt + Giáo viên phân tích đề (chỉ rõ dữ kiện nào dùng, bẫy IHK nào cần tránh)",
          "diagram_json": null,
          "video_keywords": []
        },
        {
          "heading_de": "3. Schritt-für-Schritt-Lösung zu jeder Aufgabe",
          "heading_vn": "3. Hướng dẫn giải chi tiết từng câu + Bấm Casio fx-580VN X",
          "content_de": "Ausführliche Lösung für JEDE einzelne Aufgabe (Aufgabe 1, 2, 3...) mit Formeln in LaTeX ($$...$$), Rechenweg, Ergebnis und Begründung",
          "content_vn": "Giải chi tiết lần lượt từng câu một (Công thức -> Thay số -> Kết quả -> Giải thích TẠI SAO -> Bấm máy Casio fx-580VN X)",
          "diagram_json": null,
          "video_keywords": []
        }
      ],
      "vocabularies": [],
      "flashcards": [],
      "quiz_questions": []
    }
  ]
}

${rawText.trim() ? `VOLLSTÄNDIGES ORIGINALMATERIAL AUS DEM DOKUMENT (BITTE ALLES VOLLSTÄNDIG LEHREN, ÜBERSETZEN, ANALYSIEREN & LÖSEN — NICHTS ÜBERSPRINGEN!):\n${rawText.trim()}` : 'Lies alle angehängten Fotos vollständig aus (OCR), stelle erst Theorie & Original-Aufgabenstellung vollständig zweisprachig dar, analysiere die Aufgabe wie ein Lehrer und löse dann JEDEN einzelnen Punkt Schritt für Schritt inkl. Casio fx-580VN X.'}`;

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
      if (targetSubjectId && result && typeof result === 'object') {
        result.existing_subject_id = targetSubjectId;
      } else if (result?.subject?.title_de) {
        result.subject.title_de = String(result.subject.title_de)
          .replace(/[_-][A-ZÄÖÜ][a-zäöüß]{1,2}[A-ZÄÖÜ]\b/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 1B: TẠO TRỌN BỘ LUYỆN TẬP ĐẦY ĐỦ (TỪ VỰNG + FLASHCARDS + BÀI TEST) TỪ BÀI HỌC VỪA SOẠN
    // (Tách riêng bước này để Phase 1 dồn 100% token cho giảng bài sâu, không bao giờ bị lỗi "1 từ · 1 thẻ · 1 câu"!)
    // =========================================================================
    if (action === 'generate_study_pack') {
      const { lessonTitle = '', sectionsText = '' } = payload || {};
      if (!sectionsText.trim()) {
        return res.status(400).json({ error: 'Thiếu nội dung bài học để tạo bộ từ vựng, Flashcards & Test.' });
      }

      const prompt = `Du bist ein erfahrener IHK-Prüfer und Fachlehrer für "Veranstaltungskaufmann" (Deutsch + Vietnamesisch).
Erstelle auf Basis der folgenden vollständig ausgearbeiteten Lektion ein UMFANGREICHES ÜBUNGSPACKET (Vokabeln + Flashcards + Testfragen)!

LEKTION: "${lessonTitle}"

LEKTIONSINHALT:
${sectionsText.slice(0, 7500)}

STRENGE MINDESTMENGEN (BITTE UNBEDINGT EINHALTEN — NIEMALS NUR 1 EINTRAG!):
1. **"vocabularies"**: GENAU **8 bis 12** zentrale deutsche Fachbegriffe, Verben, Gesetzesbegriffe oder Abkürzungen aus dem Text:
   - Bei Nomen IMMER exakten Artikel ("der" / "die" / "das") und Plural ("die ...") angeben.
   - Bei anderen Wortarten article: "", plural: "", word_type genau benennen ("Verb", "Adjektiv", "Abkürzung", "Redewendung").
   - Immer mit präziser vietnamesischer Bedeutung, Event-Praxisbeispiel (DE + VN) und Grammatik-/Prüfungshinweis.
2. **"flashcards"**: GENAU **6 bis 8** prüfungsrelevante zweisprachige Flashcards (Definitionen, Regeln "Was zählt dazu / nicht dazu?", Fristen, Formeln, Kontenregeln).
3. **"quiz_questions"**: GENAU **6 bis 8** abwechslungsreiche Prüfungsfragen (4–5 Multiple-Choice "mc" mit je 4 Optionen + 2–3 offene Praxisfall-/Rechenaufgaben "essay"):
   - Bei Rechenaufgaben in "model_answer_vn" und "explanation_vn" IMMER den klaren Rechenweg UND die **Casio fx-580VN X** Tastenfolge (\`[ ■/□ ]\`, \`[ ▼ ]\`, \`[ Ans ]\`, \`[ S⇔D ]\`, \`SOLVE\`) angeben!
   - Nutze für mathematische Formeln sauberes LaTeX (\`$...$\` oder \`$$...$$\`).

ANTWORTE AUSSCHLIESSLICH MIT VALIDEM JSON:
{
  "vocabularies": [
    {
      "word_de": "Bemessungsgrundlage",
      "article": "die",
      "plural": "die Bemessungsgrundlagen",
      "word_type": "Nomen",
      "meaning_vn": "Cơ sở tính phí / căn cứ tính thuế",
      "example_de": "Die Bemessungsgrundlage der KSK umfasst alle Entgelte an selbstständige Künstler.",
      "example_vn": "Cơ sở tính phí KSK bao gồm mọi khoản thù lao trả cho nghệ sĩ tự do.",
      "grammar_note_vn": "Danh từ ghép giống cái (die Grundlage), hay viết tắt là BMG."
    }
  ],
  "flashcards": [
    {
      "category": "Fachbegriff",
      "front_de": "Begriff / Frage / Formel DE",
      "hint_vn": "Gợi ý ngắn VN",
      "back_de": "Präzise IHK-Antwort DE",
      "back_vn": "Giải thích & công thức VN",
      "example_de": "Praxisbeispiel DE",
      "example_vn": "Ví dụ VN"
    }
  ],
  "quiz_questions": [
    {
      "q_type": "mc",
      "question_de": "IHK-Frage DE",
      "question_vn": "Câu hỏi VN",
      "options": [
        {"de": "Option A", "vn": "Dịch A"},
        {"de": "Option B", "vn": "Dịch B"},
        {"de": "Option C", "vn": "Dịch C"},
        {"de": "Option D", "vn": "Dịch D"}
      ],
      "correct_index": 0,
      "explanation_de": "Begründung DE",
      "explanation_vn": "Giải thích chi tiết (+ phím Casio fx-580VN X nếu có tính toán) VN"
    },
    {
      "q_type": "essay",
      "question_de": "Situations-/Rechenaufgabe DE",
      "question_vn": "Tình huống / Bài toán VN",
      "model_answer_de": "IHK-Musterlösung mit Rechenweg DE",
      "model_answer_vn": "Bài mẫu chi tiết + cách bấm Casio fx-580VN X VN",
      "explanation_de": "Bewertungshinweis DE",
      "explanation_vn": "Mẹo ăn điểm & tránh bẫy IHK VN"
    }
  ]
}`;

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true, maxTokens: 7000 });
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
- Offene Text-, Rechen- oder Zeichnungsaufgabe -> q_type: "essay" mit ausführlicher IHK-Musterlösung (inkl. Rechenweg UND bei Rechenaufgaben mit konkreter Casio fx-580VN X Tastenfolge wie [ ■/□ ], [ Ans ], [ S⇔D ] oder SOLVE in model_answer_vn!).
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
    // ACTION 3: GIẢI THÍCH DỄ HIỂU, VÍ DỤ THỰC TẾ & MẸO BẤM MÁY CASIO
    // =========================================================================
    if (action === 'explain_section') {
      const { lessonTitle, headingDe, contentDe } = payload || {};
      const prompt = `Du erklärst einem Auszubildenden (Veranstaltungskaufmann, Deutsch B2, Muttersprache Vietnamesisch) einen Berufsschul-Abschnitt extrem verständlich und praxisnah.
Wenn der Abschnitt Rechnungswesen, Kalkulation, Prozentrechnung oder Mathematik enthält: erkläre die Rechenlogik Schritt für Schritt UND gib die genaue **Casio fx-580VN X** Tastenfolge an (nutze gezielt [ ■/□ ] + [ ▼ ] für Brüche, [ Ans ] für Kettenrechnungen, [ S⇔D ] für Dezimalzahlen und bei Rückwärtsrechnungen SOLVE: [ x ], [ ALPHA ] [ CALC ], [ SHIFT ] [ CALC ] [ = ])!

Lektion: ${lessonTitle || ''}
Abschnitt: ${headingDe || ''}
Originaltext: ${contentDe || ''}

ANTWORTE NUR ALS VALIDES JSON:
{
  "explanation_de": "Sehr einfache, alltagsnahe Erklärung auf Deutsch (2-5 Sätze, bei Rechenthemen inkl. klarer Schrittfolge)",
  "explanation_vn": "Giải thích siêu dễ hiểu bằng tiếng Việt (tách rõ từng bước tính và tổ hợp phím Casio fx-580VN X nếu là bài tính toán)",
  "example_de": "Konkretes Praxisbeispiel / Zahlenbeispiel aus der Eventbranche auf Deutsch",
  "example_vn": "Bản dịch ví dụ thực tế / ví dụ số liệu tiếng Việt",
  "exam_tip_vn": "Mẹo ăn điểm thi IHK (kèm mẹo bấm Casio fx-580VN X như dùng [ ■/□ ], [ Ans ], SOLVE tránh sai số hoặc từ khóa tiếng Đức bắt buộc)"
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
- Vergib Teilpunkte für richtige Rechenwege, auch wenn am Ende ein kleiner Rundungsfehler passiert ist, und erkläre genau, in welcher Zeile/Achse der Fehler lag. Bei Rechenaufgaben füge in feedback_vn / musterloesung_vn kurz die richtige Casio fx-580VN X Tastenfolge ([ ■/□ ], [ Ans ], [ S⇔D ], SOLVE) hinzu.

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
      const prompt = `Erstelle 5 WEITERE, NEUE IHK-Prüfungsfragen (3 Multiple-Choice "mc" + 2 offene Aufgaben "essay") für "${lessonTitle}". Bei Rechenaufgaben gib in der vietnamesischen Lösung/Erklärung immer die genaue Casio fx-580VN X Tastenfolge ([ ■/□ ], [ Ans ], [ S⇔D ], SOLVE) an!
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

    // =========================================================================
    // ACTION 9: GIA SƯ AI RIÊNG THEO TỪNG MỤC HỌC / BÀI TEST / KHO CÂU SAI (LERNPLAN 2028 IHK TUTOR)
    // =========================================================================
    if (action === 'chat_tutor') {
      const {
        contextType = 'section',
        subjectName = '',
        lessonTitle = '',
        sectionHeading = '',
        sectionContentDe = '',
        sectionContentVn = '',
        diagramJson = null,
        extraContext = '',
        history = [],
        userMessage = '',
        image = null,
      } = payload || {};

      const cleanUserMsg = String(userMessage || '').trim();
      if (!cleanUserMsg && !image?.base64) {
        return res.status(400).json({ error: 'Vui lòng nhập câu hỏi hoặc đính kèm ảnh bài làm.' });
      }

      const diagramSummary = diagramJson
        ? `\n[SƠ ĐỒ / T-KONTO / BIỂU ĐỒ CỦA MỤC NÀY]:\n${JSON.stringify(diagramJson).slice(0, 1600)}`
        : '';

      const contextBlock = [
        subjectName ? `- Môn học: ${subjectName}` : '',
        lessonTitle ? `- Bài học: ${lessonTitle}` : '',
        sectionHeading ? `- Mục đang học: ${sectionHeading}` : '',
        sectionContentDe ? `\n[NỘI DUNG GỐC TIẾNG ĐỨC]:\n${String(sectionContentDe).slice(0, 3500)}` : '',
        sectionContentVn ? `\n[BẢN DỊCH / GIẢI THÍCH TIẾNG VIỆT]:\n${String(sectionContentVn).slice(0, 2600)}` : '',
        diagramSummary,
        extraContext ? `\n[DỮ LIỆU BỔ SUNG / CÂU HỎI LIÊN QUAN]:\n${String(extraContext).slice(0, 4200)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const systemPrompt = `Bạn là **Gia sư AI riêng của LernPlan 2028**, chuyên gia giảng dạy và chấm thi IHK ngành **Veranstaltungskaufmann / Veranstaltungskauffrau** (Tổ chức sự kiện tại Đức). Học viên là người Việt đang học Ausbildung (trình độ tiếng Đức B2), chuẩn bị cho kỳ thi tốt nghiệp IHK 2028 và dùng máy tính cầm tay **Casio fx-580VN X**.

NGỮ CẢNH CỐ ĐỊNH CỦA PHẦN HỌC HIỆN TẠI (${contextType === 'quiz' ? 'BÀI TEST' : contextType === 'mistakes' ? 'KHO CÂU SAI' : 'MỤC LÝ THUYẾT'}):
${contextBlock || '(Học viên đang hỏi câu hỏi chung trong ngành Veranstaltungskaufmann)'}

NGUYÊN TẮC TRẢ LỜI BẮT BUỘC:
1. **Đi thẳng vào vấn đề, dễ hiểu như một người anh/chị đi trước kèm 1-1:**
   - Giải thích bằng tiếng Việt tự nhiên, sắc bén, rõ bản chất ("tại sao lại thế?"), tuyệt đối không mở đầu kiểu rập khuôn sáo rỗng.
   - Bám sát 100% ngữ cảnh của mục đang học ở trên (trích dẫn đúng số liệu, tên tài khoản, điều luật hoặc câu hỏi mà học viên đang hỏi).
2. **Giữ chuẩn từ khóa tiếng Đức thi IHK:**
   - Luôn in đậm các thuật ngữ, điều luật và tên tài khoản gốc tiếng Đức (VD: **§ 631 BGB**, **Werkvertrag**, **Deckungsbeitrag**, **Soll an Haben**, **Vorsteuer**, **Schlussbilanzkonto (SBK)**, **Künstlersozialkasse (KSK)**) để học viên thuộc mặt chữ đi thi.
   - Khi học viên xin ví dụ, ưu tiên ví dụ thực tế sống động trong ngành tổ chức sự kiện tại Đức (concert, club event, hội nghị, thuê sân khấu/âm thanh ánh sáng, catering, ticketing, GEMA...).
3. **Trình bày chuẩn IHK cho Kế toán & Tính toán + HƯỚNG DẪN BẤM CASIO fx-580VN X:**
   - Công thức toán: viết bằng LaTeX chuẩn (\`$$...$$\` cho công thức lớn, \`$...$\` cho ký hiệu trong dòng, dùng \`\\frac{tử}{mẫu}\`) để app hiển thị phân số đẹp.
   - Định khoản kế toán (Buchungssatz): trình bày rõ **Soll an Haben** hoặc kẻ bảng Markdown (\`| Soll-Konto | Betrag | an | Haben-Konto | Betrag |\`).
   - Hễ có phép tính (Netto/Brutto 19%/7%, USt/VSt, Break-even, Kalkulation, Saldo T-Konto, Preiselastizität, KSK...): tách rõ **Công thức → Thay số → Kết quả** và luôn kèm mục **Bấm máy Casio fx-580VN X:** bằng ký hiệu phím đặt trong backtick (VD: \`[ ■/□ ] [ 6000 ] [ ▼ ] [ 26 ] [ - ] [ 6 ] [ = ]\`, \`[ Ans ]\`, \`[ S⇔D ]\`, hoặc \`SOLVE\`: \`[ x ]\`, \`[ ALPHA ] [ CALC ]\`, \`[ SHIFT ] [ CALC ] [ = ]\`).
4. **Hỗ trợ kiểm tra chủ động & chấm ảnh bài làm:**
   - Nếu học viên yêu cầu *"hỏi ngược lại 1 câu kiểm tra"*: ra đúng 1 câu tình huống/trắc nghiệm ngắn kiểu IHK bám sát mục này, CHƯA tiết lộ đáp án ngay — đợi học viên trả lời ở lượt sau rồi mới chấm và giải thích.
   - Nếu học viên gửi ảnh chụp bài làm viết tay hoặc đề bài: soi kỹ từng dòng/số/định khoản trong ảnh, chỉ rõ dòng nào đúng, dòng nào sai và sửa lại chuẩn IHK.
5. **Độ dài vừa phải, dễ đọc trên màn hình:** Chia mục rõ bằng gạch đầu dòng, chữ đậm và bảng khi cần; tránh viết một khối chữ dày đặc.`;

      // Chuẩn hóa lịch sử 12 tin nhắn gần nhất
      const safeHistory = (Array.isArray(history) ? history : [])
        .slice(-12)
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 2600),
        }));

      const latestUserContent = image?.base64
        ? [
            {
              type: 'text',
              text:
                cleanUserMsg ||
                'Hãy đọc kỹ ảnh bài làm / tài liệu này và giải thích chi tiết từng bước giúp tôi.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}`,
              },
            },
          ]
        : cleanUserMsg;

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...safeHistory,
        { role: 'user', content: latestUserContent },
      ];

      const replyText = await callGemini({
        chatMessages,
        expectJson: false,
        maxTokens: 2400,
        temperature: 0.35,
      });

      return res.status(200).json({
        data: {
          reply: String(replyText || '').trim(),
        },
      });
    }

    return res.status(400).json({ error: `Action không hợp lệ: ${action}` });
  } catch (err) {
    console.error('Gemini API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi gọi AI.' });
  }
}

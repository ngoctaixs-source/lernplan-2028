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

      const prompt = `Du bist ein hochpräzises OCR-System für deutsche Berufsschul-Unterlagen (Veranstaltungskaufmann IHK — inkl. Rechnungswesen, Kalkulation, Recht, BWL/VWL).
Lies diese EINE Seite (Seite ${pageNum}) VOLLSTÄNDIG, WORTGETREU und LÜCKENLOS aus!

STRENGE REGELN:
1. GEDRUCKTER TEXT + HANDSCHRIFTLICHE NOTIZEN (BLAUE/ROTE/LILA TINTE):
   - Lies SOWOHL den gedruckten Arbeitsblatt-Text ALS AUCH ALLE darüber oder an den Rand geschriebenen handschriftlichen Lösungen, Pfeile, Markierungen, Häkchen und Korrekturen der Lehrkraft vollständig aus!
   - Kennzeichne handschriftliche Lehrer-Notizen klar mit [Handschrift: ...], damit die Lösung der Lehrkraft exakt erhalten bleibt.
2. RECHNUNGSWESEN, T-KONTEN, BILANZ, GuV & BUCHUNGSSÄTZE:
   - Übernimm JEDE Zahl exakt im deutschen Format (z. B. 360.000,00 €, 14.328,50 €, 19% netto/brutto) — runde oder verändere NIEMALS Zahlen!
   - Bei Buchungssätzen: exakt notieren (z. B. "Wareneingang 400,00 + Vorsteuer 76,00 an Verbindlichkeiten LL 476,00").
   - Bei T-Konten / Bilanz / GuV / Schlussbilanzkonto: strukturiere klar nach Kontoname, Soll (links) vs. Haben (rechts) bzw. Aktiva vs. Passiva, inklusive AB, SBK, GuV-Saldo und Endsumme!
3. PRAXISFÄLLE & AUFGABEN:
   - Wenn auf der Seite "Situation 1, 2, 3, 4", "Fall A / Fall B", "Geschäftsfälle 1–11" oder Rechenaufgaben stehen, schreibe JEDEN einzelnen Punkt vollständig und ungekürzt ab!
4. SCHEMATA / DIAGRAMME / KURVEN:
   - Beschreibe Achsen, Kurven (Angebot/Nachfrage, Kosten/Erlöse, Break-even), Werte und Pfeilverbindungen präzise.
5. Wenn die Seite wirklich KOMPLETT leer ist, antworte exakt mit: [[EMPTY_PAGE]]
6. Antworte NUR mit dem sauber strukturierten deutschen Text (kein JSON, keine Einleitung).${
        existingText?.trim()
          ? `\n\nBereits maschinell erkannter Teiltext (bitte um alle fehlenden handschriftlichen Notizen, T-Konten, Zahlen & Diagramme ergänzen):\n${existingText.trim().slice(0, 1200)}`
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

      const text = await callGemini({ parts, expectJson: false, maxTokens: 3500 });
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
          return `[Trang ${p.pageNum}] (${status}):\n${textBody ? textBody.slice(0, 1100) : '(Trang trống hoàn toàn)'}`;
        })
        .join('\n---\n');

      const prompt = `Du bist ein erfahrener IHK-Fachlehrer für "Veranstaltungskaufmann" (Deutsch + Vietnamesisch).
Ein Azubi hat Seiten aus OneNote als PDF ("${fileName}", ${pages.length} Seiten) exportiert. Alle Seiten wurden bereits per OCR vollständig ausgelesen.

DEINE AUFGABE — SORTIERE JEDE SEITE (1 bis ${pages.length}) PRÄZISE:
1. IMMER BEHALTEN (in "groups"):
   - Jede Seite mit Theorie, Definitionen, Gesetzen (§ BGB, VStättV, UrhG, GEMA...), Schemata, Tabellen, Diagrammen.
   - EXTREM WICHTIG: Jede Seite mit PRAXISFÄLLEN, SITUATIONEN, RECHENAUFGABEN, BUCHUNGSSÄTZEN, T-KONTEN, BILANZ/GuV oder HANDSCHRIFTLICHEN LEHRER-LÖSUNGEN!
2. NUR AUSSORTIEREN (in "skipped_pages"):
   - Komplett leere Seiten ("TRANG TRẮNG").
   - Reine Organisations-/Terminnotizen (Pausen, "Hausaufgabe bis Montag", Sitzordnung ohne Fachstoff) oder völlig zusammenhanglose Kritzeleien.
3. SMARTE GRUPPIERUNG (DAMIT NICHTS ABGESCHNITTEN WIRD):
   - Packe maximal 2–3 dichte Seiten in EIN Paket!
   - Wenn eine Datei sowohl Theorie/Aufgabenstellung als auch umfangreiche Lösungen (T-Konten, GuV, Schlussbilanz oder Situation 1–4) enthält, teile sie sinnvoll auf (oder halte Aufgabenstellung + zugehörige Musterlösung in einem klaren Paket <= 3 Seiten), damit die KI JEDEN Rechenschritt ausführlich erklären kann!

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
  "summary_vn": "Tóm tắt ngắn gọn bằng tiếng Việt (nêu rõ giữ mấy bài/tình huống/bài tính toán, bỏ mấy trang trống/nháp)",
  "groups": [
    {
      "id": "g1",
      "title_de": "Thementitel Deutsch",
      "title_vn": "Tên bài học tiếng Việt",
      "subject_hint": "Tên môn học phù hợp",
      "pageNums": [1, 2],
      "reason_vn": "Mô tả cụ thể nội dung của các trang này"
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

      const result = await callGemini({ parts: [{ text: prompt }], expectJson: true, maxTokens: 4000 });
      return res.status(200).json({ data: result });
    }

    // =========================================================================
    // ACTION 1: NHẬP KIẾN THỨC ONENOTE / PDF / RECHNUNGSWESEN + CHUẨN IHK + BẤM MÁY CASIO
    // =========================================================================
    if (action === 'import_onenote') {
      const {
        rawText = '',
        images = [],
        existingSubjects = [],
        targetSubjectId = null,
        targetSubjectName = '',
      } = payload || {};

      if (!rawText.trim() && (!Array.isArray(images) || images.length === 0)) {
        return res.status(400).json({ error: 'Vui lòng dán ghi chú hoặc tải lên ít nhất 1 ảnh.' });
      }

      const subjectListText = existingSubjects.length
        ? existingSubjects.map((s) => `- ID: "${s.id}" | DE: "${s.title_de}" | VN: "${s.title_vn}"`).join('\n')
        : '(Chưa có môn học nào)';

      const prompt = `Du bist ein erfahrener IHK-Prüfer und Fachlehrer für "Veranstaltungskaufmann / Veranstaltungskauffrau" in Deutschland, der perfekt Deutsch und Vietnamesisch spricht.

AUFGABE:
Verarbeite das GESAMTE bereitgestellte Unterrichtsmaterial (ALLE Seiten, gedruckten Text UND handschriftliche Lehrer-Lösungen) vollständig zu hochwertigem, IHK-prüfungstauglichem Lernmaterial!

PFLICHTREGELN (SEHR WICHTIG):
1. ALLE SEITEN & HANDSCHRIFTLICHE LÖSUNGEN VOLLSTÄNDIG VERARBEITEN:
   - Lies JEDE Seite bis zum allerletzten Satz durch — stoppe NIEMALS nach Seite 1!
   - Wenn handschriftliche Lösungen der Lehrkraft enthalten sind (z. B. Eröffnungsbilanz, Buchungssätze, T-Konten, GuV, Schlussbilanz, Kalkulationen), prüfe jede Zahl rechnerisch nach und übernimm das exakte IHK-/Lehrer-Lösungsschema!
   - Korrigiere Abkürzungen (VA, TN, MA, RO, AB, SBK, EBK, GuV, VSt, USt, VLL, FLL, DB, Kf, Kv...) zu sauberem IHK-Prüfungsdeutsch, aber nenne die übliche Abkürzung in Klammern mit.
2. RECHENFÄCHER, BUCHFÜHRUNG & KALKULATION (EXTREM WICHTIG — IHK-STANDARD + SCHRITT-FÜR-SCHRITT + CASIO-TASCHENRECHNER):
   Wenn das Material Berechnungen, Buchführung (Rechnungswesen), Kalkulation, Prozent-/USt-Rechnung, Break-even, Preisbildung oder Preiselastizität enthält:
   a) **IHK-Norm-Darstellung:**
      - Buchungssätze IMMER als saubere Markdown-Tabelle im Grundbuch-Format:
        | Nr. | Soll-Konto | Betrag (€) | an | Haben-Konto | Betrag (€) | Begründung (Netto/USt/Brutto) |
      - Kalkulationsschemata (Handelskalkulation, Zuschlagskalkulation, Deckungsbeitragsrechnung) IMMER als saubere Markdown-Tabelle mit Spalten für Position, %, Rechenweg und Betrag (€).
      - Bilanz, GuV und T-Konten IMMER visuell über "diagram_json" (Typ "t_konto" oder "multi_t_konto") darstellen!
   b) **Kristallklare Schritt-für-Schritt-Erklärung (DE + VN):**
      - Erkläre JEDEN Rechenschritt so einfach, dass ein Azubi ihn sofort nachvollziehen kann:
        1. **Công thức (Formel):** z. B. Eigenkapital = Summe Aktiva − Schulden (Fremdkapital)
        2. **Thay số (Einsetzen):** 573.000 € − (195.000 € + 42.000 €)
        3. **Kết quả (Ergebnis):** = **336.000,00 €**
        4. **Giải thích bản chất (Warum?):** Warum steht das im Soll/Haben? Warum × 1,19 bzw. ÷ 1,19?
   c) **HƯỚNG DẪN BẤM MÁY TÍNH CASIO fx-580VN X (CHUẨN PHÍM MÁY THẬT — BẮT BUỘC KHI CÓ TÍNH TOÁN!):**
      - Der Azubi nutzt exakt das Modell **Casio fx-580VN X** (baugleich mit Casio fx-991DE X ClassWiz).
      - Füge bei JEDEM Rechenabschnitt im Text (besonders klar in content_vn, und kurz in content_de) einen eigenen Block **"Bấm máy Casio fx-580VN X:"** ein mit der EXAKTEN Tastenfolge in eckigen Klammern!
      - Nutze gezielt die Stärken des **Casio fx-580VN X**:
        * **Phím phân số \`[ ■/□ ]\`** (+ \`[ ▼ ]\` xuống mẫu, \`[ ▶ ]\` thoát phân số) cho mọi công thức chia / Break-even / Preiselastizität / Kalkulationsfaktor thay vì lồng nhiều dấu ngoặc rối mắt!
        * **Phím \`[ Ans ]\`** để nối phép tính liên tiếp (ví dụ tính Netto xong bấm thẳng \`[ × ] [ 0.19 ] [ = ]\` ra thuế mà không cần gõ lại số).
        * **Phím \`[ S⇔D ]\`** nhắc chuyển phân số sang số thập phân (nếu máy đang ở chế độ ToánV/ToánR).
        * **Tính năng \`SOLVE\`** (\`[ x ]\` để nhập ẩn, \`[ ALPHA ] [ CALC ]\` để gõ dấu \`=\`, rồi \`[ SHIFT ] [ CALC ]\` → \`[ = ]\`) cho các bài tính ngược tìm ẩn (VD: tìm giá bán p, tìm Eigenkapital, tính ngược Rabatt / Skonto, hoặc dò lại đáp án).
        * **Phím lưu biến \`[ STO ] [ A ]\`** (và gọi lại bằng \`[ ALPHA ] [ A ]\`) khi bài kế toán / BAB / Handelskalkulation có số trung gian phải dùng lại nhiều lần.
      - Beispiele für exakte **Casio fx-580VN X** Tastenfolgen:
        * Netto → 19% USt/VSt → Brutto nối bằng Ans: \`[ 5250 ] [ × ] [ 0.19 ] [ = ]\` → \`997,50 €\` (hiện phân số bấm \`[ S⇔D ]\`), hoặc tính thẳng Brutto: \`[ 5250 ] [ × ] [ 1.19 ] [ = ]\` → \`6.247,50 €\`
        * Brutto → Netto rồi lấy ngay thuế bằng Ans: \`[ 476 ] [ ÷ ] [ 1.19 ] [ = ]\` → \`400,00 €\`, bấm tiếp \`[ × ] [ 0.19 ] [ = ]\` → \`76,00 €\` (Lưu ý: tuyệt đối KHÔNG bấm \`- 19%\`!)
        * Break-even bằng phím phân số: \`[ ■/□ ] [ 6000 ] [ ▼ ] [ 26 ] [ - ] [ 6 ] [ = ]\` → \`300\`
        * Preiselastizität bằng phím phân số lồng nhau: \`[ ■/□ ] [ ■/□ ] [ x2 - x1 ] [ ▼ ] [ x1 ] [ ▼ ] [ ■/□ ] [ p2 - p1 ] [ ▼ ] [ p1 ] [ = ] [ S⇔D ]\`
        * Tính ngược / dò ẩn x bằng SOLVE (VD tìm giá vé p hòa vốn ở 300 vé): nhập \`[ 300 ] [ × ] [ ( ] [ x ] [ - ] [ 6 ] [ ) ] [ ALPHA ] [ CALC ] [ 6000 ]\`, bấm \`[ SHIFT ] [ CALC ] [ = ]\` → \`x = 26\`
3. PRAXISFÄLLE & SITUATIONEN VOLLSTÄNDIG LÖSEN:
   - Wenn das Material konkrete Fälle/Situationen enthält ("Situation 1–4", "Fall A/B", "Geschäftsfälle 1–11"), bearbeite JEDEN einzelnen Fall konkret mit Sachverhalt, IHK-Lösung und Begründung (DE + VN)!
4. VISUELLE DIAGRAMME, T-KONTEN & KURVEN ("diagram_json"):
   Nutze "diagram_json" aktiv für jeden Abschnitt, in dem ein Diagramm, eine Bilanz, ein GuV-Konto, mehrere T-Konten oder eine Marktkurve hilft! Erlaubte Formate (sonst null):
   a) **Einzelnes T-Konto / Bilanz / GuV** (mit IHK-Buchhalternase & Doppellinie):
      {"type":"t_konto","title":"Schlussbilanzkonto (SBK)","account":"Schlussbilanz","leftHeader":"Aktiva (Soll)","rightHeader":"Passiva (Haben)","soll":[{"label":"Betriebsgebäude","amount":"360.000,00 €"},{"label":"BGA","amount":"43.000,00 €"}],"haben":[{"label":"Eigenkapital","amount":"328.700,00 €"},{"label":"Darlehen","amount":"195.000,00 €"}],"totalLeft":"568.611,50 €","totalRight":"568.611,50 €"}
   b) **Mehrere T-Konten nebeneinander** (ideal für Hauptbuch-Übungen im Rechnungswesen!):
      {"type":"multi_t_konto","title":"Hauptbuch: Bestandskonten & GuV","accounts":[{"account":"Bank","leftHeader":"Soll","rightHeader":"Haben","soll":[{"label":"AB","amount":"18.000,00 €"},{"label":"4) Zinsen","amount":"1.500,00 €"}],"haben":[{"label":"3) Darlehen","amount":"10.000,00 €"},{"label":"SBK","amount":"14.328,50 €"}],"totalLeft":"26.640,00 €","totalRight":"26.640,00 €"},{"account":"GuV","leftHeader":"Soll (Aufwand)","rightHeader":"Haben (Ertrag)","soll":[{"label":"Löhne","amount":"1.200,00 €"}],"haben":[{"label":"Zinserträge","amount":"1.500,00 €"},{"label":"EK (Verlust)","amount":"7.300,00 €"}],"totalLeft":"8.800,00 €","totalRight":"8.800,00 €"}]}
   c) **Break-even-Point / Gewinnschwelle:**
      {"type":"break_even","title":"Break-even-Analyse","kf":6000,"kv":6,"price":26,"unit":"Tickets","currency":"€"}
   d) **Preisbildung / Angebot & Nachfrage / Marktgleichgewicht:**
      {"type":"supply_demand","title":"Marktpreisbildung & Gleichgewicht","xLabel":"Menge (Stück)","yLabel":"Preis (€)","eqPrice":50,"eqQty":400,"maxPrice":100,"maxQty":800,"priceLine":{"label":"Mindestpreis","value":70}}
   e) **Prozess / Ablauf / Kalkulations-Schritte:**
      {"type":"flow","title":"Ablauf Geschäftsgang (IHK)","steps":[{"title":"1. Eröffnungsbilanz","subtitle":"Aktiva = Passiva, EK berechnen","badge":"Schritt 1"},{"title":"2. Bestandskonten öffnen","subtitle":"AB eintragen","badge":"Schritt 2"}]}
   f) **Balkendiagramm / Kostenvergleich:**
      {"type":"bar","title":"Kostenstruktur","unit":"€","items":[{"label":"Miete","value":4000},{"label":"Technik","value":2500}]}
5. STRENGE FACHZUORDNUNG & LEKTIONEN (KEINE ZERSPLITTERUNG!):
   ${
     targetSubjectId
       ? `- FESTES ZIELFACH: Der Schüler hat das Fach ID "${targetSubjectId}" (${targetSubjectName || 'ausgewähltes Fach'}) verbindlich gewählt!
   - Setze "existing_subject_id" ZWINGEND auf "${targetSubjectId}" und erfinde KEIN neues Fach!`
       : `- Wähle ZWINGEND eines der bestehenden Hauptfächer aus der Liste unten, wenn es thematisch passt!
   - Erstelle ein neues Fach NUR, wenn es ein komplett eigenes Schulfach ist (z. B. PuG, VKO, BWT, RW, BuB, IuF, Mt, D).
   - VERBOTEN:
     * Erfinde NIEMALS enge Unterthemen als Fachname (z. B. NICHT "Privatrecht", NICHT "GuV-Konto", NICHT "Veranstaltungsrecht & Verträge", wenn ein Hauptfach wie "BuB · Recht & Betriebliche Grundlagen" oder "RW · Rechnungswesen" existiert!).
     * Übernimm NIEMALS Lehrerkürzel wie "_ZeH", "_HsA", "_GeM", "_MuC", "_DoR", "_ScT", "_MaS", "_KiK" in den Fachnamen!
     * Nutze bei einem neuen Schulfach immer das saubere Format "KÜRZEL · Voller Fachname" (z. B. "PuG · Politik und Gesellschaft", "VKO · Veranstaltungskonzeption & -organisation", "BWT · Betriebswirtschaftliche Themen", "RW · Rechnungswesen", "BuB · Recht & Betriebliche Grundlagen", "IuF · Information & Finanzierung", "Mt · Märkte & Marketing", "D · Deutsch & Kommunikation").`
   }
   Bestehende Fächer:
   ${subjectListText}
   - Erstelle 1 bis 2 logisch aufgebaute Lektionen ("foundation" -> "connected" -> "advanced").
6. YOUTUBE-LERNVIDEOS:
   - Gib pro Abschnitt 2 präzise deutsche YouTube-Suchbegriffe in "video_keywords" an (z. B. "Geschäftsgang mit Erfolgskonten einfach erklärt", "GuV Konto abschließen Studyflix").
7. FACHWORTSCHATZ (VOKABELN) PRO LEKTION:
   - Extrahiere 8 bis 14 wichtige deutsche Fachwörter/Verben/Abkürzungen aus ALLEN Seiten:
     * Bei Nomen IMMER exakten Artikel ("der" / "die" / "das") und Pluralform ("die ...") angeben.
     * Bei anderen Wortarten article: "", plural: "", word_type genau benennen ("Verb", "Adjektiv", "Abkürzung", "Redewendung").
     * Immer mit vietnamesischer Bedeutung, konkretem Praxisbeispiel (DE + VN) und Grammatik-/Prüfungshinweis.
8. UMFASSENDE TESTFRAGEN (INKL. RECHEN- & BUCHUNGSAUFGABEN):
   - Erstelle 6 bis 10 abwechslungsreiche Fragen (Mix aus "mc" und "essay"), inklusive konkreter Buchungssätze, Rechenaufgaben und Praxisfälle aus dem Material (in der Musterlösung ebenfalls Rechenweg + Casio-Tastenfolge angeben!).
9. FLASHCARDS:
   - Erstelle 6 bis 10 präzise zweisprachige Flashcards (inkl. Formeln, Kontenregeln, Buchungsregeln).

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
          "content_de": "Ausführlicher Fachtext im IHK-Standard (inkl. Markdown-Tabellen, Rechenwegen & Casio fx-580VN X Tastenfolge)",
          "content_vn": "Giải thích từng bước cực dễ hiểu bằng tiếng Việt (kèm bảng, cách tính và hướng dẫn bấm máy Casio fx-580VN X cụ thể)",
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
          "back_de": "IHK-Definition / Formel DE",
          "back_vn": "Định nghĩa / Công thức VN",
          "example_de": "Beispiel / Buchungssatz DE",
          "example_vn": "Ví dụ / Giải thích VN"
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
          "explanation_de": "Begründung / Rechenweg DE",
          "explanation_vn": "Giải thích / Cách bấm Casio fx-580VN X VN"
        },
        {
          "q_type": "essay",
          "question_de": "Situations-/Rechen-/Buchungsaufgabe DE",
          "question_vn": "Tình huống / Bài toán / Định khoản VN",
          "model_answer_de": "IHK-Musterlösung inkl. Rechenweg DE",
          "model_answer_vn": "Đáp án mẫu chi tiết + hướng dẫn bấm Casio fx-580VN X VN",
          "explanation_de": "Bewertungshinweis DE",
          "explanation_vn": "Lưu ý ăn điểm / tránh bẫy IHK VN"
        }
      ]
    }
  ]
}

${rawText.trim() ? `VOLLSTÄNDIGES UNTERRICHTSMATERIAL (BITTE ALLE SEITEN, HANDSCHRIFTLICHEN LÖSUNGEN, RECHENWEGE & FÄLLE VERARBEITEN):\n${rawText.trim()}` : 'Lies alle angehängten Fotos vollständig aus (OCR), übernimm alle handschriftlichen Lösungen, erkläre jeden Rechenschritt inkl. Casio-Tastenfolge und stelle T-Konten/Bilanz/Diagramme im IHK-Standard dar.'}`;

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
      // Khóa cứng môn học đích ở backend để AI tuyệt đối không thể tự tạo môn mới hay xếp nhầm môn
      if (targetSubjectId && result && typeof result === 'object') {
        result.existing_subject_id = targetSubjectId;
      } else if (result?.subject?.title_de) {
        // Loại bỏ sạch hậu tố tên viết tắt giáo viên (VD: _ZeH, _HsA, _GeM, _MuC, _DoR...) nếu AI lỡ dính vào
        result.subject.title_de = String(result.subject.title_de)
          .replace(/[_-][A-ZÄÖÜ][a-zäöüß]{1,2}[A-ZÄÖÜ]\b/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
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

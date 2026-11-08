// IA do ENEM Relâmpago: o token do Hugging Face fica só aqui, como segredo (HF_TOKEN e, opcional, HF_TOKEN_RESERVA).
// O app manda o contexto da questão e a conversa; a função monta o prompt, aplica limites e repassa ao Hugging Face.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const MODELS = ['google/gemma-3-27b-it:fastest', 'meta-llama/Llama-3.3-70B-Instruct:fastest'];
const TOKEN_ERRORS = [401, 402, 403, 429];
const ALLOWED_ORIGINS = ['https://guilherme15072006-commits.github.io', 'http://localhost:5173', 'http://localhost:4173'];
const SYSTEM = `Você é um tutor do ENEM. Responda em português do Brasil, de forma curta e simples, em no máximo 6 frases.
Explique o conteúdo e o raciocínio. Se o contexto trouxer o gabarito oficial, ele está certo: nunca o contradiga.
Se o contexto não trouxer o gabarito, não diga qual alternativa é a correta; ajude o aluno a pensar.
Se não tiver certeza de um fato, diga isso claramente.`;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-client-id',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});
const reply = (origin: string | null, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

interface Message { role: 'user' | 'assistant'; content: string }
function parseBody(raw: unknown): { context: string; messages: Message[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { context, messages } = raw as Record<string, unknown>;
  if (typeof context !== 'string' || context.length > 8000) return null;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 8) return null;
  const clean: Message[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > 2000) return null;
    clean.push({ role, content });
  }
  if (clean.at(-1)!.role !== 'user') return null;
  return { context, messages: clean };
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function takeQuota(client: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return 'ok';
  const res = await fetch(`${url}/rest/v1/rpc/enem_ai_take`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_client: client }),
  });
  // Se o contador falhar, não derruba a IA; os limites do próprio Hugging Face continuam valendo.
  if (!res.ok) return 'ok';
  return (await res.json()) as string;
}

async function ask(token: string, messages: object[]) {
  let status = 0;
  for (const model of MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.3 }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { text: text as string, status: 200 };
        status = 502;
        continue;
      }
      status = res.status;
      if (TOKEN_ERRORS.includes(status)) break;
    } catch {
      status = 504;
    } finally {
      clearTimeout(timer);
    }
  }
  return { text: '', status };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'Use POST.' });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(origin, 403, { error: 'Origem não permitida.' });

  const tokens = [Deno.env.get('HF_TOKEN'), Deno.env.get('HF_TOKEN_RESERVA')].filter((t): t is string => !!t);
  if (!tokens.length) return reply(origin, 503, { error: 'not_configured' });

  let body;
  try { body = parseBody(await req.json()); } catch { body = null; }
  if (!body) return reply(origin, 400, { error: 'Pedido inválido.' });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
  const client = await sha256(`${ip}|${req.headers.get('x-client-id') ?? ''}`);
  const quota = await takeQuota(client);
  if (quota === 'client_limit') return reply(origin, 429, { error: 'Muitas perguntas seguidas. Espere um pouco e tente de novo.' });
  if (quota === 'daily_limit') return reply(origin, 429, { error: 'O limite de perguntas de hoje acabou. Volte amanhã.' });

  const messages = [{ role: 'system', content: `${SYSTEM}\n\nContexto:\n${body.context || 'Dúvida geral sobre o ENEM.'}` }, ...body.messages];
  let status = 0;
  for (let i = 0; i < tokens.length; i++) {
    const result = await ask(tokens[i], messages);
    if (result.text) return reply(origin, 200, { text: result.text, reserve: i > 0 });
    status = result.status;
    if (!TOKEN_ERRORS.includes(status)) break;
  }
  const message = status === 402 ? 'Os créditos de IA da conta acabaram.'
    : status === 401 || status === 403 ? 'O token do servidor foi recusado pelo Hugging Face.'
    : 'A IA não respondeu agora. Tente de novo.';
  return reply(origin, 502, { error: message, status });
});

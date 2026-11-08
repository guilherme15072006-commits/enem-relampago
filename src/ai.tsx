import { FormEvent, useState } from 'react';

const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const MODELS = ['google/gemma-3-27b-it:fastest', 'meta-llama/Llama-3.3-70B-Instruct:fastest'];
const TOKEN_KEYS = ['enem-relampago.hf-token', 'enem-relampago.hf-token-reserva'];
const TOKEN_LABELS = ['Token principal', 'Token reserva (opcional)'];
// Erros do token ou da conta: vale tentar o token reserva.
const TOKEN_ERRORS = [401, 402, 403, 429];
const SYSTEM = `Você é um tutor do ENEM. Responda em português do Brasil, de forma curta e simples, em no máximo 6 frases.
Explique o conteúdo e o raciocínio. Se o contexto trouxer o gabarito oficial, ele está certo: nunca o contradiga.
Se o contexto não trouxer o gabarito, não diga qual alternativa é a correta; ajude o aluno a pensar.
Se não tiver certeza de um fato, diga isso claramente.`;

interface Message { role: 'user' | 'assistant'; content: string }

// Servidor com o token do dono guardado em segredo. Sem ele no ar, o app usa o token salvo no aparelho.
const SERVER = 'https://ymuziccgrqjbugsdwgjo.supabase.co/functions/v1/enem_ai';
const CLIENT_KEY = 'enem-relampago.client-id';
class ServerUnavailable extends Error {}

function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLIENT_KEY, id); }
    return id;
  } catch {
    return 'sem-armazenamento';
  }
}

async function askServer(context: string, history: Message[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  let response: Response;
  try {
    response = await fetch(SERVER, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-client-id': clientId() },
      body: JSON.stringify({ context: context.slice(0, 8000), messages: history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })) }),
    });
  } catch {
    throw new ServerUnavailable();
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.text) return { text: data.text as string, reserve: false };
  // Função não publicada ou sem token configurado: cai para o token do aparelho.
  if (response.status === 404 || response.status === 503 || (response.status >= 500 && !data.error)) throw new ServerUnavailable();
  throw new Error(data.error || `A IA não respondeu (erro ${response.status}). Tente de novo.`);
}

const readTokens = () => TOKEN_KEYS.map((key) => {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
});
const writeTokens = (values: string[]) => {
  try {
    TOKEN_KEYS.forEach((key, i) => {
      if (values[i]) localStorage.setItem(key, values[i]);
      else localStorage.removeItem(key);
    });
  } catch {
    // Sem armazenamento: os tokens valem só enquanto a tela estiver aberta.
  }
};

function explainError(status: number) {
  if (status === 401 || status === 403) return 'Token recusado. Crie um token com a permissão “Make calls to Inference Providers” e cole de novo.';
  if (status === 402) return 'Os créditos de IA da sua conta Hugging Face acabaram.';
  if (status === 429) return 'Muitas perguntas seguidas. Espere um pouco e tente de novo.';
  return `A IA não respondeu (erro ${status}). Tente de novo.`;
}

async function askWith(token: string, messages: object[]) {
  let status = 0;
  for (const model of MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 500, temperature: .3 }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { text: text as string, status: 200 };
        throw new Error('A IA devolveu uma resposta vazia. Tente de novo.');
      }
      status = response.status;
      // O outro modelo só ajuda se o problema for deste modelo, não do token.
      if (TOKEN_ERRORS.includes(status)) break;
    } finally {
      clearTimeout(timer);
    }
  }
  return { text: '', status };
}

async function ask(tokens: string[], context: string, history: Message[]) {
  const messages = [{ role: 'system', content: `${SYSTEM}\n\nContexto:\n${context || 'Dúvida geral sobre o ENEM.'}` }, ...history.slice(-6)];
  let status = 0;
  for (let i = 0; i < tokens.length; i++) {
    const result = await askWith(tokens[i], messages);
    if (result.text) return { text: result.text, reserve: i > 0 };
    status = result.status;
    if (!TOKEN_ERRORS.includes(status)) break;
  }
  throw new Error(explainError(status));
}

interface AskProps {
  context: string;
  /** Pergunta enviada sozinha ao tocar no botão. Sem ela, abre direto para digitar. */
  prompt?: string;
  label?: string;
}

export function AskAI({ context, prompt, label = 'Explicar com IA' }: AskProps) {
  const [saved, setSaved] = useState(readTokens);
  const [drafts, setDrafts] = useState(['', '']);
  const [reserve, setReserve] = useState(false);
  const tokens = saved.filter(Boolean);
  const [open, setOpen] = useState(!prompt);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [needToken, setNeedToken] = useState(false);

  const run = async (text: string, keys = tokens) => {
    const history: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setError('');
    setBusy(true);
    try {
      let answer;
      try {
        answer = await askServer(context, history);
      } catch (e) {
        if (!(e instanceof ServerUnavailable)) throw e;
        if (!keys.length) {
          // Sem servidor e sem token no aparelho: pede o token e refaz a mesma pergunta depois.
          setMessages(messages);
          setNeedToken(true);
          return;
        }
        answer = await ask(keys, context, history);
      }
      setReserve(answer.reserve);
      setMessages([...history, { role: 'assistant', content: answer.text }]);
    } catch (e) {
      const offline = e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError');
      setError(offline ? 'Sem resposta da IA. Confira sua internet e tente de novo.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setOpen(true);
    if (prompt && !messages.length && !busy) run(prompt);
  };
  const saveToken = (event: FormEvent) => {
    event.preventDefault();
    const values = saved.map((value, i) => drafts[i].trim() || value);
    if (!values.some(Boolean)) return;
    writeTokens(values);
    setSaved(values);
    setDrafts(['', '']);
    setNeedToken(false);
    // Salvou o token: já busca a explicação que foi pedida.
    if (prompt && !messages.length) run(prompt, values.filter(Boolean));
  };
  const forget = () => { writeTokens(['', '']); setSaved(['', '']); setMessages([]); setError(''); setReserve(false); };
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion('');
    run(text);
  };

  if (!open) return <button type="button" className="ai-button" onClick={start}>✦ {label}</button>;

  return (
    <div className="ai">
      {needToken && tokens.length === 0 ? (
        <form onSubmit={saveToken}>
          <p className="muted small">Para a IA responder, crie um token no Hugging Face com a permissão “Make calls to Inference Providers” e cole aqui. É só uma vez: ele fica salvo neste aparelho.</p>
          <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">Abrir página de tokens</a>
          {TOKEN_LABELS.map((text, i) => (
            <label key={text}>
              <span className="muted small">{text}</span>
              <input type="password" autoComplete="off" placeholder="hf_..." value={drafts[i]} onChange={(e) => setDrafts(drafts.map((d, k) => (k === i ? e.target.value : d)))} />
            </label>
          ))}
          <button className="primary" disabled={!drafts.some((d) => d.trim())}>Salvar e continuar</button>
        </form>
      ) : (
        <>
          <div className="chat" aria-live="polite">
            {messages.filter((m) => m.content !== prompt).map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}
            {busy && <p className="assistant muted">A IA está respondendo…</p>}
          </div>
          {reserve && <p className="muted small">Usando o token reserva: o principal não respondeu.</p>}
          {error && <p className="note bad">{error}</p>}
          {error && prompt && !messages.some((m) => m.role === 'assistant') && <button type="button" className="ghost" onClick={() => { setMessages([]); run(prompt); }}>Tentar de novo</button>}
          <p className="muted small">A IA pode errar. Em caso de conflito, vale o gabarito oficial.</p>
          <form onSubmit={send}>
            <textarea rows={2} aria-label="Sua dúvida" placeholder="Pergunte outra coisa" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button className="primary" disabled={busy || !question.trim()}>Perguntar</button>
          </form>
          <details>
            <summary>Tokens da IA</summary>
            {!saved[1] && (
              <form onSubmit={saveToken}>
                <label>
                  <span className="muted small">{TOKEN_LABELS[1]}</span>
                  <input type="password" autoComplete="off" placeholder="hf_..." value={drafts[1]} onChange={(e) => setDrafts([drafts[0], e.target.value])} />
                </label>
                <button className="ghost" disabled={!drafts[1].trim()}>Salvar reserva</button>
              </form>
            )}
            <button type="button" className="ghost" onClick={forget}>Esquecer tokens</button>
          </details>
        </>
      )}
    </div>
  );
}
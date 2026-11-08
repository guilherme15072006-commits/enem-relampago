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

// Mesma IA dos agentes revisores da Vaquejada: Space gratuito do Hugging Face com Qwen3-VL (lê imagem e texto).
// Funciona sem token, com pouca cota por aparelho; com o token salvo, a cota passa a ser a da conta.
const SPACE = 'https://prithivmlmods-qwen3-vl-hf-demo.hf.space/gradio_api/call/run_understanding';
class SpaceUnavailable extends Error {}

/** Junta as imagens da questão numa só (o Space aceita uma imagem por pergunta). */
async function questionImage(srcs: string[]) {
  const canvas = document.createElement('canvas');
  const draw = canvas.getContext('2d');
  if (!draw) return '';
  const imgs = await Promise.all(srcs.map(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  })).catch(() => []);
  if (!imgs.length) {
    // Dúvida sem questão: o Space exige uma imagem, então vai um quadro branco pequeno.
    canvas.width = canvas.height = 32;
  } else {
    const width = Math.min(900, Math.max(...imgs.map((i) => i.naturalWidth)));
    const heights = imgs.map((i) => Math.round(i.naturalHeight * width / i.naturalWidth));
    canvas.width = width;
    canvas.height = Math.min(2400, heights.reduce((a, b) => a + b, 0));
    let y = 0;
    draw.fillStyle = '#fff';
    draw.fillRect(0, 0, canvas.width, canvas.height);
    imgs.forEach((img, k) => { draw.drawImage(img, 0, y, width, heights[k]); y += heights[k]; });
  }
  if (!imgs.length) { draw.fillStyle = '#fff'; draw.fillRect(0, 0, 32, 32); }
  return canvas.toDataURL('image/jpeg', .8).split(',')[1];
}

function spacePrompt(context: string, history: Message[], withImage: boolean) {
  const talk = history.slice(-6).map((m) => `${m.role === 'user' ? 'Aluno' : 'Tutor'}: ${m.content}`).join('\n');
  return `${SYSTEM}
Use só o que está ${withImage ? 'na imagem da questão e ' : ''}no contexto abaixo e fatos que você tem certeza; não invente trechos.
${withImage ? '' : 'Ignore a imagem: ela está em branco.\n'}
Contexto:
${context || 'Dúvida geral sobre o ENEM.'}

Conversa:
${talk}
Tutor:`;
}

async function askSpace(context: string, history: Message[], images: string[], token?: string) {
  const image = await questionImage(images);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const start = await fetch(SPACE, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ data: ['Query', spacePrompt(context, history, images.length > 0), image, 450, 45] }),
    });
    if (!start.ok) throw new SpaceUnavailable();
    const { event_id: id } = await start.json();
    const stream = await fetch(`${SPACE}/${id}`, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const raw = await stream.text();
    const blocks = raw.split('\n\n').filter((b) => b.includes('data: '));
    const last = blocks[blocks.length - 1];
    if (!last || /event: error/.test(last)) throw new SpaceUnavailable();
    const payload = JSON.parse(last.slice(last.indexOf('data: ') + 6));
    const result = typeof payload[0] === 'string' && payload[0].startsWith('{') ? JSON.parse(payload[0]) : { text: String(payload[0] ?? '') };
    const text = String(result.text ?? '').trim();
    // Sem cota, fila cheia ou erro do Space: tenta o outro caminho.
    if (!text || result.status === 'error' || text.startsWith('[ERROR]')) throw new SpaceUnavailable(text);
    return text;
  } catch (e) {
    if (e instanceof SpaceUnavailable) throw e;
    throw new SpaceUnavailable();
  } finally {
    clearTimeout(timer);
  }
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
  /** Recortes da questão que a IA de visão deve ler junto com o texto. */
  images?: string[];
}

export function AskAI({ context, prompt, label = 'Explicar com IA', images = [] }: AskProps) {
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
  const [pending, setPending] = useState('');

  const run = async (text: string, keys = tokens) => {
    const history: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setError('');
    setBusy(true);
    try {
      let answer;
      try {
        // 1º: o Space da Vaquejada (com o token do aparelho, se houver, para ter mais cota).
        answer = { text: await askSpace(context, history, images, keys[0]), reserve: false };
      } catch (e) {
        if (!(e instanceof SpaceUnavailable)) throw e;
        if (!keys.length) {
          // Acabou a cota grátis deste aparelho: pede o token e refaz a mesma pergunta depois.
          setMessages(messages);
          setPending(text);
          setNeedToken(true);
          return;
        }
        // 2º: o roteador do Hugging Face com o token (principal e reserva).
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
    // Salvou o token: refaz a pergunta que ficou esperando.
    const retry = pending || (prompt && !messages.length ? prompt : '');
    setPending('');
    if (retry) run(retry, values.filter(Boolean));
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
          <p className="muted small">A cota grátis da IA neste aparelho acabou por agora. Para continuar sem limite, crie um token no Hugging Face com a permissão “Make calls to Inference Providers” e cole aqui. É só uma vez: ele fica salvo neste aparelho. Ou espere algumas horas e tente de novo.</p>
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
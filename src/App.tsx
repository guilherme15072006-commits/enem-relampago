import { useEffect, useMemo, useState } from 'react';
import { AskAI } from './ai';
import {
  AREA_LABEL, Answer, Confidence, LETTERS, Letter, Progress, QUESTIONS, Question,
  priorities, topics, useProgress, visibleFor,
} from './store';

type Tab = 'plano' | 'treino' | 'cartas' | 'duvidas';
type Update = (fn: (p: Progress) => Progress) => void;
interface TrainTarget { assunto?: string; from?: number; to?: number; label?: string }

const PARTS: TrainTarget[] = [
  { label: 'Prova inteira', from: 1, to: 90 },
  { label: 'Língua estrangeira', from: 1, to: 5 },
  { label: 'Linguagens', from: 6, to: 45 },
  { label: 'Humanas', from: 46, to: 90 },
  { label: 'Questões 1 a 15', from: 1, to: 15 },
  { label: 'Questões 16 a 30', from: 16, to: 30 },
  { label: 'Questões 31 a 45', from: 31, to: 45 },
  { label: 'Questões 46 a 60', from: 46, to: 60 },
  { label: 'Questões 61 a 75', from: 61, to: 75 },
  { label: 'Questões 76 a 90', from: 76, to: 90 },
];
const inTarget = (t: TrainTarget) => (q: Question) => q.explained && (!t.assunto || q.assunto === t.assunto)
  && (t.from === undefined || q.number >= t.from) && (t.to === undefined || q.number <= t.to);

const EXAM = new Date('2026-11-08T13:30:00-03:00');
const TABS: [Tab, string][] = [['plano', 'Plano'], ['treino', 'Treino'], ['cartas', 'Cartas'], ['duvidas', 'Dúvidas']];
const CONFIDENCE: [Confidence, string][] = [['sei', 'Sei'], ['duvida', 'Dúvida'], ['chute', 'Chute']];

export function App() {
  const [progress, update] = useProgress();
  const [tab, setTab] = useState<Tab>('plano');
  const [target, setTarget] = useState<TrainTarget | null>(null);
  const train = (t: TrainTarget | null = null) => { setTarget(t); setTab('treino'); };

  return (
    <div className="app">
      <main>
        {tab === 'plano' && <Plan progress={progress} update={update} train={train} />}
        {tab === 'treino' && !target && <Picker progress={progress} choose={setTarget} />}
        {tab === 'treino' && target && <Train key={JSON.stringify(target)} target={target} progress={progress} update={update} clear={() => setTarget(null)} />}
        {tab === 'cartas' && <Cards progress={progress} update={update} train={train} />}
        {tab === 'duvidas' && <section><p className="eyebrow">Dúvidas</p><h1>Pergunte à IA</h1><p className="muted">Tire dúvidas sobre qualquer assunto do ENEM.</p><AskAI context="" title="Abrir conversa" /></section>}
      </main>
      <nav aria-label="Principal">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function Plan({ progress, update, train }: { progress: Progress; update: Update; train: (t?: TrainTarget | null) => void }) {
  const left = EXAM.getTime() - Date.now();
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const reviewed = QUESTIONS.filter((q) => progress.answers[q.id]?.reviewed);
  const right = reviewed.filter((q) => progress.answers[q.id].choice === q.answer);
  const lucky = right.filter((q) => progress.answers[q.id].confidence === 'chute');
  const list = priorities(progress).slice(0, 6);
  const fallback = topics().slice(0, 6).map((t) => t.assunto);

  return (
    <section>
      <p className="eyebrow">ENEM 2026 · 1º dia</p>
      <h1>{left > 0 ? `Faltam ${days}d ${hours}h` : 'Boa prova!'}</h1>
      <p className="muted">Domingo, 8 de novembro, às 13h30. Portões fecham às 13h.</p>
      <button className="primary" onClick={() => train()}>Escolher parte da prova</button>

      <dl className="stats">
        <div><dt>Feitas</dt><dd>{reviewed.length}</dd></div>
        <div><dt>Acertos</dt><dd>{right.length}</dd></div>
        <div><dt>No chute</dt><dd>{lucky.length}</dd></div>
      </dl>

      <h2>{list.length ? 'Estude agora' : 'Comece por aqui'}</h2>
      <p className="muted">{list.length ? 'Ordem baseada nos seus erros, chutes e cartas para revisar.' : 'Assuntos com mais questões nas provas explicadas.'}</p>
      <ul className="list">
        {(list.length ? list : fallback).map((assunto) => (
          <li key={assunto}><button onClick={() => train({ assunto })}><span>{assunto}</span><b aria-hidden>›</b></button></li>
        ))}
      </ul>

      <h2>Língua estrangeira</h2>
      <div className="segment">
        {(['en', 'es'] as const).map((lang) => (
          <button key={lang} className={progress.lang === lang ? 'on' : ''} onClick={() => update((p) => ({ ...p, lang }))}>{lang === 'en' ? 'Inglês' : 'Espanhol'}</button>
        ))}
      </div>
    </section>
  );
}

function Picker({ progress, choose }: { progress: Progress; choose: (t: TrainTarget) => void }) {
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('90');
  const visible = QUESTIONS.filter(visibleFor(progress.lang));
  const count = (t: TrainTarget) => {
    const list = visible.filter(inTarget(t));
    return `${list.filter((q) => progress.answers[q.id]?.reviewed).length} de ${list.length}`;
  };
  const start = Math.min(90, Math.max(1, Number(from) || 1));
  const end = Math.min(90, Math.max(start, Number(to) || start));

  return (
    <section>
      <p className="eyebrow">Treino · ENEM 2025 · 1º dia</p>
      <h1>Qual parte você quer fazer?</h1>
      <ul className="list">
        {PARTS.map((part) => (
          <li key={part.label}><button onClick={() => choose(part)}><span>{part.label}</span><small>{count(part)}</small></button></li>
        ))}
      </ul>
      <h2>Escolher as questões</h2>
      <div className="range">
        <label>De<input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Até<input inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="primary" onClick={() => choose({ from: start, to: end, label: `Questões ${start} a ${end}` })}>Começar</button>
      </div>
      <h2>Por assunto</h2>
      <ul className="list">
        {topics().map(({ assunto }) => (
          <li key={assunto}><button onClick={() => choose({ assunto })}><span>{assunto}</span><small>{count({ assunto })}</small></button></li>
        ))}
      </ul>
    </section>
  );
}

function Train({ target, progress, update, clear }: { target: TrainTarget; progress: Progress; update: Update; clear: () => void }) {
  const pool = useMemo(() => QUESTIONS.filter(visibleFor(progress.lang)).filter(inTarget(target)), [progress.lang, target]);
  const pick = (assunto?: string, skip?: string) => {
    const open = pool.filter((q) => !progress.answers[q.id]?.reviewed && q.id !== skip);
    return open.find((q) => q.assunto === assunto) ?? open[0] ?? null;
  };
  const [question, setQuestion] = useState<Question | null>(() => pick());
  const label = target.label ?? target.assunto ?? 'Treino';
  const done = pool.filter((q) => progress.answers[q.id]?.reviewed).length;
  const restart = () => {
    update((p) => {
      const answers = { ...p.answers };
      for (const q of pool) delete answers[q.id];
      return { ...p, answers };
    });
    setQuestion(pool[0] ?? null);
  };

  if (!question) {
    return (
      <section className="empty">
        <h1>Parte concluída</h1>
        <p className="muted">Você fez {done} de {pool.length} questões em {label}.</p>
        <button className="primary" onClick={clear}>Escolher outra parte</button>
        {pool.length > 0 && <button className="ghost" onClick={restart}>Refazer esta parte</button>}
      </section>
    );
  }
  return (
    <>
      <button className="chip" onClick={clear}>{label} · {done} de {pool.length} · Trocar parte</button>
      <Flow
        key={question.id} question={question} progress={progress} update={update}
        next={(wrong) => { window.scrollTo(0, 0); setQuestion(pick(wrong ? question.assunto : undefined, question.id)); }}
      />
    </>
  );
}

function Flow({ question: q, progress, update, next }: { question: Question; progress: Progress; update: Update; next: (wrong: boolean) => void }) {
  const saved = progress.answers[q.id];
  const [step, setStep] = useState<'questao' | 'resultado'>(saved?.reviewed ? 'resultado' : 'questao');
  const [confidence, setConfidence] = useState<Confidence | undefined>(saved?.confidence);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const label = `${AREA_LABEL[q.area]} · ${q.year} · Questão ${q.number}${q.language ? (q.language === 'en' ? ' (inglês)' : ' (espanhol)') : ''}`;
  // A resposta sai na hora: apertar a alternativa já corrige.
  const answerWith = (choice: Letter) => {
    const answer: Answer = { choice, confidence, reviewed: true };
    update((p) => ({ ...p, answers: { ...p.answers, [q.id]: answer } }));
    setStep('resultado');
  };

  if (step === 'questao') {
    return (
      <section>
        <p className="eyebrow">{label}</p>
        {q.explained && (
          <article className="lesson">
            <p className="stage">Explicação antes da questão</p>
            <h1>{q.assunto}</h1>
            <p className="lead">{q.conteudo}</p>
            <AskAI context={`Assunto: ${q.assunto}\nConteúdo: ${q.conteudo}\nO aluno ainda não respondeu. Não indique alternativa.`} />
          </article>
        )}
        <h2>A questão</h2>
        {q.context && <Zoomable src={q.context} alt="Texto compartilhado da questão" />}
        <Zoomable src={q.image} alt={`Questão ${q.number} da prova`} />
        <p className="muted small">Opcional: marque antes se você sabe ou vai chutar.</p>
        <div className="segment">
          {CONFIDENCE.map(([id, text]) => <button key={id} className={confidence === id ? 'on' : ''} aria-pressed={confidence === id} onClick={() => setConfidence(confidence === id ? undefined : id)}>{text}</button>)}
        </div>
        <p className="muted small">Toque na alternativa oficial para ver o resultado.</p>
        <div className="letters">
          {LETTERS.map((l) => <button key={l} aria-label={`Responder ${l}: ${q.alternativas?.[l] ?? ''}`} onClick={() => answerWith(l)}><b>{l}</b><span>{q.alternativas?.[l]}</span></button>)}
        </div>
      </section>
    );
  }

  const right = saved?.choice === q.answer;
  const reported = progress.reported.includes(q.id);
  return (
    <section>
      <p className="eyebrow">{label}</p>
      <p className="stage">Como resolver</p>
      <h1 className={right ? 'good' : 'bad'}>{right ? 'Acertou' : 'Errou'}: resposta {q.answer}</h1>
      {q.alternativas && <p className="official"><b>{q.answer}</b> {q.alternativas[q.answer]}</p>}
      {saved && !right && q.alternativas && <p className="muted small">Você marcou {saved.choice}: {q.alternativas[saved.choice]}</p>}
      {right && saved?.confidence === 'chute' && <p className="note">Acerto no chute: este assunto continua no seu plano de estudo.</p>}
      {q.explained ? (
        <>
          <h2>Como resolver</h2>
          <ol className="steps">{q.passos?.map((s) => <li key={s}>{s}</li>)}</ol>
          <h2>Por que é {q.answer}</h2>
          <p>{q.resposta}</p>
          <h2>Caça à pegadinha</h2>
          <ul className="traps">
            {LETTERS.filter((l) => l !== q.answer).map((l) => (
              <li key={l} className={saved?.choice === l ? 'picked' : ''}><b>{l}</b><span><em>{q.alternativas?.[l]}</em>{q.pegadinhas?.[l]}</span></li>
            ))}
          </ul>
        </>
      ) : <p className="note">Esta questão ainda não tem explicação. O gabarito acima é o oficial do Inep.</p>}
      <AskAI context={`Questão ${q.number} do ENEM ${q.year}\nTexto da questão: ${q.text ?? ''}\nGabarito oficial: ${q.answer}\nO aluno marcou: ${saved?.choice}\nExplicação: ${q.resposta ?? ''}`} />
      <details><summary>Ver a questão de novo</summary>{q.context && <Zoomable src={q.context} alt="Texto compartilhado" />}<Zoomable src={q.image} alt={`Questão ${q.number}`} /></details>
      <button className="primary" onClick={() => next(!right)}>{right ? 'Próxima questão' : 'Outra do mesmo assunto'}</button>
      <button className="ghost" onClick={() => update((p) => ({ ...p, reported: reported ? p.reported.filter((id) => id !== q.id) : [...p.reported, q.id] }))}>{reported ? 'Erro reportado ✓' : 'Reportar erro nesta explicação'}</button>
    </section>
  );
}

function Zoomable({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="paper" onClick={() => setOpen(true)} aria-label={`${alt}. Toque para ampliar`}><img src={src} alt={alt} loading="lazy" /></button>
      {open && <button className="zoom" onClick={() => setOpen(false)} aria-label="Fechar imagem ampliada"><img src={src} alt={alt} /></button>}
    </>
  );
}

function Cards({ progress, update, train }: { progress: Progress; update: Update; train: (t?: TrainTarget | null) => void }) {
  const all = useMemo(topics, []);
  const pending = all.filter((t) => !progress.cards[t.assunto]);
  const card = pending[0];
  const set = (assunto: string, state: 'sei' | 'revisar') => update((p) => ({ ...p, cards: { ...p.cards, [assunto]: state } }));
  const review = all.filter((t) => progress.cards[t.assunto] === 'revisar');

  return (
    <section>
      <p className="eyebrow">Cartas de assunto · {all.length - pending.length} de {all.length}</p>
      {card ? (
        <article className="card">
          <h1>{card.assunto}</h1>
          <p className="muted small">{card.questions.length} {card.questions.length === 1 ? 'questão' : 'questões'} nas provas</p>
          {card.questions.slice(0, 2).map((q) => <p key={q.id}>{q.conteudo}</p>)}
          <div className="pair">
            <button className="ghost" onClick={() => set(card.assunto, 'revisar')}>Revisar</button>
            <button className="primary" onClick={() => set(card.assunto, 'sei')}>Já sei</button>
          </div>
        </article>
      ) : <p className="note">Você passou por todas as cartas.</p>}
      {review.length > 0 && (
        <>
          <h2>Para revisar</h2>
          <ul className="list">{review.map((t) => <li key={t.assunto}><button onClick={() => train({ assunto: t.assunto })}><span>{t.assunto}</span><b aria-hidden>›</b></button></li>)}</ul>
        </>
      )}
      {Object.keys(progress.cards).length > 0 && <button className="ghost" onClick={() => update((p) => ({ ...p, cards: {} }))}>Recomeçar cartas</button>}
    </section>
  );
}

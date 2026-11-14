import { useEffect, useMemo, useState } from 'react';
import { AskAI } from './ai';
import {
  AREA_LABEL, Answer, Confidence, Day, LETTERS, Letter, Progress, QUESTIONS, Question,
  priorities, topics, useProgress, visibleFor,
} from './store';

type Tab = 'plano' | 'treino' | 'cartas' | 'duvidas';
type Update = (fn: (p: Progress) => Progress) => void;
interface TrainTarget { assunto?: string; from?: number; to?: number; label?: string }

const blocks = (first: number) => Array.from({ length: 6 }, (_, i) => ({ label: `Questões ${first + i * 15} a ${first + i * 15 + 14}`, from: first + i * 15, to: first + i * 15 + 14 }));
const DAYS: Record<Day, { first: number; last: number; label: string; areas: string; date: Date; when: string; parts: TrainTarget[] }> = {
  1: {
    first: 1, last: 90, label: '1º dia', areas: 'Linguagens e Humanas',
    date: new Date('2026-11-08T13:30:00-03:00'), when: 'Domingo, 8 de novembro, às 13h30. Portões fecham às 13h.',
    parts: [
      { label: 'Prova inteira', from: 1, to: 90 },
      { label: 'Língua estrangeira', from: 1, to: 5 },
      { label: 'Linguagens', from: 6, to: 45 },
      { label: 'Humanas', from: 46, to: 90 },
      ...blocks(1),
    ],
  },
  2: {
    first: 91, last: 180, label: '2º dia', areas: 'Natureza e Matemática',
    date: new Date('2026-11-15T13:30:00-03:00'), when: 'Domingo, 15 de novembro, às 13h30. Portões fecham às 13h.',
    parts: [
      { label: 'Prova inteira', from: 91, to: 180 },
      { label: 'Ciências da Natureza', from: 91, to: 135 },
      { label: 'Matemática', from: 136, to: 180 },
      ...blocks(91),
    ],
  },
};
const inTarget = (t: TrainTarget) => (q: Question) => (!t.assunto || q.assunto === t.assunto)
  && (t.from === undefined || q.number >= t.from) && (t.to === undefined || q.number <= t.to);
const CONFIDENCE: [Confidence, string][] = [['sei', 'Sei'], ['duvida', 'Dúvida'], ['chute', 'Chute']];

export function App() {
  const [progress, update] = useProgress();
  const [tab, setTab] = useState<Tab>('plano');
  const [target, setTarget] = useState<TrainTarget | null>(null);
  const train = (t: TrainTarget | null = null) => { setTarget(t); setTab('treino'); };

  return (
    <div className="app">
      <main>
        {tab !== 'plano' && <button className="back" onClick={() => setTab('plano')}>‹ Início</button>}
        {tab === 'plano' && <Plan progress={progress} update={update} train={train} open={setTab} />}
        {tab === 'treino' && !target && <Picker progress={progress} choose={setTarget} />}
        {tab === 'treino' && target && <Train key={JSON.stringify(target)} target={target} progress={progress} update={update} clear={() => setTarget(null)} />}
        {tab === 'cartas' && <Cards progress={progress} update={update} train={train} />}
        {tab === 'duvidas' && <section><p className="eyebrow">Dúvidas</p><h1>Pergunte à IA</h1><p className="muted">Tire dúvidas sobre qualquer assunto do ENEM.</p><AskAI context="" /></section>}
      </main>
    </div>
  );
}

function Plan({ progress, update, train, open }: { progress: Progress; update: Update; train: (t?: TrainTarget | null) => void; open: (tab: Tab) => void }) {
  const day = DAYS[progress.day];
  const left = day.date.getTime() - Date.now();
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const ofDay = QUESTIONS.filter(visibleFor(progress));
  const reviewed = ofDay.filter((q) => progress.answers[q.id]?.reviewed);
  const right = reviewed.filter((q) => progress.answers[q.id].choice === q.answer);
  const lucky = right.filter((q) => progress.answers[q.id].confidence === 'chute');
  const list = priorities(progress).slice(0, 6);
  const fallback = topics(progress.day).slice(0, 6).map((t) => t.assunto);
  const explained = ofDay.filter((q) => q.explained).length;

  return (
    <section>
      <div className="segment" role="group" aria-label="Dia da prova">
        {([1, 2] as const).map((d) => (
          <button key={d} className={progress.day === d ? 'on' : ''} aria-pressed={progress.day === d} onClick={() => update((p) => ({ ...p, day: d }))}>{DAYS[d].label} · {DAYS[d].areas}</button>
        ))}
      </div>
      <p className="eyebrow">ENEM 2026 · {day.label}</p>
      <h1>{left > 0 ? `Faltam ${days}d ${hours}h` : left > -6 * 3600000 ? 'Boa prova!' : 'Prova feita'}</h1>
      <p className="muted">{day.when}</p>
      {explained < ofDay.length && <p className="note small">{explained} de {ofDay.length} questões já têm explicação. As outras mostram o gabarito oficial enquanto as explicações chegam.</p>}
      <button className="primary" onClick={() => train()}>Fazer questões</button>
      <div className="pair">
        <button className="ghost" onClick={() => open('cartas')}>Cartas de assunto</button>
        <button className="ghost" onClick={() => open('duvidas')}>✦ Perguntar à IA</button>
      </div>

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

      {progress.day === 1 && (
        <>
          <h2>Língua estrangeira</h2>
          <div className="segment">
            {(['en', 'es'] as const).map((lang) => (
              <button key={lang} className={progress.lang === lang ? 'on' : ''} onClick={() => update((p) => ({ ...p, lang }))}>{lang === 'en' ? 'Inglês' : 'Espanhol'}</button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Picker({ progress, choose }: { progress: Progress; choose: (t: TrainTarget) => void }) {
  const day = DAYS[progress.day];
  const [from, setFrom] = useState(String(day.first));
  const [to, setTo] = useState(String(day.last));
  const visible = QUESTIONS.filter(visibleFor(progress));
  const count = (t: TrainTarget) => {
    const list = visible.filter(inTarget(t));
    return `${list.filter((q) => progress.answers[q.id]?.reviewed).length} de ${list.length}`;
  };
  const start = Math.min(day.last, Math.max(day.first, Number(from) || day.first));
  const end = Math.min(day.last, Math.max(start, Number(to) || start));

  return (
    <section>
      <p className="eyebrow">Treino · ENEM 2025 · {day.label} · {day.areas}</p>
      <h1>Qual parte você quer fazer?</h1>
      <ul className="list">
        {day.parts.map((part) => (
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
        {topics(progress.day).map(({ assunto }) => (
          <li key={assunto}><button onClick={() => choose({ assunto })}><span>{assunto}</span><small>{count({ assunto })}</small></button></li>
        ))}
      </ul>
    </section>
  );
}

function Train({ target, progress, update, clear }: { target: TrainTarget; progress: Progress; update: Update; clear: () => void }) {
  const pool = useMemo(() => QUESTIONS.filter(visibleFor(progress)).filter(inTarget(target)), [progress.lang, progress.day, target]);
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
            <AskAI label="Explicar melhor com IA" prompt="Explique este conteúdo de forma simples, com um exemplo. Não indique nenhuma alternativa." context={`Assunto: ${q.assunto}\nConteúdo: ${q.conteudo}\nO aluno ainda não respondeu. Não indique alternativa.`} />
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
          {LETTERS.map((l) => <button key={l} aria-label={`Responder ${l}: ${q.alternativas?.[l] ?? ''}`} onClick={() => answerWith(l)}><b>{l}</b><span>{q.alternativas?.[l] ?? 'Alternativa na imagem da questão'}</span></button>)}
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
      <AskAI
        label="Explicar a resposta com IA"
        prompt="Explique de forma simples por que o gabarito é essa alternativa e o que eu devo observar para acertar."
        images={[q.context, q.image].filter((s): s is string => !!s)}
        context={[
          `Questão ${q.number} do ENEM ${q.year} (a imagem é a questão).`,
          `Assunto: ${q.assunto}`,
          `Gabarito oficial: ${q.answer} — ${q.alternativas?.[q.answer] ?? ''}`,
          saved && saved.choice !== q.answer ? `O aluno marcou ${saved.choice} — ${q.alternativas?.[saved.choice] ?? ''}` : 'O aluno acertou.',
          `Como resolver: ${(q.passos ?? []).join(' ')}`,
          `Por que é ${q.answer}: ${q.resposta ?? ''}`,
        ].join('\n')}
      />
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
  const all = useMemo(() => topics(progress.day), [progress.day]);
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

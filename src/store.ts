import { useCallback, useEffect, useState } from 'react';
import raw from './data/questions.json';

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E';
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E'];
export type Confidence = 'sei' | 'duvida' | 'chute';

export interface Question {
  id: string; year: number; number: number; language: 'en' | 'es' | null;
  area: 'linguagens' | 'humanas'; image: string; text?: string; alternativas?: Record<Letter, string> | null; answer: Letter; context: string | null; explained: boolean;
  assunto?: string; conteudo?: string; passos?: string[]; resposta?: string; pegadinhas?: Partial<Record<Letter, string>>;
}

export interface Answer { choice: Letter; confidence?: Confidence; reviewed: boolean }

export interface Progress {
  lang: 'en' | 'es';
  answers: Record<string, Answer>;
  cards: Record<string, 'sei' | 'revisar'>;
  reported: string[];
}

export const QUESTIONS = raw as Question[];
export const AREA_LABEL = { linguagens: 'Linguagens', humanas: 'Humanas' };

const KEY = 'enem-relampago.v1';
const EMPTY: Progress = { lang: 'en', answers: {}, cards: {}, reported: [] };

function load(): Progress {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return EMPTY;
  }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      // Sem armazenamento (modo privado): o app continua funcionando nesta sessão.
    }
  }, [progress]);
  const update = useCallback((fn: (p: Progress) => Progress) => setProgress(fn), []);
  return [progress, update] as const;
}

export const visibleFor = (lang: Progress['lang']) => (q: Question) => !q.language || q.language === lang;

/** Assuntos em que vale estudar agora: erros, acertos no chute e cartas marcadas para revisar. */
export function priorities(p: Progress) {
  const score = new Map<string, number>();
  const add = (assunto: string | undefined, n: number) => assunto && score.set(assunto, (score.get(assunto) ?? 0) + n);
  for (const q of QUESTIONS) {
    const a = p.answers[q.id];
    if (!a?.reviewed) continue;
    if (a.choice !== q.answer) add(q.assunto, 3);
    else if (a.confidence === 'chute') add(q.assunto, 2);
    else if (a.confidence === 'duvida') add(q.assunto, 1);
  }
  for (const [assunto, state] of Object.entries(p.cards)) if (state === 'revisar') add(assunto, 2);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([assunto]) => assunto);
}

export function topics() {
  const map = new Map<string, Question[]>();
  for (const q of QUESTIONS) if (q.assunto) map.set(q.assunto, [...(map.get(q.assunto) ?? []), q]);
  return [...map.entries()].map(([assunto, questions]) => ({ assunto, questions })).sort((a, b) => b.questions.length - a.questions.length);
}

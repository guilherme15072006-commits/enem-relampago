// Junta os recortes (data/raw) com as explicações (data/explain), valida tudo e gera
// src/data/questions.json. Lista em data/pendentes.json o que ainda não tem explicação.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [])
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const Letter = z.enum(['A', 'B', 'C', 'D', 'E']);
const Raw = z.object({
  id: z.string(), year: z.number(), day: z.number().default(1), number: z.number(),
  language: z.enum(['en', 'es']).nullable(), area: z.enum(['linguagens', 'humanas', 'natureza', 'matematica']),
  image: z.string(), text: z.string().default(''), answer: z.string().nullable(), context: z.string().nullable().optional(),
});
const Explain = z.object({
  id: z.string(), assunto: z.string().min(3), conteudo: z.string().min(20),
  passos: z.array(z.string().min(5)).min(2).max(4), resposta: z.string().min(10),
  pegadinhas: z.record(Letter, z.string().min(5)),
});

/** Lê o texto oficial das cinco alternativas no fim da questão extraída do PDF do Inep. */
function alternatives(text) {
  const found = {};
  let end = text.length;
  for (const letter of [...Letter.options].reverse()) {
    const matches = [...text.slice(0, end).matchAll(new RegExp(`(?:^|\\n)\\s*${letter}[\\t ]+`, 'g'))];
    const match = matches.at(-1);
    if (!match) return null;
    found[letter] = text.slice(match.index + match[0].length, end).replace(/\s+/g, ' ').replace(/- (?=[a-zà-ú])/g, '-').trim();
    end = match.index;
  }
  return Object.values(found).every(Boolean) ? found : null;
}

const raw = readJsonDir(join(root, 'data', 'raw')).map((q) => Raw.parse(q));
const explanations = new Map(readJsonDir(join(root, 'data', 'explain')).map((e) => {
  const parsed = Explain.parse(e);
  return [parsed.id, parsed];
}));

const errors = [];
const pending = [];
const questions = [];
for (const q of raw) {
  if (!Letter.safeParse(q.answer).success) {
    errors.push(`${q.id}: sem gabarito válido (${q.answer}); ficou de fora`);
    continue;
  }
  if (!existsSync(join(root, 'public', q.image))) errors.push(`${q.id}: recorte não encontrado`);
  if (q.context && !existsSync(join(root, 'public', q.context))) errors.push(`${q.id}: texto compartilhado não encontrado`);
  const e = explanations.get(q.id);
  if (!e) {
    pending.push(q.id);
    questions.push({ ...q, context: q.context ?? null, explained: false });
    continue;
  }
  const wrong = Letter.options.filter((l) => l !== q.answer);
  const missing = wrong.filter((l) => !e.pegadinhas[l]);
  if (missing.length) errors.push(`${q.id}: falta pegadinha em ${missing.join(', ')}`);
  if (e.pegadinhas[q.answer]) errors.push(`${q.id}: há pegadinha na alternativa correta ${q.answer}`);
  const { id, ...text } = e;
  const alternativas = alternatives(q.text);
  if (!alternativas) errors.push(`${q.id}: não consegui ler as 5 alternativas oficiais`);
  questions.push({ ...q, context: q.context ?? null, explained: true, alternativas, ...text });
}
const orphan = [...explanations.keys()].filter((id) => !raw.some((q) => q.id === id));
if (orphan.length) errors.push(`explicações sem questão: ${orphan.join(', ')}`);

mkdirSync(join(root, 'src', 'data'), { recursive: true });
// O app só usa questões explicadas; as pendentes ficam fora do pacote até serem revisadas.
writeFileSync(join(root, 'src', 'data', 'questions.json'), JSON.stringify(questions.filter((q) => q.explained)));
writeFileSync(join(root, 'data', 'pendentes.json'), JSON.stringify(pending, null, 1));

console.log(`${questions.length} questões | ${questions.length - pending.length} explicadas | ${pending.length} pendentes`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

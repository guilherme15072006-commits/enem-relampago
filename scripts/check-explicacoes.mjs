// Confere se cada explicação é fiel ao gabarito oficial e se a aula antes da questão não entrega a resposta.
// Uso: node scripts/check-explicacoes.mjs   (sai com erro se algo falhar)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const questions = JSON.parse(readFileSync(join(root, 'src', 'data', 'questions.json'), 'utf8'));

const STOP = new Set(['para', 'como', 'pelo', 'pela', 'pelos', 'pelas', 'entre', 'sobre', 'desse', 'dessa', 'deste', 'desta', 'esse', 'essa', 'este', 'esta', 'seus', 'suas', 'mais', 'muito', 'quando', 'também', 'ainda', 'outro', 'outra', 'outros', 'outras', 'sendo', 'pois', 'diante', 'acerca', 'meio', 'forma', 'formas', 'uma', 'umas']);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => norm(s).match(/[a-z0-9]+/g) ?? [];
const keyWords = (s) => [...new Set(words(s).filter((w) => w.length > 4 && !STOP.has(norm(w))))];
// Radical simples: compara as 5 primeiras letras (pega plural, gênero e derivações próximas).
const stem = (w) => w.slice(0, 5);

const problems = [];
const report = [];
for (const q of questions) {
  const correct = q.alternativas?.[q.answer] ?? '';
  const where = `${q.id} [${q.answer}]`;

  // 1. Toda alternativa citada na resolução tem de ser a do gabarito oficial.
  const cited = [...q.passos.join(' ').matchAll(/alternativa ([A-E])/g)].map((m) => m[1]);
  const wrongCited = cited.filter((l) => l !== q.answer);
  if (wrongCited.length) problems.push(`${where}: a resolução aponta a alternativa ${wrongCited.join(', ')}`);

  // 2. A aula antes da questão não pode citar alternativa nem copiar a frase da resposta certa.
  if (/[Aa]lternativa [A-E]\b/.test(q.conteudo)) problems.push(`${where}: a aula cita uma alternativa`);
  const cw = words(correct);
  const conteudo = ` ${words(q.conteudo).join(' ')} `;
  for (let i = 0; i + 5 <= cw.length; i++) {
    const chunk = cw.slice(i, i + 5).join(' ');
    if (conteudo.includes(` ${chunk} `)) { problems.push(`${where}: a aula copia a resposta (“${chunk}”)`); break; }
  }

  // 3. O “por que” precisa falar da ideia da alternativa certa, não de outra coisa.
  const need = keyWords(correct);
  const have = new Set([...words(q.resposta), ...words(q.passos.at(-1))].map(stem));
  const hits = need.filter((w) => have.has(stem(w)));
  const cover = need.length ? hits.length / need.length : 1;
  if (cover < 0.5) problems.push(`${where}: o porquê cobre pouco a alternativa certa (${Math.round(cover * 100)}%: faltam ${need.filter((w) => !hits.includes(w)).join(', ')})`);

  // 4. Pegadinha para cada alternativa errada, e nenhuma para a certa.
  for (const l of ['A', 'B', 'C', 'D', 'E']) {
    if (l === q.answer && q.pegadinhas[l]) problems.push(`${where}: há pegadinha na certa`);
    if (l !== q.answer && !q.pegadinhas[l]) problems.push(`${where}: falta pegadinha em ${l}`);
  }
  report.push({ id: q.id, cover: Math.round(cover * 100), aprofundada: q.conteudo.length >= 160 });
}

const shallow = report.filter((r) => !r.aprofundada).map((r) => r.id);
console.log(`${questions.length} questões conferidas | ${questions.length - shallow.length} aprofundadas | ${problems.length} problemas`);
if (shallow.length) console.log(`Ainda curtas: ${shallow.join(', ')}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

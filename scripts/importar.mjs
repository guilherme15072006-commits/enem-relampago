// Importa o 1º dia de uma prova: npm run importar -- 2024
// Baixa do Inep, recorta, cruza com o gabarito e mostra o que falta explicar.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [year] = process.argv.slice(2);
if (!/^\d{4}$/.test(year ?? '')) {
  console.error('Uso: npm run importar -- <ano>   (exemplo: npm run importar -- 2023)');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('python', ['scripts/extract_inep.py', '--ano', year, '--dia', '1']);
run(process.execPath, ['scripts/build-data.mjs']);
console.log(`\nConfira os recortes em sources/review/${year}-d1/.`);
console.log('As questões sem explicação ficam em data/pendentes.json e só entram no Treino depois de explicadas.');
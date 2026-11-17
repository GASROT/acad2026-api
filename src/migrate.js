import { readFile } from 'node:fs/promises';
import { criarPool } from './database.js';

const pool = criarPool();
try {
  for (const arquivo of ['001_mensalidades.sql', '002_aluno_mensalidade.sql']) {
    const sql = await readFile(new URL(`../sql/${arquivo}`, import.meta.url), 'utf8');
    await pool.query(sql);
  }
  console.log('Schema de mensalidades atualizado.');
} catch {
  console.error('Falha ao preparar o banco. Confira DATABASE_URL e a disponibilidade do PostgreSQL.');
  process.exitCode = 1;
} finally {
  await pool.end();
}

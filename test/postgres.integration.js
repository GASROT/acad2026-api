import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { criarApp } from '../src/app.js';

test('API persiste no PostgreSQL real e reenvios concorrentes não duplicam', {
  skip: !process.env.TEST_DATABASE_URL && 'Configure TEST_DATABASE_URL para um PostgreSQL de teste.',
}, async () => {
  const schema = `teste_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let server;
  try {
    // Schema aleatório exclusivo deste teste, sem tocar nas tabelas existentes.
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}` });
    await pool.query(await readFile(new URL('../sql/001_mensalidades.sql', import.meta.url), 'utf8'));
    const legadoId = randomUUID();
    await pool.query('INSERT INTO mensalidades (id, matricula, mensalidade) VALUES ($1, $2, $3)',
      [legadoId, 'ANTIGA', '99.90']);
    await pool.query(await readFile(new URL('../sql/002_aluno_mensalidade.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../sql/002_aluno_mensalidade.sql', import.meta.url), 'utf8'));
    const legado = await pool.query('SELECT aluno, mensalidade FROM mensalidades WHERE id = $1', [legadoId]);
    assert.equal(legado.rows[0].aluno, '');
    assert.equal(legado.rows[0].mensalidade, '99.90');
    server = criarApp(pool).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/mensalidades`;
    const body = { id: randomUUID(), aluno: 'Aluno teste', matricula: '0007', mensalidade: '129.90' };
    const enviar = () => fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const respostas = await Promise.all([enviar(), enviar(), enviar()]);
    assert.deepEqual(respostas.map(r => r.status).sort(), [200, 200, 201]);
    const { rows } = await pool.query('SELECT * FROM mensalidades WHERE id = $1', [body.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mensalidade, '129.90');
    assert.equal(rows[0].matricula, '0007');
    assert.equal(rows[0].aluno, 'Aluno teste');
    const lista = await (await fetch(url)).json();
    assert.equal(lista.length, 2);
    assert.equal(lista.find(row => row.id === body.id).aluno, 'Aluno teste');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

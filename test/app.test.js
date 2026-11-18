import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.js';

let server;
let baseUrl;
let rows;
let falhar;
let queries;

beforeEach(async () => {
  rows = new Map();
  falhar = false;
  queries = [];
  const pool = { async query(sql, params = []) {
    queries.push({ sql, params });
    if (falhar) throw new Error('segredo: senha do banco');
    if (sql.startsWith('INSERT')) {
      const [id, matricula, mensalidade, aluno] = params;
      if (rows.has(id)) return { rows: [] };
      const row = { id, aluno, matricula, mensalidade, criado_em: new Date().toISOString() };
      rows.set(id, row);
      return { rows: [row] };
    }
    if (sql.includes('WHERE id')) return { rows: [rows.get(params[0])].filter(Boolean) };
    return { rows: [...rows.values()] };
  } };
  server = criarApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise(resolve => server.close(resolve)));

function post(body) {
  return fetch(`${baseUrl}/mensalidades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const novo = () => ({ id: randomUUID(), aluno: 'Aluno teste', matricula: '0001', mensalidade: '129.90' });

test('CORS permite ler respostas a partir de outra origem sem credenciais', async () => {
  const response = await fetch(`${baseUrl}/mensalidades`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.deepEqual(await response.json(), []);
});

test('preflight de POST JSON responde antes de acessar o banco', async () => {
  const response = await fetch(`${baseUrl}/mensalidades`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET,POST,OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(queries.length, 0);
});

test('POST 201 e GET preservam matrícula e centavos', async () => {
  const body = novo();
  const response = await post(body);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).matricula, '0001');
  const list = await fetch(`${baseUrl}/mensalidades`);
  assert.equal(list.status, 200);
  const registros = await list.json();
  assert.equal(registros.length, 1);
  assert.equal(registros[0].mensalidade, '129.90');
  assert.equal(registros[0].aluno, 'Aluno teste');
  assert.match(queries[0].sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
  assert.deepEqual(queries[0].params, [body.id, '0001', '129.90', 'Aluno teste']);
});

test('reenvio do mesmo id retorna 200 e não duplica', async () => {
  const body = novo();
  assert.equal((await post(body)).status, 201);
  assert.equal((await post(body)).status, 200);
  assert.equal(rows.size, 1);
});

test('id reutilizado com dados diferentes retorna 409 sem sobrescrever', async () => {
  const body = novo();
  await post(body);
  assert.equal((await post({ ...body, mensalidade: '100.00' })).status, 409);
  assert.equal((await post({ ...body, matricula: 'OUTRA' })).status, 409);
  assert.equal((await post({ ...body, aluno: 'Outro aluno' })).status, 409);
  assert.equal(rows.get(body.id).mensalidade, '129.90');
});

test('validação rejeita entradas inválidas sem consultar o banco', async () => {
  const body = novo();
  for (const invalido of [
    {}, [], { ...body, id: '1' }, { ...body, matricula: '' },
    { ...body, aluno: 42 }, { ...body, aluno: 'a'.repeat(101) },
    { ...body, matricula: "';DROP TABLE mensalidades;--" },
    { ...body, matricula: 'a'.repeat(31) }, { ...body, mensalidade: '-1' },
    { ...body, mensalidade: 'NaN' }, { ...body, mensalidade: 'Infinity' },
    { ...body, mensalidade: '0' }, { ...body, mensalidade: '1.001' },
    { ...body, mensalidade: '100000000' }, { ...body, mensalidade: null },
  ]) assert.equal((await post(invalido)).status, 400, JSON.stringify(invalido));
  assert.equal(queries.length, 0);
});

test('limites monetários aceitam centavo e NUMERIC(10,2) máximo', async () => {
  assert.equal((await post({ ...novo(), mensalidade: '0.01' })).status, 201);
  assert.equal((await post({ ...novo(), mensalidade: '99999999.99' })).status, 201);
});

test('health verifica banco e indisponibilidade não expõe detalhes', async () => {
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  falhar = true;
  for (const rota of ['/health', '/mensalidades']) {
    const response = await fetch(`${baseUrl}${rota}`);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /senha|segredo/);
  }
  assert.equal((await post(novo())).status, 503);
});

test('JSON malformado, corpo excessivo e rota inexistente têm erros consistentes', async () => {
  const malformed = await fetch(`${baseUrl}/mensalidades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).erro.codigo, 'JSON_INVALIDO');
  assert.equal((await post({ texto: 'x'.repeat(17000) })).status, 413);
  const missing = await fetch(`${baseUrl}/inexistente`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(missing.headers.get('x-powered-by'), null);
});

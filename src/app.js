import express from 'express';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validar(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { id, matricula, mensalidade } = body;
  const aluno = body.aluno ?? '';
  if (typeof aluno !== 'string' || aluno.trim().length > 100) return null;
  if (typeof id !== 'string' || !uuid.test(id) || typeof matricula !== 'string' ||
      !/^[a-zA-Z0-9-]{1,30}$/.test(matricula)) return null;
  if (!['string', 'number'].includes(typeof mensalidade)) return null;
  const decimal = String(mensalidade);
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(decimal) || Number(decimal) <= 0) return null;
  return { id: id.toLowerCase(), aluno: aluno.trim(), matricula, mensalidade: Number(decimal).toFixed(2) };
}

export function criarApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/', (_req, res) => res.json({
    nome: 'Academia API', versao: '1.0.0',
    rotas: ['GET /health', 'GET /mensalidades', 'POST /mensalidades'],
  }));

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1 FROM mensalidades LIMIT 1');
    res.json({ status: 'ok', banco: 'PostgreSQL' });
  });

  app.get('/mensalidades', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id, aluno, matricula, mensalidade, criado_em FROM mensalidades ORDER BY criado_em DESC, id');
    res.json(rows);
  });

  app.post('/mensalidades', async (req, res) => {
    const dados = validar(req.body);
    if (!dados) return res.status(400).json({ erro: {
      codigo: 'DADOS_INVALIDOS',
      mensagem: 'Informe id UUID, matrícula de até 30 letras/números/hífens e mensalidade positiva com até duas casas decimais.',
    } });

    const { id, aluno, matricula, mensalidade } = dados;
    // O UUID do aparelho torna o reenvio seguro se a resposta anterior se perder.
    const insercao = await pool.query(
      `INSERT INTO mensalidades (id, matricula, mensalidade, aluno) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING RETURNING id, aluno, matricula, mensalidade, criado_em`,
      [id, matricula, mensalidade, aluno]);
    if (insercao.rows.length) return res.status(201).json(insercao.rows[0]);

    const existente = await pool.query(
      'SELECT id, aluno, matricula, mensalidade, criado_em FROM mensalidades WHERE id = $1', [id]);
    const registro = existente.rows[0];
    if (!registro || registro.aluno !== aluno || registro.matricula !== matricula ||
        Number(registro.mensalidade).toFixed(2) !== mensalidade) {
      return res.status(409).json({ erro: {
        codigo: 'ID_CONFLITANTE', mensagem: 'Este identificador já pertence a outro cadastro.',
      } });
    }
    return res.status(200).json(registro);
  });

  app.use((_req, res) => res.status(404).json({ erro: {
    codigo: 'ROTA_INEXISTENTE', mensagem: 'Rota não encontrada.',
  } }));

  app.use((erro, _req, res, _next) => {
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: {
      codigo: 'JSON_INVALIDO', mensagem: 'Envie um JSON válido.',
    } });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: {
      codigo: 'CORPO_EXCEDIDO', mensagem: 'O corpo da requisição excede 16 KB.',
    } });
    return res.status(503).json({ erro: {
      codigo: 'SERVICO_INDISPONIVEL', mensagem: 'Não foi possível acessar o banco. Tente novamente.',
    } });
  });
  return app;
}

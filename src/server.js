import { criarApp } from './app.js';
import { criarPool } from './database.js';

const pool = criarPool();
pool.on('error', () => console.error('Conexão ociosa com PostgreSQL interrompida.'));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
const server = criarApp(pool).listen(port, '0.0.0.0', () => {
  console.log(`Academia API ouvindo na porta ${port}.`);
});

function encerrar() {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', encerrar);
process.once('SIGINT', encerrar);

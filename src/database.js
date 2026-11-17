import pg from 'pg';

export function criarPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Configure DATABASE_URL antes de iniciar a API.');
  return new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });
}

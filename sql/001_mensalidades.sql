CREATE TABLE IF NOT EXISTS mensalidades (
  id UUID PRIMARY KEY,
  matricula VARCHAR(30) NOT NULL CHECK (matricula ~ '^[a-zA-Z0-9-]{1,30}$'),
  mensalidade NUMERIC(10, 2) NOT NULL CHECK (mensalidade > 0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mensalidades_criadas ON mensalidades (criado_em DESC, id);

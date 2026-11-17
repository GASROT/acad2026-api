-- Compatível com a primeira versão da API; não remove mensalidades existentes.
ALTER TABLE mensalidades ADD COLUMN IF NOT EXISTS aluno VARCHAR(100) NOT NULL DEFAULT '';

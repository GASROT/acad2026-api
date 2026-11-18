# API Academia

Node.js 22 ou 24, Express 5 e PostgreSQL. API própria para a entidade `MensalidadeAcademia`.

- **Repositório da API:** https://github.com/GASROT/acad2026-api
- **Aplicativo Flutter:** https://github.com/GASROT/acad2026
- **Estudante:** GUILHERME DE ARAUJO SILVA.
- **URL pública:** pendente de implantação.

Este é um repositório independente. O código Node.js e o `render.yaml` não fazem parte do repositório Flutter.

## Desenvolvimento local

1. Crie um banco PostgreSQL de desenvolvimento.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL` com a conexão desse banco.
3. Execute na raiz deste repositório:

```sh
npm ci
node --env-file=.env src/migrate.js
npm run dev
```

A API escuta em `PORT` (padrão 3000). O arquivo de ambiente é ignorado pelo Git. `npm start` e `npm run migrate` usam variáveis fornecidas pelo ambiente, como no Render. As migrações são idempotentes: `001` cria a tabela e seu índice; `002` acrescenta o nome do aluno sem apagar mensalidades existentes.

## Contrato HTTP v1

CORS está habilitado para qualquer origem, com os métodos `GET`, `POST` e `OPTIONS` e o cabeçalho `Content-Type`. O middleware responde ao preflight de requisições JSON. Não são habilitadas credenciais de navegador (cookies). Essa configuração atende à API pública de demonstração; CORS não substitui autenticação.

| Método e rota | Resposta | Finalidade |
| --- | --- | --- |
| `GET /` | 200 | Identificação e rotas |
| `GET /health` | 200 ou 503 | Verifica acesso à tabela no PostgreSQL |
| `GET /mensalidades` | 200, array | Lista mensalidades por data decrescente |
| `POST /mensalidades` | 201 ou 200 | Cadastra ou confirma reenvio de uma mensalidade |

Exemplo de criação:

```sh
curl -X POST https://SUA-API.onrender.com/mensalidades \
  -H "Content-Type: application/json" \
  -d '{"id":"9c0359a2-f9d2-4cf6-a317-271e4a7bfbb7","aluno":"Aluno teste","matricula":"0007","mensalidade":"129.90"}'
```

No PowerShell, use `Invoke-RestMethod`:

```powershell
$registro = @{ id = [guid]::NewGuid().ToString(); aluno = 'Aluno teste'; matricula = '0007'; mensalidade = '129.90' }
Invoke-RestMethod -Method Post -Uri 'https://SUA-API.onrender.com/mensalidades' -ContentType 'application/json' -Body ($registro | ConvertTo-Json)
Invoke-RestMethod -Uri 'https://SUA-API.onrender.com/mensalidades'
```

Resposta de cadastro:

```json
{
  "id": "9c0359a2-f9d2-4cf6-a317-271e4a7bfbb7",
  "aluno": "Aluno teste",
  "matricula": "0007",
  "mensalidade": "129.90",
  "criado_em": "2026-11-17T12:00:00.000Z"
}
```

- `id`: UUID criado pelo cliente; reutilizar o mesmo no reenvio da mesma operação.
- `aluno`: nome do aluno de até 100 caracteres, obrigatório no formulário. A API aceita sua ausência como texto vazio para compatibilidade com cadastros feitos antes da migração `002`.
- `matricula`: texto de 1 a 30 caracteres alfanuméricos ou hífens. Não é chave única, pois o aluno pode ter várias mensalidades.
- `mensalidade`: decimal positivo, até `99999999.99`, no máximo duas casas decimais. Aceita número JSON ou texto decimal com ponto; as respostas usam texto para preservar precisão.
- `criado_em`: preenchido pelo PostgreSQL; não é a competência da mensalidade.

Mesmo `id` e mesmo conteúdo retornam 200 sem duplicar. Mesmo `id` com conteúdo diferente retorna 409 sem alterar a linha existente.

Erros seguem `{"erro":{"codigo":"...","mensagem":"..."}}`: 400 para dados/JSON inválidos, 409 para identificador conflitante, 413 para corpo acima de 16 KB, 404 para rota inexistente e 503 para banco indisponível. Consultas usam parâmetros; detalhes internos e credenciais não são retornados ao cliente.

Para comprovar a persistência no banco:

```sql
SELECT id, aluno, matricula, mensalidade, criado_em
FROM mensalidades
ORDER BY criado_em DESC;
```

## Publicar no Render

O arquivo `render.yaml` na raiz descreve a API e um PostgreSQL no mesmo serviço de hospedagem. Ele referencia a conexão interna por `DATABASE_URL`, restringe acessos externos ao PostgreSQL e usa `/health` como verificação de saúde.

1. Use o repositório `https://github.com/GASROT/acad2026-api` e a branch `main`.
2. No Render, crie um Blueprint a partir desse repositório e selecione a branch com `render.yaml`. Confira os recursos e as condições dos planos exibidos antes de confirmar a criação.
3. A compilação roda `npm ci`; a inicialização roda `npm run migrate && npm start`.
4. Após a publicação, abra a URL real em `/health` e `/mensalidades`.
5. Atualize os READMEs dos dois repositórios com essa URL e execute o Flutter com `--dart-define=API_BASE_URL=https://URL-REAL`.

Se configurar manualmente: deixe o diretório raiz em branco (o `package.json` está na raiz), runtime Node.js, build `npm ci`, start `npm run migrate && npm start`, variável `DATABASE_URL` e health check `/health`.

Os recursos e limitações de planos podem mudar; confira as condições no painel. Não há URL pública criada pelo simples fato de adicionar `render.yaml`. Para uma conexão externa PostgreSQL com TLS, use certificado confiável e `sslmode=verify-full`; não utilize `rejectUnauthorized: false`.

Esta API atende ao exercício, cujo escopo não exige autenticação. Use dados fictícios na demonstração pública. Não é um serviço de produção para dados pessoais de alunos.

## Testes

```sh
npm run check
npm test
```

O teste de integração precisa de `TEST_DATABASE_URL` apontando para banco descartável/de teste e permissão para criar um schema. Ele verifica o schema SQL, persistência real e idempotência sob envios concorrentes:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/academia_teste'
npm run test:integration
```

Referências: [Express](https://expressjs.com/en/guide/routing.html), [consultas parametrizadas node-postgres](https://node-postgres.com/features/queries), [Blueprints Render](https://render.com/docs/blueprint-spec).

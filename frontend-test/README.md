# Front de Testes — CondoGov API

Cliente estático e independente para testar a API sem modificar o backend.

## Conteúdo

- `index.html`: UI simples para chamadas aos endpoints
- `app.js`: lógica para enviar requisições e exibir respostas
- `styles.css`: estilo básico (escuro)

## Como executar (sem afetar a API)

1) Certifique-se de que sua API esteja rodando (por padrão em `http://localhost:3000`).

2) Sirva esta pasta em um servidor estático (CORS já permite `5173` e `8080` por padrão):

Opção A (Node, sem instalar nada global):

```bash
npx serve -l 5173 frontend-test
```

ou

```bash
npx http-server -p 5173 frontend-test
```

Opção B (Python 3):

```bash
cd frontend-test
python -m http.server 8080
```

3) Acesse o front-end em:

- `http://localhost:5173` (ou `http://localhost:8080`)

4) Preencha os campos de configuração no topo:

- URL da API (ex.: `http://localhost:3000`)
- `x-company-id` (UUID)
- `x-user-id`

Clique em “Salvar configuração” (grava em `localStorage`).

## Endpoints suportados na UI

- POST `/api/documents/ingest-auto` (upload base64 + subject)
- GET `/api/documents/verify-import?companyId=...`
- GET `/api/documents/extract/schemas`
- GET `/api/documents/extract/schema-from-table?table=...&mode=...`
- POST `/api/documents/extract/base64` (arquivo em base64 + schema via template ou JSON)
- POST `/api/documents/extract` (multipart: `file`, `schema`, `options`)
- GET `/api/documents/knowledge/stats?companyId=UUID`

Observações importantes:

- Para PDF e também para endpoints de extração, a API exige `OPENROUTER_API_KEY` setada no backend.
- Para testar ingestão de CSV/XLSX, a API também valida a presença dessa variável (veja logs da API se obtiver erro 500).
- Os headers `x-company-id` e `x-user-id` são obrigatórios em quase todas as rotas.

## Segurança/CORS

Este cliente é estático e não altera o backend. O CORS no backend já permite as origens padrões:

- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8080`

Se você servir o front nestas portas, as chamadas devem funcionar sem ajustes.



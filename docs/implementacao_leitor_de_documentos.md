# Implementação — Leitor de Documentos (Ingestão Automática orientada a assunto)

Este documento descreve a solução completa para fazer upload de um único documento (PDF/XLSX/CSV), informar apenas o “assunto” (ex.: moradores, unidades, ou auto) e a API:

1) faz a varredura e identifica os dados relevantes;
2) normaliza/valida conforme as restrições reais do banco;
3) resolve chaves/fks (ex.: unitNumber → unit_id);
4) decide automaticamente a(s) tabela(s) de destino e faz o upsert idempotente;
5) retorna um relatório consolidado por entidade.

## Rotas envolvidas

- POST `/api/documents/extract` (multipart): extrai e salva com `schema` explícito (arquivo via FormData).
- POST `/api/documents/extract/base64` (JSON): extrai e salva com `schema` explícito (arquivo inline base64). Recomendado para front/Insomnia.
- GET `/api/documents/extract/schemas`: templates prontos de `schema` para “unidades” e “moradores`.
- GET `/api/documents/extract/schema-from-table?table=...&mode=...`: gera `schema` dinâmico a partir de tabela pública (mode `withUnitNumber` especial para residents).
- GET `/api/documents/verify-import?companyId=...`: verifica contagens/amostras do que foi salvo.
- NOVA: POST `/api/documents/ingest-auto`: você envia apenas arquivo + `subject` (ou `auto`) e a API cuida do resto (classificação, schema e salvamento).

Headers obrigatórios nas rotas:
- `x-company-id`: UUID da empresa/condomínio
- `x-user-id`: usuário que executa a ação

## Estratégia de mapeamento (integridade e normalização)

- `condominium_units` (unidades):
  - CHECKs do BD: 
    - `occupancy_status ∈ {vacant, occupied, reserved, maintenance}`
    - `type ∈ {apartment, house, commercial, garage, storage}`
  - Normalização automática dos valores (ex.: “ocupada” → `occupied`).
  - Dedupe: `(company_id, number, block)`

- `condominium_residents` (moradores):
  - CHECK do BD:
    - `relationship ∈ {owner, tenant, family, employee}`
  - Resolução de FK: `unitNumber` (+ `block`) → `unit_id` (busca em lote por `(company_id, number)`).
  - Dedupe: `(company_id, unit_id, name)`

## Funcionamento do `/api/documents/ingest-auto`

Entrada (JSON):
```json
{
  "fileName": "arquivo.csv|xlsx|pdf",
  "fileBase64": "<base64>",
  "subject": "moradores | unidades | auto",
  "options": {
    "dryRun": false,
    "companyName": "Encantos do Norte"
  }
}
```

Pipeline interno:
1) Detecta tipo do arquivo (CSV/XLSX/PDF).
2) Classificação por assunto:
   - Se `subject != auto`: usa diretamente o destino (ex.: moradores → `condominium_residents`).
   - Se `subject == auto`: heurísticas por header/colunas (CSV/XLSX) ou IA (PDF) para separar linhas/blocos por entidade (v1: heurística para `residents`/`units`).
3) Para cada entidade detectada, gera `schema` automaticamente (via `schema-from-table` ou registry interno) para a(s) tabela(s) alvo.
4) Chama o motor já existente de extração/salvamento (reutiliza `/extract/base64`) com o `schema` gerado.
5) Consolida e retorna um relatório por entidade `{ inserted, updated, errors[], stats }`.

Saída (exemplo):
```json
{
  "success": true,
  "entities": {
    "condominium_residents": { "inserted": 148, "updated": 2, "errors": [] },
    "condominium_units": { "inserted": 6, "updated": 0, "errors": [] }
  }
}
```

## Como usar no front (exemplos)

### 1) Upload automático (recomendado)
```ts
await fetch("http://localhost:3000/api/documents/ingest-auto", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-company-id": "<UUID>",
    "x-user-id": "<USER>"
  },
  body: JSON.stringify({
    fileName: file.name,
    fileBase64: await toBase64(file),
    subject: "auto", // ou "moradores" | "unidades"
    options: { dryRun: false, companyName: "Encantos do Norte" }
  })
});
```

### 2) Verificação
```ts
await fetch("http://localhost:3000/api/documents/verify-import?companyId=<UUID>", {
  headers: { "x-company-id": "<UUID>", "x-user-id": "<USER>" }
});
```

## Roadmap incremental

- v1 (agora): moradores/unidades; CSV/XLSX/PDF; classificação heurística (e IA para PDF simples); registry interno para schemas; relatório por entidade.
- v2: classificador avançado (IA multi‑entidade), schemas dinâmicos por introspecção segura, operadores de transformação custom pelo usuário (mapeamento de colunas), filas assíncronas para lotes grandes.

---

Este documento será mantido junto da implementação para garantir alinhamento entre o que o front envia (apenas “assunto” e arquivo) e o que o backend entrega (salvamento automático consistente com o banco). 
*** End Patch



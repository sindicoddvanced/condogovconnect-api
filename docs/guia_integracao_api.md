# Guia de Integração — Leitor de Documentos (API)

Este guia explica, de ponta a ponta, como integrar seu front-end com a API de ingestão de documentos para extrair dados de PDFs/XLSX/CSV e salvar automaticamente no banco, sem você precisar informar colunas ou tabela. Você só envia o arquivo e o “assunto” (moradores, unidades ou auto).

## Sumário rápido
- Endpoint principal (automático): `POST /api/documents/ingest-auto`
- Headers obrigatórios: `x-company-id`, `x-user-id`
- Body: `{ fileName, fileBase64, subject, options }`
- Verificação: `GET /api/documents/verify-import?companyId=...`
- Exemplos prontos: `docs/encantos_unidades.csv` e `docs/encantos_moradores.csv`
- Coleção Insomnia: `docs/Insomnia_CondoGov_Import.json`

---

## 1) Conceito
Você envia um único arquivo e o assunto (ex.: “moradores”, “unidades”, “auto”). A API:
1) Identifica e separa os dados relevantes (classificação automática);
2) Gera internamente o “schema” correto com base na(s) tabela(s) do banco;
3) Normaliza valores para atender CHECKs (enums) reais;
4) Resolve FKs (ex.: `unitNumber` → `unit_id`);
5) Upsert idempotente por chaves naturais;
6) Retorna um relatório por entidade `{ inserted, updated, errors, stats }`.

---

## 2) Endpoints

### 2.1) POST /api/documents/ingest-auto
Entrada JSON (Content-Type: application/json):
```json
{
  "fileName": "arquivo.csv|xlsx|pdf",
  "fileBase64": "<BASE64_DO_ARQUIVO>",
  "subject": "moradores | unidades | auto",
  "options": {
    "dryRun": false,
    "companyName": "Encantos do Norte"
  }
}
```
Headers obrigatórios:
- `x-company-id`: UUID da empresa/condomínio
- `x-user-id`: ID do usuário da sua aplicação

Resposta (exemplo):
```json
{
  "success": true,
  "entities": {
    "condominium_residents": { "inserted": 148, "updated": 2, "errors": [], "stats": { "parsed": 150 } },
    "condominium_units": { "inserted": 6, "updated": 0, "errors": [], "stats": { "parsed": 6 } }
  }
}
```

Observações:
- `subject: "auto"` tenta classificar o conteúdo; `moradores` ou `unidades` vai direto ao destino.
- `options.dryRun: true` ativa modo pré-visualização (não salva, só valida/mostra erros).

### 2.2) GET /api/documents/verify-import
Retorna contagens e amostras do que foi salvo.
- Query: `companyId=UUID`
- Headers: `x-company-id`, `x-user-id`

### 2.3) Utilidades (opcional)
- `GET /api/documents/extract/schemas`: templates prontos (unidades e moradores).
- `GET /api/documents/extract/schema-from-table?table=...&mode=...`:
  - `table`: ex. `condominium_residents`, `condominium_units`
  - `mode`: `direct` (padrão) ou `withUnitNumber` (substitui `unit_id` por `unitNumber` + `block`).
- `POST /api/documents/extract` (multipart) e `POST /api/documents/extract/base64` (JSON) — mecanismos de baixo nível (casos avançados).

---

## 3) Integração no Front (TypeScript/React)

### 3.1) Utilitário para Base64
```ts
export function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      res(b64);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
```

### 3.2) Chamada ao endpoint automático
```ts
export async function ingestAuto({
  file,
  subject = "auto",
  dryRun = false,
  companyId,
  userId,
  companyName = "Encantos do Norte",
}: {
  file: File;
  subject?: "moradores" | "unidades" | "auto";
  dryRun?: boolean;
  companyId: string;
  userId: string;
  companyName?: string;
}) {
  const fileBase64 = await toBase64(file);

  const res = await fetch("http://localhost:3000/api/documents/ingest-auto", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-company-id": companyId,
      "x-user-id": userId,
    },
    body: JSON.stringify({
      fileName: file.name,
      fileBase64,
      subject,
      options: { dryRun, companyName },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { success, entities: { table: { inserted, updated, errors, stats } } }
}
```

### 3.3) Fluxo recomendado no front
1) Envie com `dryRun: true` para pré-visualizar erros/estatística e mostrar para o usuário;
2) Se aprovado, reenvie com `dryRun: false` para persistir;
3) Em seguida, faça `GET /api/documents/verify-import?companyId=...` e mostre contagens/amostras.

---

## 4) Regras e Garantias de Integridade

### 4.1) Unidades — `public.condominium_units`
- CHECKs do BD:
  - `occupancy_status ∈ {vacant, occupied, reserved, maintenance}`
  - `type ∈ {apartment, house, commercial, garage, storage}`
- A API normaliza valores comuns de português (ex.: “ocupada” → `occupied`).
- Dedupe: `(company_id, number, block)`

### 4.2) Moradores — `public.condominium_residents`
- CHECK do BD: `relationship ∈ {owner, tenant, family, employee}`
- Resolução de FK: `unitNumber` (+ `block`) → `unit_id` (busca em lote por `(company_id, number)`).
- Dedupe: `(company_id, unit_id, name)`

### 4.3) Erros
- Linhas inválidas não são gravadas; retornam em `errors` com `{row, field, message}`.
- Ex.: falta de `unitNumber`, `relationship` fora do CHECK, unidade não encontrada/ambígua etc.

---

## 5) Exemplos práticos (Insomnia)

### 5.1) Importar automático com Base64
- Método: POST
- URL: `http://localhost:3000/api/documents/ingest-auto`
- Headers: `x-company-id`, `x-user-id`, `Content-Type: application/json`
- Body (JSON): 
  ```json
  {
    "fileName": "encantos_moradores.csv",
    "fileBase64": "{{ file 'docs/encantos_moradores.csv', 'base64' }}",
    "subject": "auto",
    "options": { "dryRun": false, "companyName": "Encantos do Norte" }
  }
  ```

### 5.2) Verificar
- Método: GET
- URL: `http://localhost:3000/api/documents/verify-import?companyId=559d2e2e-fa0e-463d-a3f9-d770fcaa83de`
- Headers: `x-company-id`, `x-user-id`

> Observação: a coleção `docs/Insomnia_CondoGov_Import.json` já traz requests prontos.

---

## 6) Segurança e Multi‑tenant
- Sempre envie `x-company-id` e `x-user-id`.
- A API injeta `company_id`/`client_id` ao salvar e aplica dedupe por empresa.
- Para bloquear acesso a `information_schema` em produção, utilize o endpoint automático e/ou os templates estáticos de schema.

---

## 7) Troubleshooting
- 400: arquivo ausente, subject inválido ou headers faltando.
- 500: verifique `error` no retorno; linhas individuais com erro aparecem em `entities.<tabela>.errors`.
- “Unidade não encontrada” / “ambígua”: ajuste `block` ou garanta que a unidade foi importada antes dos moradores.

---

## 8) Anexos
- CSVs de exemplo: `docs/encantos_unidades.csv`, `docs/encantos_moradores.csv`
- Documento de arquitetura/visão: `docs/implementacao_leitor_de_documentos.md`

---

Pronto. Com este guia você consegue integrar o upload no seu front, informar apenas o “assunto” e deixar a API decidir schema/tabelas e salvar tudo de forma consistente com o banco.



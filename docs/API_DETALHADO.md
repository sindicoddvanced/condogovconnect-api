# CondoGov AdminAssistant — Documentação Detalhada da API

Este documento descreve todos os recursos expostos pela API, com headers obrigatórios, parâmetros, corpo de requisições, respostas e observações de uso. A API é multi‑tenant, exigindo identificação de empresa e usuário via headers.

## Visão Geral

- Base URL (padrão local): `http://localhost:3000`
- Health: `GET /`
- Documentação básica: `GET /docs`
- Principais módulos:
  - `AI` (`/api/ai/*`): Chat, RAG, análises, sugestões e health do RAG
  - `Chat` (`/api/chat/*`): Sessões de chat, mensagens e exportação
  - `Documents` (`/api/documents/*`): Ingestão, extração (CSV/XLSX/PDF), schemas, verificação e conhecimento
  - `Transcription` (`/api/transcription/*`): Transcrição de áudios e gravações de videoconferência
  - `Assembly` (`/api/assembly/*`): Assembleias e geração/insights de atas com IA
  - `Minutes` (`/api/minutes/*`): Geração, gestão e download de atas
  - `Autentique` (`/api/autentique/*`): Integração de assinatura eletrônica (criar, listar, status, lembretes, webhook)
  - `Analytics` (`/api/analytics/*`): Métricas diversas e dashboard

## Autenticação e Multi‑tenant

Headers obrigatórios (na maioria das rotas):

- `x-company-id`: UUID da empresa/condomínio
- `x-user-id`: identificador do usuário (string)

Exemplo:

```http
GET /api/ai/models HTTP/1.1
Host: localhost:3000
x-company-id: 559d2e2e-fa0e-463d-a3f9-d770fcaa83de
x-user-id: admin
```

## CORS

Origens permitidas por padrão (ajustável via `CORS_ORIGINS`):

- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8080`

## Requisitos de Ambiente

Variáveis (veja `env.example`):

- `OPENROUTER_API_KEY`: obrigatório para endpoints que usam LLM (extração de PDF, etc.)
- `OPENAI_API_KEY`: recomendado para embeddings diretos
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (já configurados no exemplo)
- Outras: `PORT`, `CORS_ORIGINS`, etc.

---

## 1) AI — `/api/ai/*`

- `GET /api/ai/models`

  - Lista modelos disponíveis.
  - Resposta: `{ success, data: Array<{ id, name, provider, ... }> }`

- `GET /api/ai/models/:modelId`

  - Detalhes de um modelo.

- `POST /api/ai/chat`

  - Body (principais campos):
    - `message: string` (obrigatório)
    - `model: string` (ex.: `"openai/gpt-5-chat"`)
    - `sessionId?: string`
    - `userId: string` (obrigatório; redundante ao header, usado internamente)
    - `contextMode?: "general" | "sector"` (default `general`)
    - `sector?: string` (obrigatório se `contextMode="sector"`)
    - `includeImages?: boolean`, `imageUrls?: string[]`
  - Resposta inclui: `response { message, model, tokens, citations?, memoryUsed? }`, `session`, `context`.

- `POST /api/ai/analyze`

  - Body:
    - `data: any`
    - `analysisType: "performance" | "financial" | "alerts" | "optimization"`
    - `model?: string` (default `"openai/gpt-4.1"`)
    - `userId: string`
    - `contextMode?`, `sector?`
  - Cria sessão e retorna `analysis` e `session`.

- `GET /api/ai/suggestions?category=...`

  - Sugestões rápidas filtradas por categoria (opcional).

- `GET /api/ai/rag/health?companyId=UUID&sector=...`
  - Health do fluxo RAG: embedding e retrieval, com amostra de citações.
  - Observação: `companyId` via query é obrigatório; `sector` opcional.

---

## 2) Chat — `/api/chat/*`

- `GET /api/chat/sessions/:userId`

  - Lista sessões do usuário no tenant (requer `x-company-id` no header).

- `POST /api/chat/sessions`

  - Body:
    - `userId: string`
    - `model: string`
    - `contextMode?: "general" | "sector"`
    - `sector?: string` (obrigatório se `contextMode="sector"`)
  - Retorna sessão criada.

- `GET /api/chat/sessions/:sessionId/details`
- `DELETE /api/chat/sessions/:sessionId`
- `POST /api/chat/sessions/:sessionId/clear`

  - Limpa mensagens da sessão.

- `PUT /api/chat/sessions/:sessionId/messages/:messageId`

  - Body: `{ favorite?: boolean, tokens?: number }`

- `GET /api/chat/sessions/:sessionId/export`

  - Retorna JSON da sessão como texto; headers ajustados para download.

- `GET /api/chat/sessions/:sessionId/stats`

  - Estatísticas (contagem de mensagens, tokens, duração).

- `GET /api/chat/search/:userId?q=...`
  - Busca sessões por conteúdo.

---

## 3) Documents — `/api/documents/*`

Principais headers: `x-company-id`, `x-user-id`. Várias rotas utilizam Supabase e LLMs via OpenRouter (exige `OPENROUTER_API_KEY`).

- `POST /api/documents/generate`

  - Body: `{ prompt, documentType: "pdf"|"docx", templateId?, companyId, metadata: { sector, category, tags[] } }`
  - Gera documento com IA (serviço interno).

- `GET /api/documents/extract/schema-from-table?table=public_table&mode=direct|withUnitNumber`

  - Gera schema dinâmico a partir de tabela pública (ex.: `condominium_units`, `condominium_residents`).
  - `mode=withUnitNumber` aplica regras especiais para residentes (resolver `unit_id` a partir de `unitNumber` e `block`).

- `POST /api/documents/transcribe-audio`

  - Aceita `multipart/form-data` (campo `audioFile`) ou JSON com `audioUrl`.
  - Body JSON (quando usado): `{ audioUrl?, companyId, meetingId?, options { language, speakerIdentification, ... } }`

- `POST /api/documents/summarize-minute`

  - Body: `{ minuteId, minuteContent?, summaryType, companyId }`

- `GET /api/documents/processing/:processingId`

  - Status simulado de processamento (exemplo).

- `POST /api/documents/ingest-knowledge`

  - Body: `{ companyId(uuid), sector, title, content(min 20), tags? }`
  - Gera embedding e insere em `knowledge_sources`/`knowledge_chunks` (via RPC ou fallback).

- `POST /api/documents/reseed-knowledge`

  - Body: `{ companyId(uuid), clear?: boolean }`
  - Reseed de conhecimento padrão para a empresa.

- `POST /api/documents/extract` (multipart)

  - Campos:
    - `file` (CSV/XLSX/PDF)
    - `schema` (string JSON)
    - `options` (string JSON) — inclui `dryRun`, `companyName` (resolve IDs por nome)
  - Comportamento:
    - CSV/XLSX: mapeamento por headers → `schema.fields`
    - PDF: extrai texto e usa LLM para materializar o schema (requer OpenRouter)
    - Validação (required/pattern), dedupe, resolução de FKs (residents) e normalização (units).
    - Salva em tabela `schema.output.target.table` (ex.: `condominium_units`, `condominium_residents`) quando `dryRun=false`.

- `GET /api/documents/knowledge/stats?companyId=UUID`

  - Retorna total e contagem por setor em `knowledge_chunks`.

- `POST /api/documents/extract/base64`

  - Body: `{ fileName, fileBase64, schema, options? }`
  - Mesma lógica do `extract` porém com arquivo em base64. Suporta CSV/XLSX/PDF.

- `GET /api/documents/extract/schemas`

  - Retorna templates prontos de schema (`unitSchema`, `residentSchemaWithUnitId`, `residentSchemaWithUnitNumber`) com `output.target` configurado.

- `POST /api/documents/ingest-auto`

  - Body: `{ fileName, fileBase64, subject: "moradores"|"unidades"|"auto", options? { dryRun?, companyName? } }`
  - Classifica e gera schema automaticamente (v1: heurísticas por headers para CSV/XLSX; PDF default para residentes). Reutiliza `/extract/base64` internamente e retorna consolidado por tabela.

- `GET /api/documents/verify-import?companyId=UUID`
  - Retorna contagens e amostras de `condominium_units` e `condominium_residents` para validação.

Exemplo (ingest-auto):

```bash
curl -X POST "http://localhost:3000/api/documents/ingest-auto" \
  -H "Content-Type: application/json" \
  -H "x-company-id: 559d2e2e-fa0e-463d-a3f9-d770fcaa83de" \
  -H "x-user-id: admin" \
  -d '{
    "fileName": "encantos_unidades.csv",
    "fileBase64": "<BASE64>",
    "subject": "auto",
    "options": { "dryRun": false, "companyName": "Encantos do Norte" }
  }'
```

---

## 4) Transcription — `/api/transcription/*`

- `POST /api/transcription/submit`

  - Body: `{ audio_url, language_code?, speaker_labels?, auto_highlights?, sentiment_analysis?, entity_detection?, formatting?, custom_vocabulary?, companyId }`

- `GET /api/transcription/:transcription_id/status`

  - Status da transcrição.

- `POST /api/transcription/videoconference/recordings/upload` (multipart)

  - Campos: `recording`, `roomId`, `roomName`, `isAssembly?`, `assemblyTitle?`, `clientId?`, `assemblyDescription?`.

- `GET /api/transcription/videoconference/recordings/:recording_id/status`
  - Status do processamento da gravação.

---

## 5) Assembly — `/api/assembly/*`

- `POST /api/assembly/assemblies`

  - Body: `{ title, description?, scheduledDate?, location?, status?, clientId?, recordingId?, companyId }`

- `GET /api/assembly/assemblies?clientId=&status=`

  - Lista assembleias (requer `x-company-id`).

- `GET /api/assembly/transcription/:assemblyId`

  - Transcrição associada.

- `POST /api/assembly/ai/generate-minutes`

  - Body: `{ transcription_text, assembly_details { title, date, location, type }, format?, include_sections?, custom_instructions?, language?, companyId }`

- `POST /api/assembly/ai/analyze-sentiment`

  - Body: `{ transcription_text, analysis_type?, sensitivity?, companyId }`

- `POST /api/assembly/ai/generate-summary`

  - Body: `{ minutes_content, summary_type?, max_length?, include_metrics?, target_audience?, companyId }`

- `POST /api/assembly/ai/identify-speakers`
  - Body: `{ transcription_data { speakers: [ { speaker, text, start_time } ] }, known_participants?, companyId }`

---

## 6) Minutes — `/api/minutes/*`

- `POST /api/minutes/generate/:assemblyId`

  - Body: `{ format?, generatePdf?, aiSummary?, sendForSignature?, customTranscription?, signers?, companyId }`

- `POST /api/minutes/generate-from-recording/:recordingId`

  - Body: `{ format?, aiSummary?, companyId }`

- `GET /api/minutes/available/assemblies?clientId=&status=`

  - Lista assembleias disponíveis para gerar atas.

- `GET /api/minutes?page=1&limit=20&clientId=&status=`

  - Paginação e filtros.

- `GET /api/minutes/:id`

  - Busca uma ata específica.

- `POST /api/minutes/:id/signatures`

  - Body: `{ signers: [ { name, email, role? }, ... ], companyId }`
  - Adiciona assinantes.

- `POST /api/minutes/:id/reminders`

  - Envia lembretes para assinaturas.

- `GET /api/minutes/:id/download/pdf`
  - Download do PDF da ata.

---

## 7) Autentique — `/api/autentique/*`

- `POST /api/autentique/documents`

  - Body: `{ name, files: [ { file(base64), filename } ], signers: [ { name, email, phone?, action?, order? } ], settings?, companyId }`
  - Cria documento para assinatura.

- `GET /api/autentique/documents/:documentId`

  - Status do documento.

- `POST /api/autentique/webhook`

  - Webhook (validação de assinatura com `AUTENTIQUE_WEBHOOK_SECRET` se configurado).

- `GET /api/autentique/documents?status=&page=1&limit=20`

  - Lista documentos.

- `POST /api/autentique/documents/:documentId/cancel`
- `POST /api/autentique/documents/:documentId/remind`
  - Cancelar documento / Enviar lembrete.

---

## 8) Analytics — `/api/analytics/*`

- `GET /api/analytics/assembly-metrics?start_date=&end_date=&client_id=`
- `GET /api/analytics/transcription-metrics?start_date=&end_date=`
- `GET /api/analytics/signature-metrics?start_date=&end_date=`
- `GET /api/analytics/usage-metrics?start_date=&end_date=`
- `GET /api/analytics/dashboard?period=7d|30d|90d|1y`

Retornam métricas agregadas para a empresa (`x-company-id`).

---

## 9) Notifications — `/api/notifications/*`

Integração com Expo Push Notifications usando tokens armazenados na tabela `push_tokens` (MCP primeiro; fallback Supabase client). A associação é feita via `employee_id` e, opcionalmente, filtrada por `company_id`.

- `POST /api/notifications/register-token`

  - Headers: `x-company-id`, `x-user-id`
  - Body:
    ```json
    {
      "employeeId": "employee-123",
      "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
      "deviceId": "device-uuid-optional",
      "platform": "ios" | "android" | "unknown"
    }
    ```
  - Comportamento: faz upsert em `push_tokens` por `(employee_id, push_token)` e salva `company_id`, `device_id`, `platform`.
  - Resposta:
    ```json
    {
      "success": true,
      "data": {
        "employeeId": "...",
        "pushToken": "...",
        "platform": "ios",
        "deviceId": "..."
      }
    }
    ```

- `POST /api/notifications/send`
  - Headers: `x-company-id`, `x-user-id`
  - Body:
    ```json
    {
      "employeeId": "employee-123",
      "title": "Título",
      "body": "Mensagem",
      "data": { "type": "custom", "any": "payload" }
    }
    ```
  - Fluxo: busca tokens na tabela `push_tokens` (MCP → fallback Supabase), valida tokens Expo, envia em chunks via HTTP para `https://exp.host/--/api/v2/push/send`.
  - Resposta (exemplo):
    ```json
    {
      "success": true,
      "data": {
        "success": true,
        "message": "Notificações enviadas",
        "metrics": {
          "totalTokensFound": 2,
          "validExpoTokens": 2,
          "ticketsSent": 2
        },
        "details": { "usedTokens": ["ExponentPushToken[...]"] }
      }
    }
    ```

Requisitos:

- Sem dependência extra: envio via HTTP para o endpoint do Expo.
- Tabela `push_tokens` contendo, no mínimo: `employee_id`, `push_token`, `company_id` (opcional), `device_id` (opcional), `platform` (opcional), `created_at`, `updated_at`.
- Índices (recomendado): unique `(employee_id, push_token)`, índices por `employee_id` e `push_token`.

Exemplos curl:

```bash
# Registrar token
curl -X POST "http://localhost:3000/api/notifications/register-token" \
  -H "Content-Type: application/json" \
  -H "x-company-id: 559d2e2e-fa0e-463d-a3f9-d770fcaa83de" \
  -H "x-user-id: admin" \
  -d '{
    "employeeId": "employee-123",
    "pushToken": "ExponentPushToken[xxxxxxxxxxxxxx]",
    "deviceId": "device-uuid",
    "platform": "android"
  }'

# Enviar notificação
curl -X POST "http://localhost:3000/api/notifications/send" \
  -H "Content-Type: application/json" \
  -H "x-company-id: 559d2e2e-fa0e-463d-a3f9-d770fcaa83de" \
  -H "x-user-id: admin" \
  -d '{
    "employeeId": "employee-123",
    "title": "Título",
    "body": "Corpo da notificação",
    "data": { "type": "test" }
  }'
```

---

## 10) Padrão de Erros

Formato típico de erro:

```json
{
  "success": false,
  "error": "Mensagem de erro",
  "details": [
    /* zod issues (quando houver) */
  ]
}
```

Status comuns: `400` (validação), `401`/`403` (quando aplicável), `404` (não encontrado), `500` (erro interno).

---

## 10) Dicas Práticas

- Para importações (Documents), use `dryRun: true` para validar antes de salvar.
- Em `residentSchemaWithUnitNumber`, o backend resolve `unit_id` via `(company_id, number, block)` com batelada para performance.
- Para `condominium_units`, valores são normalizados aos CHECKs do banco (ex.: `occupancy_status`, `type`).
- `options.companyName` pode resolver `companyId`/`clientId` automaticamente (quando há match único).
- O front de testes em `frontend-test/` facilita chamadas comuns (ingest‑auto, extract base64/multipart e knowledge stats).

---

Se precisar de exemplos prontos de CSV/XLSX, veja a pasta `docs/` e a coleção `docs/Insomnia_CondoGov_Import.json`.

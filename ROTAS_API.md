# Documentação Completa de Rotas - CondoGov Connect API

## Índice
1. [Rotas Gerais](#rotas-gerais)
2. [Rotas de IA](#rotas-de-ia)
3. [Rotas de Chat](#rotas-de-chat)
4. [Rotas de Documentos](#rotas-de-documentos)
5. [Rotas de Transcrição](#rotas-de-transcrição)
6. [Rotas de Assembleia](#rotas-de-assembleia)
7. [Rotas de Atas](#rotas-de-atas)
8. [Rotas de Autentique](#rotas-de-autentique)
9. [Rotas de Analytics](#rotas-de-analytics)
10. [Rotas de Notificações](#rotas-de-notificações)
11. [Rotas de Vídeo (Daily.co)](#rotas-de-vídeo-dailyco)

---

## Rotas Gerais

### `GET /`
**Descrição:** Health check da API  
**Headers:** Nenhum obrigatório  
**Resposta:** Status da API, versão, timestamp e lista de endpoints disponíveis

### `GET /docs`
**Descrição:** Documentação básica da API  
**Headers:** Nenhum obrigatório  
**Resposta:** Documentação completa com todos os endpoints, modelos de IA disponíveis e exemplos de uso

---

## Rotas de IA (`/api/ai`)

### `GET /api/ai/models`
**Descrição:** Lista todos os modelos de IA disponíveis  
**Headers:** Nenhum obrigatório  
**Resposta:** Array com informações de todos os modelos (GPT-5, GPT-4.1, Gemini 2.5 Pro, Claude Sonnet 4, Grok 4)

### `GET /api/ai/models/:modelId`
**Descrição:** Obtém detalhes de um modelo específico  
**Parâmetros:** `modelId` - ID do modelo  
**Headers:** Nenhum obrigatório  
**Resposta:** Detalhes completos do modelo solicitado

### `POST /api/ai/chat`
**Descrição:** Envia mensagem para IA com suporte a RAG (Retrieval Augmented Generation)  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório ou no body)
**Body:**
```json
{
  "message": "string",
  "model": "string",
  "sessionId": "string (opcional)",
  "userId": "string",
  "includeImages": "boolean (opcional)",
  "imageUrls": "array de URLs (opcional)",
  "contextMode": "general|sector",
  "sector": "string (opcional, obrigatório se contextMode=sector)"
}
```
**Resposta:** Resposta da IA com citações, memórias usadas, sessão atualizada e contexto

### `POST /api/ai/analyze`
**Descrição:** Análise inteligente de dados do condomínio  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório ou no body)
**Body:**
```json
{
  "data": "any",
  "analysisType": "performance|financial|alerts|optimization",
  "model": "string (opcional)",
  "userId": "string",
  "contextMode": "general|sector",
  "sector": "string (opcional)"
}
```
**Resposta:** Análise gerada pela IA com sessão criada

### `GET /api/ai/suggestions`
**Descrição:** Obtém sugestões rápidas de mensagens  
**Query Params:** `category` (opcional)  
**Headers:** Nenhum obrigatório  
**Resposta:** Lista de sugestões rápidas, opcionalmente filtradas por categoria

### `GET /api/ai/sector-summary/:sector`
**Descrição:** Gera automaticamente um resumo para um setor específico. Por padrão retorna um **resumo rápido** com alertas críticos e dica rápida (ideal para dashboard). Com o parâmetro `full=true` retorna um **resumo completo** detalhado. Busca dados do banco de dados do setor automaticamente.  
**Parâmetros:** 
- `sector` (obrigatório) - Nome do setor (ex: "CRM", "Manutenção", "Comunicação", "Financeiro", "Projetos", "Tarefas")
**Query Params:** 
- `model` (opcional) - Modelo de IA a usar (padrão: "google/gemini-2.5-flash")
- `full` (opcional) - Se `true`, retorna resumo completo detalhado. Se `false` ou omitido, retorna resumo rápido (padrão)
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Resposta (Resumo Rápido - padrão):**
```json
{
  "success": true,
  "data": {
    "sector": "CRM",
    "summary": "## 📊 Resumo Executivo\n[2-3 frases sobre a situação]\n\n## ⚠️ Alertas Críticos\n[Itens urgentes ou '✅ Nenhum alerta crítico no momento.']\n\n## 💡 Dica Rápida\n[Uma dica prática para hoje]",
    "model": "google/gemini-2.5-flash",
    "tokens": 600,
    "citations": 5,
    "timestamp": "2025-12-21T03:00:00.000Z",
    "citationsDetails": [...],
    "criticalAlerts": [
      {
        "id": "alert_123",
        "sector": "CRM",
        "content": "Proposta X está vencida há 5 dias",
        "priority": "critical",
        "source": "proposals",
        "tags": ["urgent", "overdue"]
      }
    ],
    "hasCriticalAlerts": true,
    "quickTip": "Seguir up com proposta X hoje para evitar perda de oportunidade",
    "type": "quick",
    "hasFullReport": true
  }
}
```
**Resposta (Resumo Completo - `full=true`):**
```json
{
  "success": true,
  "data": {
    "sector": "CRM",
    "summary": "Resumo completo em markdown com:\n- 🔍 VISÃO GERAL\n- 📊 SITUAÇÃO ATUAL\n- ⚠️ ALERTAS\n- 💡 RECOMENDAÇÕES\n- 🧭 PRÓXIMOS PASSOS\n- 💬 DICAS OPERACIONAIS",
    "model": "google/gemini-2.5-flash",
    "tokens": 2500,
    "citations": 10,
    "timestamp": "2025-12-21T03:00:00.000Z",
    "citationsDetails": [...],
    "type": "full",
    "hasFullReport": false
  }
}
```
**Exemplos de uso:**
```bash
# Resumo rápido (padrão) - ideal para dashboard
curl -X GET "http://localhost:3000/api/ai/sector-summary/CRM" \
  -H "x-company-id: a0000000-0000-0000-0000-000000000001" \
  -H "x-user-id: b1111111-1111-1111-1111-111111111111"

# Resumo completo detalhado
curl -X GET "http://localhost:3000/api/ai/sector-summary/CRM?full=true" \
  -H "x-company-id: a0000000-0000-0000-0000-000000000001" \
  -H "x-user-id: b1111111-1111-1111-1111-111111111111"

# Resumo rápido com modelo específico
curl -X GET "http://localhost:3000/api/ai/sector-summary/CRM?model=openai/gpt-4o-mini" \
  -H "x-company-id: a0000000-0000-0000-0000-000000000001" \
  -H "x-user-id: b1111111-1111-1111-1111-111111111111"
```
**Notas:**
- **Resumo Rápido (padrão)**: Ideal para exibição inicial no dashboard. Inclui apenas o essencial: resumo executivo, alertas críticos e uma dica rápida. Muito mais rápido (~2-3s).
- **Resumo Completo (`full=true`)**: Relatório detalhado com todas as seções. Use quando o usuário clicar em "Ver relatório completo" ou similar.
- A propriedade `hasFullReport: true` no resumo rápido indica que há um relatório completo disponível.
- Os `criticalAlerts` são extraídos automaticamente das citações baseado em palavras-chave e prioridades.

### `GET /api/ai/rag/health`
**Descrição:** Verifica saúde do sistema RAG (embedding e retrieval)  
**Query Params:** 
- `companyId` (obrigatório)
- `sector` (opcional)
**Headers:** Nenhum obrigatório  
**Resposta:** Status do sistema de embedding e retrieval, estatísticas e amostra de citações

---

## Rotas de Chat (`/api/chat`)

### `GET /api/chat/sessions/:userId`
**Descrição:** Lista todas as sessões de chat de um usuário  
**Parâmetros:** `userId` - ID do usuário  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array com todas as sessões do usuário

### `POST /api/chat/sessions`
**Descrição:** Cria uma nova sessão de chat  
**Headers:** `x-company-id` (obrigatório)  
**Body:**
```json
{
  "userId": "string",
  "model": "string",
  "contextMode": "general|sector",
  "sector": "string (opcional, obrigatório se contextMode=sector)"
}
```
**Resposta:** Sessão criada com ID e metadados

### `GET /api/chat/sessions/:sessionId/details`
**Descrição:** Obtém detalhes completos de uma sessão  
**Parâmetros:** `sessionId` - ID da sessão  
**Headers:** Nenhum obrigatório  
**Resposta:** Detalhes completos da sessão incluindo todas as mensagens

### `DELETE /api/chat/sessions/:sessionId`
**Descrição:** Deleta uma sessão de chat  
**Parâmetros:** `sessionId` - ID da sessão  
**Headers:** Nenhum obrigatório  
**Resposta:** Confirmação de exclusão

### `POST /api/chat/sessions/:sessionId/clear`
**Descrição:** Limpa todas as mensagens de uma sessão (mantém a sessão)  
**Parâmetros:** `sessionId` - ID da sessão  
**Headers:** Nenhum obrigatório  
**Resposta:** Sessão limpa com confirmação

### `PUT /api/chat/sessions/:sessionId/messages/:messageId`
**Descrição:** Atualiza uma mensagem específica (ex: marcar como favorita)  
**Parâmetros:** 
- `sessionId` - ID da sessão
- `messageId` - ID da mensagem
**Body:**
```json
{
  "favorite": "boolean (opcional)",
  "tokens": "number (opcional)"
}
```
**Resposta:** Mensagem atualizada

### `GET /api/chat/sessions/:sessionId/export`
**Descrição:** Exporta uma sessão completa em JSON  
**Parâmetros:** `sessionId` - ID da sessão  
**Headers:** Nenhum obrigatório  
**Resposta:** Arquivo JSON para download com toda a sessão

### `GET /api/chat/sessions/:sessionId/stats`
**Descrição:** Obtém estatísticas de uma sessão (total de mensagens, tokens, etc)  
**Parâmetros:** `sessionId` - ID da sessão  
**Headers:** Nenhum obrigatório  
**Resposta:** Estatísticas da sessão

### `GET /api/chat/search/:userId`
**Descrição:** Busca sessões por texto  
**Parâmetros:** `userId` - ID do usuário  
**Query Params:** `q` (obrigatório) - termo de busca  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array de sessões que correspondem à busca

---

## Rotas de Documentos (`/api/documents`)

### `POST /api/documents/generate`
**Descrição:** Gera documento (PDF/DOCX) usando IA  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "prompt": "string",
  "documentType": "pdf|docx",
  "templateId": "string (opcional)",
  "companyId": "string",
  "metadata": {
    "sector": "string",
    "category": "string",
    "tags": "array de strings"
  }
}
```
**Resposta:** Documento gerado com URL ou buffer

### `GET /api/documents/extract/schema-from-table`
**Descrição:** Gera schema dinâmico a partir de uma tabela do banco de dados  
**Query Params:** 
- `table` (obrigatório) - nome da tabela
- `mode` (opcional) - "withUnitNumber" ou "direct" (para residents)
**Headers:** Nenhum obrigatório  
**Resposta:** Schema JSON pronto para uso no endpoint `/extract`

### `POST /api/documents/transcribe-audio`
**Descrição:** Transcreve áudio usando Gemini 2.5 Pro  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body (JSON ou multipart/form-data):**
```json
{
  "audioUrl": "string (opcional)",
  "companyId": "string",
  "meetingId": "string (opcional)",
  "transcriptionType": "audio|audio_summary|audio_minutes|audio_summary_minutes (opcional, padrão: audio)",
  "options": {
    "language": "pt-BR|en-US|es-ES",
    "speakerIdentification": "boolean",
    "actionItemExtraction": "boolean",
    "agendaGeneration": "boolean",
    "keyPointsExtraction": "boolean",
    "sentimentAnalysis": "boolean",
    "autoTranslation": "boolean",
    "targetLanguage": "string (opcional)"
  },
  "minutesOptions": {
    "format": "markdown|pdf|word (opcional)",
    "includeSections": "array de strings (opcional)",
    "customInstructions": "string (opcional)"
  },
  "summaryOptions": {
    "summaryType": "executive|detailed|action_items|decisions (opcional)",
    "maxLength": "number (opcional, 100-2000)",
    "includeMetrics": "boolean (opcional)"
  }
}
```
**Ou multipart:** `audioFile` (arquivo), `options` (JSON string), `companyId`, `meetingId`  
**Resposta:** Transcrição completa com análise, resumo e/ou ata conforme `transcriptionType`

### `POST /api/documents/transcribe-daily-recording`
**Descrição:** Transcreve gravação do Daily.co - baixa o vídeo do link de download e processa com IA  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "downloadLink": "string (obrigatório) - Link de download da gravação do Daily.co",
  "companyId": "string (obrigatório)",
  "meetingId": "string (opcional)",
  "transcriptionType": "audio|audio_summary|audio_minutes|audio_summary_minutes (opcional, padrão: audio_summary_minutes)",
  "options": {
    "language": "pt-BR|en-US|es-ES (opcional, padrão: pt-BR)",
    "speakerIdentification": "boolean (opcional, padrão: false)",
    "actionItemExtraction": "boolean (opcional, padrão: true)",
    "agendaGeneration": "boolean (opcional, padrão: true)",
    "keyPointsExtraction": "boolean (opcional, padrão: true)",
    "sentimentAnalysis": "boolean (opcional, padrão: false)",
    "autoTranslation": "boolean (opcional, padrão: false)",
    "targetLanguage": "string (opcional)"
  },
  "minutesOptions": {
    "format": "markdown|pdf|word (opcional, padrão: markdown)",
    "includeSections": "array de strings (opcional)",
    "customInstructions": "string (opcional)"
  },
  "summaryOptions": {
    "summaryType": "executive|detailed|action_items|decisions (opcional, padrão: executive)",
    "maxLength": "number (opcional, 100-2000, padrão: 500)",
    "includeMetrics": "boolean (opcional, padrão: true)"
  }
}
```
**Resposta:**
```json
{
  "success": true,
  "data": {
    "processingId": "uuid",
    "transcription": {
      "text": "Texto transcrito...",
      "confidence": 0.95,
      "language": "pt-BR",
      "duration": 1800
    },
    "summary": {
      "text": "Resumo executivo...",
      "highlights": ["...", "..."],
      "actionItems": [...],
      "decisions": [...],
      "nextSteps": [...]
    },
    "minutes": {
      "minuteId": "uuid",
      "content": "# ATA DE REUNIÃO...",
      "format": "markdown"
    },
    "usage": {
      "audioMinutes": 30,
      "transcriptionTokens": 2500,
      "analysisTokens": 1200,
      "summaryTokens": 800,
      "minutesTokens": 2000,
      "totalTokens": 6500
    }
  }
}
```
**Exemplo de uso:**
```bash
# Obter link de download do Daily.co primeiro
curl -X GET "http://localhost:3000/api/video/recordings/63b396d8-e364-41cc-b5e2-63086fca87cc/access-link?valid_for_secs=3600"

# Usar o download_link retornado para transcrever
curl -X POST "http://localhost:3000/api/documents/transcribe-daily-recording" \
  -H "Content-Type: application/json" \
  -H "x-company-id: company-123" \
  -H "x-user-id: user-456" \
  -d '{
    "downloadLink": "https://api.daily.co/v1/recordings/.../access-link?token=...",
    "companyId": "company-123",
    "meetingId": "meeting-789",
    "transcriptionType": "audio_summary_minutes",
    "options": {
      "language": "pt-BR",
      "actionItemExtraction": true,
      "agendaGeneration": true
    }
  }'
```
**Nota:** Esta rota baixa automaticamente o arquivo de vídeo do link fornecido e processa usando o mesmo sistema de transcrição/geração de ata existente. O Gemini 2.5 Pro suporta vídeo MP4 diretamente.

### `POST /api/documents/summarize-minute`
**Descrição:** Resumir ata de assembleia usando IA  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "minuteId": "string",
  "minuteContent": "string (opcional)",
  "summaryType": "executive|detailed|action_items|decisions",
  "companyId": "string"
}
```
**Resposta:** Resumo gerado pela IA

### `GET /api/documents/processing/:processingId`
**Descrição:** Verifica status do processamento de áudio/documento  
**Parâmetros:** `processingId` - ID do processamento  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Status, progresso e resultado do processamento

### `POST /api/documents/text-to-speech`
**Descrição:** Converte texto em áudio usando OpenAI TTS (Text-to-Speech)  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "text": "string (obrigatório, máximo 4096 caracteres)",
  "voice": "alloy|echo|fable|onyx|nova|shimmer (opcional, padrão: alloy)",
  "model": "tts-1|tts-1-hd (opcional, padrão: tts-1-hd)",
  "speed": "number (opcional, 0.25 a 4.0, padrão: 1.0)",
  "format": "mp3|opus|aac|flac (opcional, padrão: mp3)"
}
```
**Resposta:** Arquivo de áudio binário com headers apropriados:
- `Content-Type`: `audio/mpeg` (mp3), `audio/opus` (opus), `audio/aac` (aac), ou `audio/flac` (flac)
- `Content-Disposition`: `attachment; filename="speech.{format}"`
- Body: Buffer binário do áudio gerado

**Exemplo de uso:**
```bash
curl -X POST http://localhost:3000/api/documents/text-to-speech \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Olá, este é um teste de conversão de texto em áudio.",
    "voice": "nova",
    "model": "tts-1-hd",
    "speed": 1.0,
    "format": "mp3"
  }' \
  --output speech.mp3
```

**Nota:** 
- **OpenRouter não suporta TTS**, então esta rota usa apenas `OPENAI_API_KEY` (chave direta da OpenAI).
- Requer `OPENAI_API_KEY` configurada no arquivo `.env` com uma **chave direta da OpenAI** (formato: `sk-...`), **não** uma chave do OpenRouter.
- Obtenha sua chave OpenAI em: https://platform.openai.com/account/api-keys
- A API tem limite de 4096 caracteres por requisição.
- Se você receber erro 401, verifique se `OPENAI_API_KEY` está correta e é uma chave direta da OpenAI (não OpenRouter).

### `POST /api/documents/ingest-knowledge`
**Descrição:** Ingesta conhecimento manual no sistema RAG  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "companyId": "UUID",
  "sector": "string",
  "title": "string",
  "content": "string (mínimo 20 caracteres)",
  "tags": "array de strings (opcional)"
}
```
**Resposta:** ID do chunk criado

### `POST /api/documents/reseed-knowledge`
**Descrição:** Reseed (limpa e popula) conhecimento padrão  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "companyId": "UUID",
  "clear": "boolean (opcional, default: true)"
}
```
**Resposta:** Resultado do reseed

### `POST /api/documents/extract`
**Descrição:** Extrai dados estruturados de PDF/XLSX/CSV conforme schema e salva no banco  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body (JSON ou multipart/form-data):**
```json
{
  "documentUrl": "string (opcional)",
  "schema": {
    "entity": "string",
    "description": "string (opcional)",
    "fields": [
      {
        "name": "string",
        "type": "string|number|date|boolean",
        "required": "boolean (opcional)",
        "pattern": "string (opcional)",
        "description": "string (opcional)"
      }
    ],
    "output": {
      "type": "array",
      "itemName": "string",
      "dedupeBy": "array de strings (opcional)",
      "target": {
        "table": "string",
        "upsertKeys": "array de strings (opcional)"
      }
    },
    "locale": "string (opcional)",
    "documentType": "string (opcional)"
  },
  "options": {
    "extractionMode": "hybrid|llm-only|regex-first",
    "model": "string",
    "dryRun": "boolean (opcional)",
    "clientId": "UUID (opcional)",
    "companyId": "UUID (opcional)",
    "companyName": "string (opcional)"
  }
}
```
**Ou multipart:** `file` (arquivo), `schema` (JSON string), `options` (JSON string)  
**Resposta:** Itens extraídos, erros, estatísticas e resultado do salvamento

### `POST /api/documents/extract/base64`
**Descrição:** Variante do `/extract` que recebe arquivo em base64  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "fileName": "string",
  "fileBase64": "string",
  "schema": { ... },
  "options": { ... }
}
```
**Resposta:** Mesma do `/extract`

### `GET /api/documents/extract/schemas`
**Descrição:** Retorna templates prontos de schema para importação (unidades e moradores)  
**Headers:** Nenhum obrigatório  
**Resposta:** Schemas pré-configurados para `condominium_units` e `condominium_residents`

### `POST /api/documents/ingest-auto`
**Descrição:** Importação automática que detecta tipo de documento e aplica schema apropriado  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "fileName": "string",
  "fileBase64": "string",
  "subject": "moradores|unidades|auto",
  "options": {
    "dryRun": "boolean (opcional)",
    "companyName": "string (opcional)"
  }
}
```
**Resposta:** Resultados por entidade (unidades e/ou moradores)

### `GET /api/documents/knowledge/stats`
**Descrição:** Estatísticas do conhecimento ingerido (por setor)  
**Query Params:** `companyId` (obrigatório, pode vir no header)  
**Headers:** `x-company-id` (opcional, se não vier na query)  
**Resposta:** Contagem total e por setor de chunks de conhecimento

### `GET /api/documents/verify-import`
**Descrição:** Verifica importação rápida (contagens e amostras de unidades e moradores)  
**Query Params:** `companyId` (obrigatório, pode vir no header)  
**Headers:** `x-company-id` (opcional, se não vier na query)  
**Resposta:** Contagens e amostras (5 primeiros) de unidades e moradores

---

## Rotas de Transcrição (`/api/transcription`)

### `POST /api/transcription/submit`
**Descrição:** Submete áudio para transcrição via AssemblyAI  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "audio_url": "string (URL válida)",
  "language_code": "pt|en|es",
  "speaker_labels": "boolean",
  "auto_highlights": "boolean",
  "sentiment_analysis": "boolean",
  "entity_detection": "boolean",
  "formatting": {
    "punctuate": "boolean",
    "disfluencies": "boolean",
    "profanity_filter": "boolean"
  },
  "custom_vocabulary": "array de strings",
  "companyId": "string"
}
```
**Resposta:** ID da transcrição e status inicial

### `GET /api/transcription/:transcription_id/status`
**Descrição:** Verifica status de uma transcrição  
**Parâmetros:** `transcription_id` - ID da transcrição  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Status atual da transcrição (processing, completed, error)

### `POST /api/transcription/videoconference/recordings/upload`
**Descrição:** Upload de gravação de videoconferência  
**Headers:** `x-company-id` (obrigatório)  
**Body (multipart/form-data):**
- `recording` (arquivo)
- `roomId` (string)
- `roomName` (string)
- `isAssembly` (boolean)
- `assemblyTitle` (string, opcional)
- `clientId` (string, opcional)
- `assemblyDescription` (string, opcional)
**Resposta:** ID da gravação e status de upload

### `GET /api/transcription/videoconference/recordings/:recording_id/status`
**Descrição:** Status do processamento de uma gravação  
**Parâmetros:** `recording_id` - ID da gravação  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Status do processamento da gravação

---

## Rotas de Assembleia (`/api/assembly`)

### `POST /api/assembly/assemblies`
**Descrição:** Cria uma nova assembleia  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "title": "string",
  "description": "string (opcional)",
  "scheduledDate": "string (datetime, opcional)",
  "location": "string (default: Virtual)",
  "status": "agendada|realizada|cancelada",
  "clientId": "number (opcional)",
  "recordingId": "number (opcional)",
  "companyId": "string"
}
```
**Resposta:** Assembleia criada com ID

### `GET /api/assembly/assemblies`
**Descrição:** Lista assembleias  
**Query Params:** 
- `clientId` (opcional)
- `status` (opcional)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array de assembleias filtradas

### `GET /api/assembly/transcription/:assemblyId`
**Descrição:** Busca transcrição de uma assembleia  
**Parâmetros:** `assemblyId` - ID da assembleia  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Transcrição completa da assembleia

### `POST /api/assembly/ai/generate-minutes`
**Descrição:** Gera ata de assembleia usando IA  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "transcription_text": "string",
  "assembly_details": {
    "title": "string",
    "date": "string (datetime)",
    "location": "string",
    "type": "ordinary|extraordinary|special"
  },
  "format": "markdown|pdf|word",
  "include_sections": "array de strings",
  "custom_instructions": "string (opcional)",
  "language": "string (default: pt-BR)",
  "companyId": "string"
}
```
**Resposta:** Ata gerada pela IA

### `POST /api/assembly/ai/analyze-sentiment`
**Descrição:** Análise de sentimento da transcrição  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "transcription_text": "string",
  "analysis_type": "conflict_detection|emotion_analysis|topic_sentiment",
  "sensitivity": "low|medium|high",
  "companyId": "string"
}
```
**Resposta:** Análise de sentimento com detecção de conflitos

### `POST /api/assembly/ai/generate-summary`
**Descrição:** Gera resumo executivo da assembleia  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "minutes_content": "string",
  "summary_type": "executive|detailed|action_items|decisions",
  "max_length": "number (100-2000, default: 500)",
  "include_metrics": "boolean",
  "target_audience": "management|participants|stakeholders",
  "companyId": "string"
}
```
**Resposta:** Resumo executivo gerado

### `POST /api/assembly/ai/identify-speakers`
**Descrição:** Identifica participantes na transcrição  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "transcription_data": {
    "speakers": [
      {
        "speaker": "string",
        "text": "string",
        "start_time": "number"
      }
    ]
  },
  "known_participants": [
    {
      "name": "string",
      "role": "string",
      "voice_characteristics": "string (opcional)"
    }
  ],
  "companyId": "string"
}
```
**Resposta:** Participantes identificados com confiança

---

## Rotas de Atas (`/api/minutes`)

### `POST /api/minutes/generate/:assemblyId`
**Descrição:** Gera ata a partir de uma assembleia  
**Parâmetros:** `assemblyId` - ID da assembleia  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "format": "markdown|pdf|word",
  "generatePdf": "boolean",
  "aiSummary": "boolean",
  "sendForSignature": "boolean",
  "customTranscription": "string (opcional)",
  "signers": [
    {
      "name": "string",
      "email": "string",
      "role": "string (opcional)"
    }
  ],
  "companyId": "string"
}
```
**Resposta:** Ata gerada com ID e URL do PDF (se solicitado)

### `POST /api/minutes/generate-from-recording/:recordingId`
**Descrição:** Gera ata a partir de uma gravação  
**Parâmetros:** `recordingId` - ID da gravação  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "format": "markdown|pdf|word",
  "aiSummary": "boolean",
  "companyId": "string"
}
```
**Resposta:** Ata gerada a partir da gravação

### `GET /api/minutes/available/assemblies`
**Descrição:** Lista assembleias disponíveis para gerar ata  
**Query Params:** 
- `clientId` (opcional)
- `status` (opcional)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array de assembleias disponíveis

### `GET /api/minutes`
**Descrição:** Lista todas as atas  
**Query Params:** 
- `clientId` (opcional)
- `status` (opcional)
- `page` (opcional, default: 1)
- `limit` (opcional, default: 20)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array paginado de atas

### `GET /api/minutes/:id`
**Descrição:** Busca uma ata específica  
**Parâmetros:** `id` - ID da ata  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Detalhes completos da ata

### `POST /api/minutes/:id/signatures`
**Descrição:** Adiciona assinantes a uma ata  
**Parâmetros:** `id` - ID da ata  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "signers": [
    {
      "name": "string",
      "email": "string",
      "role": "string (opcional)"
    }
  ],
  "companyId": "string"
}
```
**Resposta:** Assinantes adicionados e status

### `POST /api/minutes/:id/reminders`
**Descrição:** Envia lembretes para assinantes pendentes  
**Parâmetros:** `id` - ID da ata  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Confirmação de envio de lembretes

### `GET /api/minutes/:id/download/pdf`
**Descrição:** Download do PDF da ata  
**Parâmetros:** `id` - ID da ata  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Arquivo PDF para download

---

## Rotas de Autentique (`/api/autentique`)

### `POST /api/autentique/documents`
**Descrição:** Cria documento para assinatura digital via Autentique  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "name": "string",
  "files": [
    {
      "file": "string (base64)",
      "filename": "string"
    }
  ],
  "signers": [
    {
      "name": "string",
      "email": "string",
      "phone": "string (opcional)",
      "action": "SIGN|APPROVE|WITNESS",
      "order": "number"
    }
  ],
  "settings": {
    "deadline": "string (datetime, opcional)",
    "reminder_frequency": "daily|weekly|none",
    "allow_decline": "boolean"
  },
  "companyId": "string"
}
```
**Resposta:** Documento criado no Autentique com ID

### `GET /api/autentique/documents/:documentId`
**Descrição:** Obtém status de um documento no Autentique  
**Parâmetros:** `documentId` - ID do documento  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Status do documento e assinaturas

### `POST /api/autentique/webhook`
**Descrição:** Webhook do Autentique para receber atualizações de documentos  
**Headers:** `x-autentique-signature` (opcional, para validação)  
**Body:** Payload do webhook do Autentique  
**Resposta:** Confirmação de processamento

### `GET /api/autentique/documents`
**Descrição:** Lista documentos do Autentique  
**Query Params:** 
- `status` (opcional)
- `page` (opcional, default: 1)
- `limit` (opcional, default: 20)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Array paginado de documentos

### `POST /api/autentique/documents/:documentId/cancel`
**Descrição:** Cancela um documento no Autentique  
**Parâmetros:** `documentId` - ID do documento  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Confirmação de cancelamento

### `POST /api/autentique/documents/:documentId/remind`
**Descrição:** Envia lembrete para assinantes pendentes  
**Parâmetros:** `documentId` - ID do documento  
**Headers:** `x-company-id` (obrigatório)  
**Body:** Opções de lembrete (opcional)  
**Resposta:** Confirmação de envio

---

## Rotas de Analytics (`/api/analytics`)

### `GET /api/analytics/assembly-metrics`
**Descrição:** Métricas de assembleias (total, por status, por período)  
**Query Params:** 
- `start_date` (opcional, datetime)
- `end_date` (opcional, datetime)
- `client_id` (opcional)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Métricas agregadas de assembleias

### `GET /api/analytics/transcription-metrics`
**Descrição:** Métricas de transcrições (total, duração média, etc)  
**Query Params:** 
- `start_date` (opcional, datetime)
- `end_date` (opcional, datetime)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Métricas de transcrições

### `GET /api/analytics/signature-metrics`
**Descrição:** Métricas de assinaturas (taxa de conclusão, tempo médio, etc)  
**Query Params:** 
- `start_date` (opcional, datetime)
- `end_date` (opcional, datetime)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Métricas de assinaturas

### `GET /api/analytics/usage-metrics`
**Descrição:** Métricas de uso geral da plataforma  
**Query Params:** 
- `start_date` (opcional, datetime)
- `end_date` (opcional, datetime)
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Métricas de uso (sessões, mensagens, etc)

### `GET /api/analytics/dashboard`
**Descrição:** Dashboard completo com todas as métricas agregadas  
**Query Params:** `period` (opcional, default: "30d") - "7d", "30d", "90d", "1y"  
**Headers:** `x-company-id` (obrigatório)  
**Resposta:** Dashboard completo com todas as métricas

---

## Rotas de Notificações (`/api/notifications`)

### `POST /api/notifications/send`
**Descrição:** Envia notificação push para um funcionário  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "employeeId": "string",
  "title": "string",
  "body": "string",
  "data": "object (opcional)"
}
```
**Resposta:** Resultado do envio (sucesso/falha por token)

### `POST /api/notifications/register-token`
**Descrição:** Registra ou atualiza token push de um funcionário  
**Headers:** 
- `x-company-id` (obrigatório)
- `x-user-id` (obrigatório)
**Body:**
```json
{
  "employeeId": "string",
  "pushToken": "string",
  "deviceId": "string (opcional)",
  "platform": "ios|android|unknown"
}
```
**Resposta:** Confirmação de registro/atualização

---

## Rotas de Vídeo (Daily.co) (`/api/video`)

### `POST /api/video/rooms`
**Descrição:** Cria uma nova sala de vídeo  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "name": "string (opcional)",
  "privacy": "public|private",
  "properties": {
    "enable_chat": "boolean (opcional)",
    "enable_screenshare": "boolean (opcional)",
    "enable_recording": "boolean (opcional)",
    "enable_transcription": "boolean (opcional)",
    "max_participants": "number (opcional)",
    "exp": "number (opcional - expiração em segundos)",
    "start_video_off": "boolean (opcional)",
    "start_audio_off": "boolean (opcional)"
  }
}
```
**Resposta:** Dados da sala criada incluindo URL e configurações

### `GET /api/video/rooms`
**Descrição:** Lista todas as salas de vídeo  
**Query Params:** 
- `limit` (opcional) - Número máximo de resultados (padrão: 100)
- `starting_after` (opcional) - ID para paginação
- `ending_before` (opcional) - ID para paginação
**Headers:** Nenhum obrigatório  
**Resposta:** Lista de salas com paginação

### `GET /api/video/rooms/:name`
**Descrição:** Obtém detalhes de uma sala específica  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Resposta:** Detalhes completos da sala

### `DELETE /api/video/rooms/:name`
**Descrição:** Deleta uma sala de vídeo  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Resposta:** Confirmação de exclusão

### `POST /api/video/meeting-tokens`
**Descrição:** Cria um token de reunião para um usuário entrar em uma sala  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "properties": {
    "room_name": "string (obrigatório)",
    "user_id": "string (opcional)",
    "user_name": "string (opcional)",
    "is_owner": "boolean (opcional)",
    "exp": "number (opcional - expiração em segundos)",
    "enable_recording": "cloud|local|none (opcional)",
    "enable_transcription": "boolean (opcional)",
    "enable_screenshare": "boolean (opcional)",
    "enable_chat": "boolean (opcional)"
  }
}
```
**Resposta:** Token de reunião que pode ser usado para entrar na sala

### `GET /api/video/meeting-tokens/:token`
**Descrição:** Obtém informações de um token de reunião  
**Parâmetros:** `token` - Token da reunião  
**Headers:** Nenhum obrigatório  
**Resposta:** Informações do token

### `POST /api/video/rooms/:name/recordings/start`
**Descrição:** Inicia gravação de uma sala  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "format": "mp4|webm (opcional, padrão: mp4)",
  "layout": "default|grid|single-speaker|active-speaker (opcional, padrão: default)",
  "max_duration": "number (opcional) - Duração máxima em segundos",
  "resolution": "720p|1080p (opcional, padrão: 720p)"
}
```
**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "0cb313e1-211f-4be0-833d-8c7305b19902",
    "room_name": "teste-sala-01",
    "status": "recording",
    "max_participants": 2,
    "start_ts": 1704067200,
    "created_at": "2024-01-01T10:00:00Z"
  }
}
```
**Exemplo de uso:**
```bash
# Iniciar gravação com configurações padrão
curl -X POST "http://localhost:3000/api/video/rooms/teste-sala-01/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{}'

# Iniciar gravação com configurações personalizadas
curl -X POST "http://localhost:3000/api/video/rooms/teste-sala-01/recordings/start" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "mp4",
    "layout": "grid",
    "max_duration": 3600,
    "resolution": "1080p"
  }'
```

### `POST /api/video/rooms/:name/recordings/stop`
**Descrição:** Para gravação de uma sala  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "0cb313e1-211f-4be0-833d-8c7305b19902",
    "room_name": "teste-sala-01",
    "status": "completed",
    "duration": 1800,
    "end_ts": 1704069000
  }
}
```
**Exemplo de uso:**
```bash
curl -X POST "http://localhost:3000/api/video/rooms/teste-sala-01/recordings/stop"
```

### `POST /api/video/rooms/:name/transcription/start`
**Descrição:** Inicia transcrição de uma sala  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Body:**
```json
{
  "language": "string (opcional, padrão: pt-BR)",
  "model": "nova-2|whisper (opcional)"
}
```
**Resposta:** Informações da transcrição iniciada

### `POST /api/video/rooms/:name/transcription/stop`
**Descrição:** Para transcrição de uma sala  
**Parâmetros:** `name` - Nome da sala  
**Headers:** Nenhum obrigatório  
**Resposta:** Confirmação de parada da transcrição

### `GET /api/video/recordings`
**Descrição:** Lista todas as gravações do domínio  
**Query Params:** 
- `limit` (opcional, número) - Número máximo de gravações a retornar (máximo 100)
- `starting_after` (opcional, string) - ID da gravação para começar a listagem após
- `ending_before` (opcional, string) - ID da gravação para terminar a listagem antes
- `room_name` (opcional, string) - Filtrar gravações por nome da sala
**Headers:** Nenhum obrigatório  
**Resposta:**
```json
{
  "success": true,
  "data": {
    "total_count": 25,
    "data": [
      {
        "id": "0cb313e1-211f-4be0-833d-8c7305b19902",
        "room_name": "teste-sala-01",
        "status": "completed",
        "max_participants": 2,
        "duration": 1800,
        "start_ts": 1704067200,
        "end_ts": 1704069000,
        "file_name": "teste-sala-01_1704067200.mp4",
        "file_size": 52428800,
        "download_link": "https://...",
        "created_at": "2024-01-01T10:00:00Z"
      }
    ]
  }
}
```
**Exemplo de uso:**
```bash
# Listar todas as gravações
curl -X GET "http://localhost:3000/api/video/recordings"

# Listar gravações de uma sala específica
curl -X GET "http://localhost:3000/api/video/recordings?room_name=teste-sala-01"

# Listar com limite e paginação
curl -X GET "http://localhost:3000/api/video/recordings?limit=10&starting_after=0cb313e1-211f-4be0-833d-8c7305b19902"
```  
**Resposta:** Lista de gravações com paginação

### `GET /api/video/recordings/:id`
**Descrição:** Obtém detalhes de uma gravação específica  
**Parâmetros:** `id` - ID da gravação  
**Headers:** Nenhum obrigatório  
**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "0cb313e1-211f-4be0-833d-8c7305b19902",
    "room_name": "teste-sala-01",
    "status": "completed",
    "max_participants": 2,
    "duration": 1800,
    "start_ts": 1704067200,
    "end_ts": 1704069000,
    "file_name": "teste-sala-01_1704067200.mp4",
    "file_size": 52428800,
    "download_link": "https://...",
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-01T10:30:00Z"
  }
}
```
**Exemplo de uso:**
```bash
curl -X GET "http://localhost:3000/api/video/recordings/0cb313e1-211f-4be0-833d-8c7305b19902"
```

### `GET /api/video/recordings/:id/access-link`
**Descrição:** Obtém link de acesso temporário para uma gravação  
**Parâmetros:** `id` - ID da gravação  
**Query Params:** 
- `valid_for_secs` (opcional, número) - Validade do link em segundos (padrão: 3600, máximo: 43200 = 12 horas)  
**Headers:** Nenhum obrigatório  
**Resposta:**
```json
{
  "success": true,
  "data": {
    "download_link": "https://api.daily.co/v1/recordings/0cb313e1-211f-4be0-833d-8c7305b19902/access-link?token=...",
    "expires_at": "2024-01-01T11:00:00Z",
    "valid_for_secs": 3600
  }
}
```
**Exemplo de uso:**
```bash
# Obter link válido por 1 hora (padrão)
curl -X GET "http://localhost:3000/api/video/recordings/0cb313e1-211f-4be0-833d-8c7305b19902/access-link"

# Obter link válido por 12 horas (máximo permitido)
curl -X GET "http://localhost:3000/api/video/recordings/0cb313e1-211f-4be0-833d-8c7305b19902/access-link?valid_for_secs=43200"

# Obter link válido por 6 horas
curl -X GET "http://localhost:3000/api/video/recordings/0cb313e1-211f-4be0-833d-8c7305b19902/access-link?valid_for_secs=21600"
```
**Nota:** O valor máximo de `valid_for_secs` é 43200 segundos (12 horas). Valores maiores resultarão em erro 400.

### `GET /api/video/transcripts`
**Descrição:** Lista todas as transcrições  
**Query Params:** 
- `limit` (opcional)
- `starting_after` (opcional)
- `ending_before` (opcional)
**Headers:** Nenhum obrigatório  
**Resposta:** Lista de transcrições com paginação

### `GET /api/video/transcripts/:id`
**Descrição:** Obtém detalhes de uma transcrição específica  
**Parâmetros:** `id` - ID da transcrição  
**Headers:** Nenhum obrigatório  
**Resposta:** Detalhes da transcrição

### `GET /api/video/transcripts/:id/access-link`
**Descrição:** Obtém link de acesso temporário para uma transcrição  
**Parâmetros:** `id` - ID da transcrição  
**Query Params:** 
- `valid_for_secs` (opcional, número) - Validade do link em segundos (padrão: 3600, máximo: 43200 = 12 horas)  
**Headers:** Nenhum obrigatório  
**Resposta:**
```json
{
  "success": true,
  "data": {
    "download_link": "https://api.daily.co/v1/transcript/0cb313e1-211f-4be0-833d-8c7305b19902/access-link?token=...",
    "expires_at": "2024-01-01T11:00:00Z",
    "valid_for_secs": 3600
  }
}
```
**Exemplo de uso:**
```bash
# Obter link válido por 1 hora (padrão)
curl -X GET "http://localhost:3000/api/video/transcripts/0cb313e1-211f-4be0-833d-8c7305b19902/access-link"

# Obter link válido por 12 horas (máximo permitido)
curl -X GET "http://localhost:3000/api/video/transcripts/0cb313e1-211f-4be0-833d-8c7305b19902/access-link?valid_for_secs=43200"
```
**Nota:** O valor máximo de `valid_for_secs` é 43200 segundos (12 horas). Valores maiores resultarão em erro 400.

**Nota:** Todas as rotas de vídeo usam a API do Daily.co. A chave da API deve estar configurada na variável de ambiente `DAILY_API_KEY`. Documentação completa: https://docs.daily.co/reference/rest-api

---

## Headers Comuns

A maioria das rotas requer os seguintes headers:

- **`x-company-id`**: ID da empresa (UUID) - obrigatório na maioria das rotas
- **`x-user-id`**: ID do usuário (UUID) - obrigatório em rotas que criam/modificam dados
- **`Authorization`**: Token de autenticação (quando aplicável)
- **`Content-Type`**: `application/json` (padrão) ou `multipart/form-data` (para uploads)

## CORS

A API suporta CORS configurável via variável de ambiente `CORS_ORIGINS`. Por padrão, aceita:
- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8080`

## Tratamento de Erros

Todas as rotas retornam erros no formato:
```json
{
  "success": false,
  "error": "Mensagem de erro",
  "details": "Detalhes adicionais (opcional)"
}
```

Códigos HTTP:
- `200`: Sucesso
- `201`: Criado com sucesso
- `400`: Dados inválidos
- `401`: Não autorizado
- `404`: Recurso não encontrado
- `500`: Erro interno do servidor


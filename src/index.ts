import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { ai } from "./routes/ai.js";
import { chat } from "./routes/chat.js";
import { documents } from "./routes/documents.js";
import { transcription } from "./routes/transcription.js";
import { assembly } from "./routes/assembly.js";
import { minutes } from "./routes/minutes.js";
import { autentique } from "./routes/autentique.js";
import { analytics } from "./routes/analytics.js";
import { notifications } from "./routes/notifications.js";
import { video } from "./routes/video.js";

const app = new Hono();

// Middlewares
app.use("*", logger());
app.use("*", prettyJSON());
// CORS configurável via ambiente (CORS_ORIGINS=orig1,orig2)
const corsOrigins = (
  process.env.CORS_ORIGINS ||
  "http://localhost:3000,http://localhost:5173,http://localhost:8080"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: corsOrigins,
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-company-id",
      "x-user-id",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    success: true,
    message: "CondoGov AdminAssistant API está funcionando!",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      ai: "/api/ai/*",
      chat: "/api/chat/*",
      documents: "/api/documents/*",
      health: "/",
      docs: "/docs",
    },
  });
});

// Documentação básica
app.get("/docs", (c) => {
  return c.json({
    title: "CondoGov AdminAssistant API Documentation",
    version: "1.0.0",
    description:
      "API para integração com múltiplos modelos de IA para gestão de condomínios",
    endpoints: {
      ai: {
        "GET /api/ai/models": "Listar modelos de IA disponíveis",
        "GET /api/ai/models/:modelId": "Obter detalhes de um modelo específico",
        "POST /api/ai/chat": "Enviar mensagem para IA",
        "POST /api/ai/analyze": "Análise inteligente de dados do condomínio",
        "GET /api/ai/suggestions": "Obter sugestões rápidas",
      },
      chat: {
        "GET /api/chat/sessions/:userId": "Listar sessões do usuário",
        "POST /api/chat/sessions": "Criar nova sessão de chat",
        "GET /api/chat/sessions/:sessionId/details": "Obter detalhes da sessão",
        "DELETE /api/chat/sessions/:sessionId": "Deletar sessão",
        "POST /api/chat/sessions/:sessionId/clear":
          "Limpar mensagens da sessão",
        "PUT /api/chat/sessions/:sessionId/messages/:messageId":
          "Atualizar mensagem",
        "GET /api/chat/sessions/:sessionId/export": "Exportar sessão",
        "GET /api/chat/sessions/:sessionId/stats": "Estatísticas da sessão",
        "GET /api/chat/search/:userId": "Buscar sessões",
      },
      documents: {
        "POST /api/documents/generate": "Gerar documento com IA",
        "POST /api/documents/transcribe-audio":
          "Transcrever áudio com Gemini 2.5 Pro",
        "POST /api/documents/transcribe-daily-recording":
          "Transcrever gravação do Daily.co (baixa vídeo e processa)",
        "POST /api/documents/summarize-minute": "Resumir ata inteligentemente",
        "GET /api/documents/processing/:processingId":
          "Status do processamento",
        "POST /api/documents/text-to-speech": "Converter texto em áudio (TTS)",
      },
      transcription: {
        "POST /api/transcription/submit": "Submeter áudio para transcrição",
        "GET /api/transcription/:transcription_id/status":
          "Status da transcrição",
        "POST /api/transcription/videoconference/recordings/upload":
          "Upload de gravação",
        "GET /api/transcription/videoconference/recordings/:recording_id/status":
          "Status do processamento",
      },
      assembly: {
        "POST /api/assembly/assemblies": "Criar assembleia",
        "GET /api/assembly/assemblies": "Listar assembleias",
        "GET /api/assembly/transcription/:assemblyId":
          "Transcrição da assembleia",
        "POST /api/assembly/ai/generate-minutes": "Gerar ata com IA",
        "POST /api/assembly/ai/analyze-sentiment": "Análise de sentimento",
        "POST /api/assembly/ai/generate-summary": "Resumo executivo",
        "POST /api/assembly/ai/identify-speakers": "Identificar participantes",
      },
      minutes: {
        "POST /api/minutes/generate/:assemblyId": "Gerar ata de assembleia",
        "POST /api/minutes/generate-from-recording/:recordingId":
          "Gerar ata de gravação",
        "GET /api/minutes/available/assemblies": "Assembleias disponíveis",
        "GET /api/minutes": "Listar atas",
        "GET /api/minutes/:id": "Buscar ata",
        "POST /api/minutes/:id/signatures": "Adicionar assinantes",
        "POST /api/minutes/:id/reminders": "Enviar lembretes",
        "GET /api/minutes/:id/download/pdf": "Download PDF",
      },
      autentique: {
        "POST /api/autentique/documents": "Criar documento para assinatura",
        "GET /api/autentique/documents/:documentId": "Status do documento",
        "POST /api/autentique/webhook": "Webhook do Autentique",
        "GET /api/autentique/documents": "Listar documentos",
        "POST /api/autentique/documents/:documentId/cancel":
          "Cancelar documento",
        "POST /api/autentique/documents/:documentId/remind": "Enviar lembrete",
      },
      analytics: {
        "GET /api/analytics/assembly-metrics": "Métricas de assembleias",
        "GET /api/analytics/transcription-metrics": "Métricas de transcrição",
        "GET /api/analytics/signature-metrics": "Métricas de assinatura",
        "GET /api/analytics/usage-metrics": "Métricas de uso",
        "GET /api/analytics/dashboard": "Dashboard completo",
      },
      video: {
        "POST /api/video/rooms": "Criar sala de vídeo",
        "GET /api/video/rooms": "Listar salas",
        "GET /api/video/rooms/:name": "Detalhes da sala",
        "DELETE /api/video/rooms/:name": "Deletar sala",
        "POST /api/video/meeting-tokens": "Criar token de reunião",
        "POST /api/video/rooms/:name/recordings/start": "Iniciar gravação",
        "POST /api/video/rooms/:name/recordings/stop": "Parar gravação",
        "POST /api/video/rooms/:name/transcription/start": "Iniciar transcrição",
        "POST /api/video/rooms/:name/transcription/stop": "Parar transcrição",
        "GET /api/video/recordings": "Listar gravações",
        "GET /api/video/transcripts": "Listar transcrições",
      },
    },
    models: {
      "openai/gpt-5-chat":
        "GPT-5 - Modelo multimodal de última geração da OpenAI",
      "openai/gpt-4.1": "GPT-4.1 - Modelo avançado da OpenAI",
      "google/gemini-2.5-pro": "Gemini 2.5 Pro - Modelo multimodal do Google",
      "anthropic/claude-sonnet-4": "Claude Sonnet 4 - Modelo da Anthropic",
      "x-ai/grok-4": "Grok 4 - Modelo open source da x-ai",
    },
    examples: {
      chat: {
        url: "POST /api/ai/chat",
        body: {
          message: "Analise a situação financeira do condomínio",
          model: "openai/gpt-5-chat",
          userId: "user123",
        },
      },
      analyze: {
        url: "POST /api/ai/analyze",
        body: {
          data: {
            revenue: 50000,
            expenses: 45000,
            projects: [],
          },
          analysisType: "financial",
          userId: "user123",
        },
      },
    },
  });
});

// Rotas da API
app.route("/api/ai", ai);
app.route("/api/chat", chat);
app.route("/api/documents", documents);
app.route("/api/transcription", transcription);
app.route("/api/assembly", assembly);
app.route("/api/minutes", minutes);
app.route("/api/autentique", autentique);
app.route("/api/analytics", analytics);
app.route("/api/notifications", notifications);
app.route("/api/video", video);

// Middleware de erro global
app.onError((err, c) => {
  console.error("Global error handler:", err);
  return c.json(
    {
      success: false,
      error: "Erro interno do servidor",
      message: err.message,
      timestamp: new Date().toISOString(),
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: "Endpoint não encontrado",
      message: `Rota ${c.req.method} ${c.req.path} não existe`,
      availableEndpoints: {
        health: "GET /",
        docs: "GET /docs",
        ai: "GET|POST /api/ai/*",
        chat: "GET|POST|PUT|DELETE /api/chat/*",
        documents: "POST /api/documents/*",
        transcription: "POST /api/transcription/*",
        assembly: "POST /api/assembly/*",
        minutes: "POST /api/minutes/*",
        autentique: "POST /api/autentique/*",
        analytics: "GET /api/analytics/*",
      },
    },
    404
  );
});

const port = process.env.PORT || 3000;

console.log(`🚀 CondoGov AdminAssistant API iniciando na porta ${port}`);
console.log(`📖 Documentação disponível em: http://localhost:${port}/docs`);
console.log(`🔗 Health check: http://localhost:${port}/`);

export default {
  port,
  fetch: app.fetch,
  // Aumentar timeout para rotas que podem demorar (como resumos de setor com IA)
  idleTimeout: 30, // 30 segundos (padrão é 10)
};

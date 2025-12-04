import { Hono } from "hono";
import { z } from "zod";
import { AIService } from "../services/aiService.js";
import { ChatService } from "../services/chatService.js";
import type { ChatMessage, RequestContext } from "../types/ai.js";
import { RAGService } from "../services/ragService.js";
import { createDatabaseAdapter } from "../services/databaseAdapter.js";
import { EmbeddingService } from "../services/embeddingService.js";

const ai = new Hono();
const aiService = new AIService();
const chatService = new ChatService();

// Helper para extrair contexto dos headers
function extractRequestContext(c: any, body: any): RequestContext {
  const companyId = c.req.header("x-company-id");
  const userId = c.req.header("x-user-id") || body.userId;
  
  if (!companyId) {
    throw new Error("Header x-company-id é obrigatório");
  }
  
  if (!userId) {
    throw new Error("Header x-user-id ou campo userId é obrigatório");
  }

  // Validar contextMode e sector
  if (body.contextMode === "sector" && !body.sector) {
    throw new Error("Campo 'sector' é obrigatório quando contextMode='sector'");
  }

  return {
    companyId,
    userId,
    contextMode: body.contextMode || "general",
    sector: body.sector,
  };
}

// Schemas de validação
const SendMessageSchema = z.object({
  message: z.string().min(1, "Mensagem não pode estar vazia"),
  model: z.string().min(1, "Modelo é obrigatório"),
  sessionId: z.string().optional(),
  userId: z.string().min(1, "ID do usuário é obrigatório"),
  includeImages: z.boolean().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  contextMode: z.enum(["general", "sector"]).default("general"),
  sector: z.string().optional(),
});

const AnalyzeDataSchema = z.object({
  data: z.any(),
  analysisType: z.enum(["performance", "financial", "alerts", "optimization"]),
  model: z.string().optional(),
  userId: z.string().min(1, "ID do usuário é obrigatório"),
  contextMode: z.enum(["general", "sector"]).default("general"),
  sector: z.string().optional(),
});

// GET /ai/models - Listar modelos disponíveis
ai.get("/models", async (c) => {
  try {
    const models = aiService.getModels();
    return c.json({
      success: true,
      data: models,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /ai/models/:modelId - Obter detalhes de um modelo
ai.get("/models/:modelId", async (c) => {
  try {
    const modelId = c.req.param("modelId");
    const model = aiService.getModel(modelId);

    if (!model) {
      return c.json(
        {
          success: false,
          error: "Modelo não encontrado",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: model,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/chat - Enviar mensagem para IA com RAG
ai.post("/chat", async (c) => {
  try {
    const body = await c.req.json();
    const validation = SendMessageSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    // Extrair contexto dos headers e body
    const context = extractRequestContext(c, validation.data);

    const { message, model, sessionId, userId, includeImages, imageUrls, contextMode, sector } =
      validation.data;

    // Criar ou obter sessão
    let session = sessionId ? await chatService.getSession(sessionId) : null;
    if (!session) {
      session = await chatService.createSessionWithContext(userId, model, contextMode, sector, context.companyId);
    }

    // Criar mensagem do usuário
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };

    // Adicionar mensagem à sessão
    await chatService.addMessage(session.id, userMessage);

    // Enviar para IA (com RAG se disponível)
    let aiResponse;
    if (includeImages && imageUrls && imageUrls.length > 0) {
      aiResponse = await aiService.sendMessageWithImages(
        {
          message,
          model,
          sessionId: session.id,
          userId,
          contextMode,
          sector,
          companyId: context.companyId,
        },
        imageUrls
      );
    } else {
      // Tentar RAG primeiro, fallback para chat normal
      try {
        aiResponse = await aiService.sendMessageWithRAG(
          {
            message,
            model,
            sessionId: session.id,
            userId,
            contextMode,
            sector,
            companyId: context.companyId,
          },
          context
        );
      } catch (ragError) {
        console.warn("RAG failed, using standard chat:", ragError instanceof Error ? ragError.message : ragError);
        
        // Fallback para chat normal sem RAG
        aiResponse = await aiService.sendMessage({
          message,
          model,
          sessionId: session.id,
          userId,
          contextMode,
          sector,
          companyId: context.companyId,
        });
      }
    }

    // Criar mensagem da IA
    const assistantMessage: ChatMessage = {
      id: aiResponse.messageId,
      role: "assistant",
      content: aiResponse.message,
      timestamp: aiResponse.timestamp,
      model: aiResponse.model,
      tokens: aiResponse.tokens,
    };

    // Adicionar resposta à sessão
    await chatService.addMessage(session.id, assistantMessage);

    return c.json({
      success: true,
      data: {
        response: {
          ...aiResponse,
          // Incluir citações e memórias usadas na resposta
          citations: aiResponse.citations || [],
          memoryUsed: aiResponse.memoryUsed || [],
        },
        session: await chatService.getSession(session.id),
        context: {
          mode: contextMode,
          sector: sector,
          company: context.companyId,
        },
      },
    });
  } catch (error) {
    console.error("Error in /ai/chat:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/analyze - Análise inteligente de dados
ai.post("/analyze", async (c) => {
  try {
    const body = await c.req.json();
    const validation = AnalyzeDataSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    const {
      data,
      analysisType,
      model = "openai/gpt-4.1",
      userId,
    } = validation.data;

    // Extrair contexto para análise
    const context = extractRequestContext(c, validation.data);
    
    // Criar sessão para análise
    const session = await chatService.createSessionWithContext(userId, model, validation.data.contextMode, validation.data.sector, context.companyId);

    // Executar análise
    const analysis = await aiService.analyzeCondominiumData(
      data,
      analysisType,
      model
    );

    // Criar mensagens da análise
    const systemMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: "system",
      content: `Análise ${analysisType} solicitada`,
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: analysis.messageId,
      role: "assistant",
      content: analysis.message,
      timestamp: analysis.timestamp,
      model: analysis.model,
      tokens: analysis.tokens,
    };

    await chatService.addMessage(session.id, systemMessage);
    await chatService.addMessage(session.id, assistantMessage);

    return c.json({
      success: true,
      data: {
        analysis,
        session: await chatService.getSession(session.id),
        analysisType,
      },
    });
  } catch (error) {
    console.error("Error in /ai/analyze:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /ai/suggestions - Obter sugestões rápidas
ai.get("/suggestions", async (c) => {
  try {
    const category = c.req.query("category");

    const suggestions = category
      ? chatService.getQuickSuggestionsByCategory(category)
      : chatService.getQuickSuggestions();

    return c.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { ai };

// GET /ai/rag/health?companyId=UUID&sector=Projetos
ai.get("/rag/health", async (c) => {
  try {
    const companyId = c.req.query("companyId");
    const sector = c.req.query("sector");

    if (!companyId) {
      return c.json(
        { success: false, error: "Parâmetro companyId é obrigatório" },
        400
      );
    }

    const context: RequestContext = {
      companyId,
      userId: "rag-health-check",
      contextMode: sector ? "sector" : "general",
      sector: sector || undefined,
    };

    const result: any = {
      success: true,
      embedding: { ok: false },
      retrieval: { ok: false },
      stats: undefined as any,
    };

    // Embedding check
    try {
      const emb = new EmbeddingService();
      const vec = await emb.generateEmbedding("verificar conhecimento setorial");
      result.embedding = { ok: Array.isArray(vec) && vec.length > 0 };
    } catch (e: any) {
      result.embedding = { ok: false, error: e?.message || String(e) };
    }

    // Retrieval check
    try {
      const db = createDatabaseAdapter();
      const rag = new RAGService(db);
      result.stats = rag.getStats();
      const retrieved = await rag.retrieveKnowledge(
        sector ? `status projetos ${sector}` : "status geral",
        context
      );
      result.retrieval = {
        ok: true,
        citationsCount: retrieved.citations?.length || 0,
        sample: retrieved.citations?.slice(0, 3) || [],
      };
    } catch (e: any) {
      result.retrieval = { ok: false, error: e?.message || String(e) };
    }

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

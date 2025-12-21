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

    // Validar headers obrigatórios antes de processar
    const companyId = c.req.header("x-company-id");
    const userIdFromHeader = c.req.header("x-user-id") || validation.data.userId;

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header obrigatório ausente",
          message: "O header 'x-company-id' é obrigatório para esta requisição",
          details: {
            missingHeader: "x-company-id",
            hint: "Adicione o header 'x-company-id' com o UUID da empresa na requisição",
          },
        },
        400
      );
    }

    if (!userIdFromHeader) {
      return c.json(
        {
          success: false,
          error: "Header obrigatório ausente",
          message: "O header 'x-user-id' ou o campo 'userId' no body é obrigatório",
          details: {
            missingHeader: "x-user-id",
            hint: "Adicione o header 'x-user-id' com o UUID do usuário ou inclua 'userId' no body da requisição",
          },
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
      console.log("[ChatRoute] Criando nova sessão para userId:", userId, "companyId:", context.companyId);
      session = await chatService.createSessionWithContext(userId, model, contextMode, sector, context.companyId);
      // Garantir que a sessão foi salva e pode ser recuperada
      session = await chatService.getSession(session.id);
      if (!session) {
        throw new Error("Falha ao criar sessão de chat");
      }
      console.log("[ChatRoute] Sessão criada:", session.id);
    } else {
      console.log("[ChatRoute] Sessão existente encontrada:", session.id, "companyId:", session.companyId);
      // Verificar se a sessão tem companyId válido
      if (!session.companyId) {
        console.warn("[ChatRoute] Sessão sem companyId, atualizando...");
        // Atualizar sessão com companyId se não tiver
        await chatService.updateSession(session.id, { companyId: context.companyId });
        session.companyId = context.companyId;
      }
    }

    // Criar mensagem do usuário com UUID
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
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
      console.log("[ChatRoute] Tentando RAG com contexto:", {
        companyId: context.companyId,
        userId: context.userId,
        contextMode,
        sector
      });
      
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
        console.log("[ChatRoute] RAG funcionou, citações:", aiResponse.citations?.length || 0);
      } catch (ragError) {
        console.warn("[ChatRoute] RAG failed, usando chat padrão:", ragError instanceof Error ? ragError.message : ragError);
        
        // Fallback para chat normal sem RAG, mas ainda com contexto setorial
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
      model,
      userId
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

// GET /ai/sector-summary/:sector - Gerar resumo executivo automático do setor
ai.get("/sector-summary/:sector", async (c) => {
  try {
    const sector = c.req.param("sector");
    // Usar modelo mais rápido por padrão para resumos de setor
    const model = c.req.query("model") || "google/gemini-2.5-flash";
    // Query param para resumo completo (padrão é rápido)
    const full = c.req.query("full") === "true";

    if (!sector) {
      return c.json(
        {
          success: false,
          error: "Setor é obrigatório",
          message: "O parâmetro 'sector' é obrigatório na URL",
        },
        400
      );
    }

    // Validar headers obrigatórios
    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header obrigatório ausente",
          message: "O header 'x-company-id' é obrigatório para esta requisição",
          details: {
            missingHeader: "x-company-id",
            hint: "Adicione o header 'x-company-id' com o UUID da empresa na requisição",
          },
        },
        400
      );
    }

    if (!userId) {
      return c.json(
        {
          success: false,
          error: "Header obrigatório ausente",
          message: "O header 'x-user-id' é obrigatório para esta requisição",
          details: {
            missingHeader: "x-user-id",
            hint: "Adicione o header 'x-user-id' com o UUID do usuário na requisição",
          },
        },
        400
      );
    }

    // Criar contexto
    const context: RequestContext = {
      companyId,
      userId,
      contextMode: "sector",
      sector: sector,
    };

    console.log(`[SectorSummary] Gerando ${full ? "resumo completo" : "resumo rápido"} para setor: ${sector}`);

    // Gerar resumo rápido ou completo baseado no parâmetro
    let summary: any;
    if (full) {
      summary = await aiService.generateSectorSummary(sector, context, model);
    } else {
      summary = await aiService.generateQuickSectorSummary(sector, context, model);
    }

    console.log(`[SectorSummary] Resumo ${full ? "completo" : "rápido"} gerado com sucesso. Tokens: ${summary.tokens}, Citações: ${summary.citations?.length || 0}`);

    // Serializar citações para JSON (remover campos complexos se necessário)
    const citationsDetails = (summary.citations?.slice(0, 5) || []).map((citation: any) => ({
      chunkId: citation.chunkId,
      sourceId: citation.sourceId,
      sector: citation.sector,
      content: citation.content?.substring(0, 200) || "", // Limitar tamanho
      score: citation.score,
      tags: citation.tags || [],
    }));

    // Validar que o resumo foi gerado
    if (!summary || !summary.message) {
      throw new Error("Resumo não foi gerado corretamente");
    }

    const responseData = {
      success: true,
      data: {
        sector: sector,
        summary: String(summary.message || ""), // Garantir que é string
        model: summary.model,
        tokens: summary.tokens || 0,
        citations: summary.citations?.length || 0,
        timestamp: summary.timestamp ? summary.timestamp.toISOString() : new Date().toISOString(),
        citationsDetails: citationsDetails,
        // Incluir alertas críticos e dica rápida se for resumo rápido
        ...(summary.criticalAlerts && {
          criticalAlerts: summary.criticalAlerts,
          hasCriticalAlerts: summary.criticalAlerts.length > 0,
        }),
        ...(summary.quickTip && {
          quickTip: summary.quickTip,
        }),
        // Indicar se é resumo completo ou rápido
        type: full ? "full" : "quick",
        // Indicar se há resumo completo disponível
        hasFullReport: !full, // Se for rápido, há relatório completo disponível
      },
    };

    console.log(`[SectorSummary] Enviando resposta. Tamanho do resumo: ${responseData.data.summary.length} caracteres`);

    // Garantir que a resposta seja válida antes de enviar
    try {
      const jsonString = JSON.stringify(responseData);
      console.log(`[SectorSummary] JSON serializado com sucesso. Tamanho: ${jsonString.length} bytes`);
      
      return c.json(responseData);
    } catch (jsonError) {
      console.error("[SectorSummary] Erro ao serializar JSON:", jsonError);
      throw new Error(`Erro ao serializar resposta: ${jsonError instanceof Error ? jsonError.message : "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error in /ai/sector-summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[SectorSummary] Erro detalhado:", {
      message: errorMessage,
      stack: errorStack,
      sector: c.req.param("sector"),
    });

    return c.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorStack : undefined,
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

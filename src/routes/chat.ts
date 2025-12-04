import { Hono } from "hono";
import { z } from "zod";
import { ChatService } from "../services/chatService.js";

const chat = new Hono();
const chatService = new ChatService();

// Schemas de validação
const CreateSessionSchema = z.object({
  userId: z.string().min(1, "ID do usuário é obrigatório"),
  model: z.string().min(1, "Modelo é obrigatório"),
  contextMode: z.enum(["general", "sector"]).default("general"),
  sector: z.string().optional(),
});

const UpdateMessageSchema = z.object({
  favorite: z.boolean().optional(),
  tokens: z.number().optional(),
});

// GET /chat/sessions/:userId - Listar sessões do usuário
chat.get("/sessions/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const companyId = c.req.header("x-company-id");
    
    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const sessions = await chatService.getUserSessions(userId, companyId);

    return c.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    console.error("Error in GET /chat/sessions/:userId:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /chat/sessions - Criar nova sessão
chat.post("/sessions", async (c) => {
  try {
    const body = await c.req.json();
    const validation = CreateSessionSchema.safeParse(body);

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

    // Extrair company_id do header
    const companyId = c.req.header("x-company-id");
    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const { userId, model, contextMode, sector } = validation.data;
    
    // Validar contextMode e sector
    if (contextMode === "sector" && !sector) {
      return c.json(
        {
          success: false,
          error: "Campo 'sector' é obrigatório quando contextMode='sector'",
        },
        400
      );
    }
    console.log("Creating session for", { userId, model, contextMode, sector, companyId });
    const session = await chatService.createSessionWithContext(userId, model, contextMode, sector, companyId);
    console.log("Session created", session?.id);

    return c.json(
      {
        success: true,
        data: session,
      },
      201
    );
  } catch (error) {
    console.error("Error in POST /chat/sessions:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /chat/sessions/:sessionId/details - Obter detalhes da sessão
chat.get("/sessions/:sessionId/details", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = await chatService.getSession(sessionId);

    if (!session) {
      return c.json(
        {
          success: false,
          error: "Sessão não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: session,
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

// DELETE /chat/sessions/:sessionId - Deletar sessão
chat.delete("/sessions/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const deleted = await chatService.deleteSession(sessionId);

    if (!deleted) {
      return c.json(
        {
          success: false,
          error: "Sessão não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      message: "Sessão deletada com sucesso",
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

// POST /chat/sessions/:sessionId/clear - Limpar mensagens da sessão
chat.post("/sessions/:sessionId/clear", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = await chatService.clearSession(sessionId);

    if (!session) {
      return c.json(
        {
          success: false,
          error: "Sessão não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: session,
      message: "Sessão limpa com sucesso",
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

// PUT /chat/sessions/:sessionId/messages/:messageId - Atualizar mensagem
chat.put("/sessions/:sessionId/messages/:messageId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const messageId = c.req.param("messageId");
    const body = await c.req.json();

    const validation = UpdateMessageSchema.safeParse(body);
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

    const updatedMessage = await chatService.updateMessage(
      sessionId,
      messageId,
      validation.data
    );

    if (!updatedMessage) {
      return c.json(
        {
          success: false,
          error: "Sessão ou mensagem não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: updatedMessage,
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

// GET /chat/sessions/:sessionId/export - Exportar sessão
chat.get("/sessions/:sessionId/export", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const exportData = await chatService.exportSession(sessionId);

    if (!exportData) {
      return c.json(
        {
          success: false,
          error: "Sessão não encontrada",
        },
        404
      );
    }

    // Definir headers para download
    c.header("Content-Type", "application/json");
    c.header(
      "Content-Disposition",
      `attachment; filename="chat-session-${sessionId}.json"`
    );

    return c.text(exportData);
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

// GET /chat/sessions/:sessionId/stats - Estatísticas da sessão
chat.get("/sessions/:sessionId/stats", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const stats = await chatService.getSessionStats(sessionId);

    if (!stats) {
      return c.json(
        {
          success: false,
          error: "Sessão não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: stats,
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

// GET /chat/search/:userId - Buscar sessões
chat.get("/search/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const query = c.req.query("q");
    const companyId = c.req.header("x-company-id");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    if (!query) {
      return c.json(
        {
          success: false,
          error: 'Parâmetro de busca "q" é obrigatório',
        },
        400
      );
    }

    const sessions = await chatService.searchSessions(userId, companyId, query);

    return c.json({
      success: true,
      data: sessions,
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

export { chat };

import { Hono } from "hono";
import { z } from "zod";
import { AutentiqueService } from "../services/autentiqueService.js";
import type { RequestContext } from "../types/ai.js";

const autentique = new Hono();
const autentiqueService = new AutentiqueService();

// Helper para extrair contexto dos headers
function extractRequestContext(c: any, body: any): RequestContext {
  const companyId = c.req.header("x-company-id");
  const userId = c.req.header("x-user-id") || body.userId;
  
  if (!companyId) {
    throw new Error("Header x-company-id é obrigatório");
  }
  
  if (!userId) {
    throw new Error("Header x-user-id é obrigatório");
  }

  return {
    companyId,
    userId,
    contextMode: body.contextMode || "general",
    sector: body.sector,
  };
}

// Schemas de validação
const CreateDocumentSchema = z.object({
  name: z.string().min(1, "Nome do documento é obrigatório"),
  files: z.array(z.object({
    file: z.string(), // base64 encoded
    filename: z.string().min(1, "Nome do arquivo é obrigatório"),
  })).min(1, "Pelo menos um arquivo é obrigatório"),
  signers: z.array(z.object({
    name: z.string().min(1, "Nome do assinante é obrigatório"),
    email: z.string().email("Email inválido"),
    phone: z.string().optional(),
    action: z.enum(["SIGN", "APPROVE", "WITNESS"]).default("SIGN"),
    order: z.number().min(1).default(1),
  })).min(1, "Pelo menos um assinante é obrigatório"),
  settings: z.object({
    deadline: z.string().datetime().optional(),
    reminder_frequency: z.enum(["daily", "weekly", "none"]).default("daily"),
    allow_decline: z.boolean().default(false),
  }).optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const GetDocumentStatusSchema = z.object({
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// POST /autentique/documents - Criar documento para assinatura
autentique.post("/documents", async (c) => {
  try {
    const body = await c.req.json();
    const validation = CreateDocumentSchema.safeParse(body);

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

    const context = extractRequestContext(c, validation.data);
    const result = await autentiqueService.createDocument(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/documents:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /autentique/documents/:documentId - Status do documento
autentique.get("/documents/:documentId", async (c) => {
  try {
    const documentId = c.req.param("documentId");
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

    const result = await autentiqueService.getDocumentStatus(documentId, companyId);

    if (!result) {
      return c.json(
        {
          success: false,
          error: "Documento não encontrado",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/documents/:documentId:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /autentique/webhook - Webhook do Autentique
autentique.post("/webhook", async (c) => {
  try {
    const body = await c.req.json();
    const signature = c.req.header("x-autentique-signature");

    // Verificar assinatura do webhook (se configurada)
    if (process.env.AUTENTIQUE_WEBHOOK_SECRET && signature) {
      const isValid = await autentiqueService.verifyWebhookSignature(body, signature);
      if (!isValid) {
        return c.json(
          {
            success: false,
            error: "Assinatura inválida",
          },
          401
        );
      }
    }

    // Processar webhook
    const result = await autentiqueService.processWebhook(body);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/webhook:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /autentique/documents - Listar documentos
autentique.get("/documents", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const status = c.req.query("status");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await autentiqueService.getDocuments(companyId, {
      status,
      page,
      limit,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/documents:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /autentique/documents/:documentId/cancel - Cancelar documento
autentique.post("/documents/:documentId/cancel", async (c) => {
  try {
    const documentId = c.req.param("documentId");
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

    const result = await autentiqueService.cancelDocument(documentId, companyId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/documents/:documentId/cancel:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /autentique/documents/:documentId/remind - Enviar lembrete
autentique.post("/documents/:documentId/remind", async (c) => {
  try {
    const documentId = c.req.param("documentId");
    const body = await c.req.json();
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

    const result = await autentiqueService.sendReminder(documentId, body, companyId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /autentique/documents/:documentId/remind:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { autentique };

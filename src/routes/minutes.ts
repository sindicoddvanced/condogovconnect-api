import { Hono } from "hono";
import { z } from "zod";
import { MinutesService } from "../services/minutesService.js";
import type { RequestContext } from "../types/ai.js";

const minutes = new Hono();
const minutesService = new MinutesService();

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
const GenerateMinutesFromAssemblySchema = z.object({
  format: z.enum(["markdown", "pdf", "word"]).default("markdown"),
  generatePdf: z.boolean().default(false),
  aiSummary: z.boolean().default(true),
  sendForSignature: z.boolean().default(false),
  customTranscription: z.string().optional(),
  signers: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    role: z.string().optional(),
  })).optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const GenerateMinutesFromRecordingSchema = z.object({
  format: z.enum(["markdown", "pdf", "word"]).default("markdown"),
  aiSummary: z.boolean().default(true),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const GetMinutesSchema = z.object({
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const AddSignersSchema = z.object({
  signers: z.array(z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
    role: z.string().optional(),
  })).min(1, "Pelo menos um assinante é obrigatório"),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// POST /minutes/generate/:assemblyId - Gerar ata de assembleia
minutes.post("/generate/:assemblyId", async (c) => {
  try {
    const assemblyId = c.req.param("assemblyId");
    const body = await c.req.json();
    const validation = GenerateMinutesFromAssemblySchema.safeParse(body);

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
    const result = await minutesService.generateMinutesFromAssembly(
      assemblyId,
      validation.data,
      context
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/generate:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /minutes/generate-from-recording/:recordingId - Gerar ata de gravação
minutes.post("/generate-from-recording/:recordingId", async (c) => {
  try {
    const recordingId = c.req.param("recordingId");
    const body = await c.req.json();
    const validation = GenerateMinutesFromRecordingSchema.safeParse(body);

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
    const result = await minutesService.generateMinutesFromRecording(
      recordingId,
      validation.data,
      context
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/generate-from-recording:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /minutes/available/assemblies - Listar assembleias disponíveis
minutes.get("/available/assemblies", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const clientId = c.req.query("clientId");
    const status = c.req.query("status");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await minutesService.getAvailableAssemblies(companyId, { clientId, status });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/available/assemblies:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /minutes - Listar atas
minutes.get("/", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const clientId = c.req.query("clientId");
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

    const result = await minutesService.getMinutes(companyId, {
      clientId,
      status,
      page,
      limit,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /minutes/:id - Buscar ata específica
minutes.get("/:id", async (c) => {
  try {
    const minuteId = c.req.param("id");
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

    const result = await minutesService.getMinute(minuteId, companyId);

    if (!result) {
      return c.json(
        {
          success: false,
          error: "Ata não encontrada",
        },
        404
      );
    }

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/:id:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /minutes/:id/signatures - Adicionar assinantes
minutes.post("/:id/signatures", async (c) => {
  try {
    const minuteId = c.req.param("id");
    const body = await c.req.json();
    const validation = AddSignersSchema.safeParse(body);

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
    const result = await minutesService.addSigners(minuteId, validation.data.signers, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/:id/signatures:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /minutes/:id/reminders - Enviar lembretes
minutes.post("/:id/reminders", async (c) => {
  try {
    const minuteId = c.req.param("id");
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

    const context = extractRequestContext(c, { companyId });
    const result = await minutesService.sendReminders(minuteId, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /minutes/:id/reminders:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /minutes/:id/download/pdf - Download PDF
minutes.get("/:id/download/pdf", async (c) => {
  try {
    const minuteId = c.req.param("id");
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

    const result = await minutesService.downloadPdf(minuteId, companyId);

    if (!result) {
      return c.json(
        {
          success: false,
          error: "PDF não encontrado",
        },
        404
      );
    }

    // Retornar arquivo PDF
    return new Response(result.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": result.buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error in /minutes/:id/download/pdf:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { minutes };

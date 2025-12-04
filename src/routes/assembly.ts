import { Hono } from "hono";
import { z } from "zod";
import { AssemblyService } from "../services/assemblyService.js";
import type { RequestContext } from "../types/ai.js";

const assembly = new Hono();
const assemblyService = new AssemblyService();

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
const CreateAssemblySchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  scheduledDate: z.string().datetime().optional(),
  location: z.string().default("Virtual"),
  status: z.enum(["agendada", "realizada", "cancelada"]).default("agendada"),
  clientId: z.number().optional(),
  recordingId: z.number().optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const GenerateMinutesSchema = z.object({
  transcription_text: z.string().min(1, "Texto da transcrição é obrigatório"),
  assembly_details: z.object({
    title: z.string().min(1, "Título da assembleia é obrigatório"),
    date: z.string().datetime(),
    location: z.string().default("Virtual"),
    type: z.enum(["ordinary", "extraordinary", "special"]).default("ordinary"),
  }),
  format: z.enum(["markdown", "pdf", "word"]).default("markdown"),
  include_sections: z.array(z.string()).default([
    "abertura",
    "participantes", 
    "ordem_do_dia",
    "deliberacoes",
    "votacoes",
    "encerramento"
  ]),
  custom_instructions: z.string().optional(),
  language: z.string().default("pt-BR"),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const AnalyzeSentimentSchema = z.object({
  transcription_text: z.string().min(1, "Texto da transcrição é obrigatório"),
  analysis_type: z.enum(["conflict_detection", "emotion_analysis", "topic_sentiment"]).default("conflict_detection"),
  sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const GenerateSummarySchema = z.object({
  minutes_content: z.string().min(1, "Conteúdo da ata é obrigatório"),
  summary_type: z.enum(["executive", "detailed", "action_items", "decisions"]).default("executive"),
  max_length: z.number().min(100).max(2000).default(500),
  include_metrics: z.boolean().default(true),
  target_audience: z.enum(["management", "participants", "stakeholders"]).default("management"),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const IdentifySpeakersSchema = z.object({
  transcription_data: z.object({
    speakers: z.array(z.object({
      speaker: z.string(),
      text: z.string(),
      start_time: z.number(),
    })),
  }),
  known_participants: z.array(z.object({
    name: z.string(),
    role: z.string(),
    voice_characteristics: z.string().optional(),
  })).default([]),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// POST /assembly/assemblies - Criar assembleia
assembly.post("/assemblies", async (c) => {
  try {
    const body = await c.req.json();
    const validation = CreateAssemblySchema.safeParse(body);

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
    const result = await assemblyService.createAssembly(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /assembly/assemblies:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /assembly/assemblies - Listar assembleias
assembly.get("/assemblies", async (c) => {
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

    const result = await assemblyService.getAssemblies(companyId, { clientId, status });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /assembly/assemblies:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /assembly/transcription/:assemblyId - Buscar transcrição da assembleia
assembly.get("/transcription/:assemblyId", async (c) => {
  try {
    const assemblyId = c.req.param("assemblyId");
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

    const result = await assemblyService.getAssemblyTranscription(assemblyId, companyId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /assembly/transcription:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/generate-minutes - Gerar ata com IA
assembly.post("/ai/generate-minutes", async (c) => {
  try {
    const body = await c.req.json();
    const validation = GenerateMinutesSchema.safeParse(body);

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
    const result = await assemblyService.generateMinutes(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /ai/generate-minutes:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/analyze-sentiment - Análise de sentimento
assembly.post("/ai/analyze-sentiment", async (c) => {
  try {
    const body = await c.req.json();
    const validation = AnalyzeSentimentSchema.safeParse(body);

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
    const result = await assemblyService.analyzeSentiment(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /ai/analyze-sentiment:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/generate-summary - Gerar resumo executivo
assembly.post("/ai/generate-summary", async (c) => {
  try {
    const body = await c.req.json();
    const validation = GenerateSummarySchema.safeParse(body);

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
    const result = await assemblyService.generateSummary(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /ai/generate-summary:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /ai/identify-speakers - Identificar participantes
assembly.post("/ai/identify-speakers", async (c) => {
  try {
    const body = await c.req.json();
    const validation = IdentifySpeakersSchema.safeParse(body);

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
    const result = await assemblyService.identifySpeakers(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /ai/identify-speakers:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { assembly };

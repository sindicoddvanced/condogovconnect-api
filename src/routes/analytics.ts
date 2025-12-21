import { Hono } from "hono";
import { z } from "zod";
import { AnalyticsService } from "../services/analyticsService.js";
import type { RequestContext } from "../types/ai.js";

const analytics = new Hono();
const analyticsService = new AnalyticsService();

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
const AssemblyMetricsSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  client_id: z.string().optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// GET /analytics/assembly-metrics - Métricas de assembleias
analytics.get("/assembly-metrics", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");
    const clientId = c.req.query("client_id");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const validation = AssemblyMetricsSchema.safeParse({
      start_date: startDate,
      end_date: endDate,
      client_id: clientId,
      companyId,
    });

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

    const result = await analyticsService.getAssemblyMetrics(validation.data);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /analytics/assembly-metrics:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /analytics/transcription-metrics - Métricas de transcrição
analytics.get("/transcription-metrics", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await analyticsService.getTranscriptionMetrics(companyId, {
      startDate,
      endDate,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /analytics/transcription-metrics:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /analytics/signature-metrics - Métricas de assinatura
analytics.get("/signature-metrics", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await analyticsService.getSignatureMetrics(companyId, {
      startDate,
      endDate,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /analytics/signature-metrics:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /analytics/usage-metrics - Métricas de uso
analytics.get("/usage-metrics", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const startDate = c.req.query("start_date");
    const endDate = c.req.query("end_date");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await analyticsService.getUsageMetrics(companyId, {
      startDate,
      endDate,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /analytics/usage-metrics:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /analytics/dashboard - Dashboard completo
analytics.get("/dashboard", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const period = c.req.query("period") || "30d"; // 7d, 30d, 90d, 1y

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const result = await analyticsService.getDashboard(companyId, period);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /analytics/dashboard:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { analytics };

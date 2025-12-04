import { Hono } from "hono";
import { z } from "zod";
import { TranscriptionService } from "../services/transcriptionService.js";
import type { RequestContext } from "../types/ai.js";

const transcription = new Hono();
const transcriptionService = new TranscriptionService();

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
const SubmitTranscriptionSchema = z.object({
  audio_url: z.string().url("URL do áudio deve ser válida"),
  language_code: z.enum(["pt", "en", "es"]).default("pt"),
  speaker_labels: z.boolean().default(true),
  auto_highlights: z.boolean().default(true),
  sentiment_analysis: z.boolean().default(true),
  entity_detection: z.boolean().default(true),
  formatting: z.object({
    punctuate: z.boolean().default(true),
    disfluencies: z.boolean().default(false),
    profanity_filter: z.boolean().default(true),
  }).default({}),
  custom_vocabulary: z.array(z.string()).default([]),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

const UploadRecordingSchema = z.object({
  roomId: z.string().min(1, "Room ID é obrigatório"),
  roomName: z.string().min(1, "Room name é obrigatório"),
  isAssembly: z.boolean().default(false),
  assemblyTitle: z.string().optional(),
  clientId: z.string().optional(),
  assemblyDescription: z.string().optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// POST /transcription/submit - Submeter áudio para transcrição
transcription.post("/submit", async (c) => {
  try {
    const body = await c.req.json();
    const validation = SubmitTranscriptionSchema.safeParse(body);

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
    const result = await transcriptionService.submitTranscription(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /transcription/submit:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /transcription/:transcription_id/status - Verificar status da transcrição
transcription.get("/:transcription_id/status", async (c) => {
  try {
    const transcriptionId = c.req.param("transcription_id");
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

    const result = await transcriptionService.getTranscriptionStatus(transcriptionId, companyId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /transcription/status:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /videoconference/recordings/upload - Upload de gravação
transcription.post("/videoconference/recordings/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const recording = formData.get("recording") as File;
    const roomId = formData.get("roomId") as string;
    const roomName = formData.get("roomName") as string;
    const isAssembly = formData.get("isAssembly") === "true";
    const assemblyTitle = formData.get("assemblyTitle") as string;
    const clientId = formData.get("clientId") as string;
    const assemblyDescription = formData.get("assemblyDescription") as string;
    const companyId = c.req.header("x-company-id");

    if (!recording) {
      return c.json(
        {
          success: false,
          error: "Arquivo de gravação é obrigatório",
        },
        400
      );
    }

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    const validation = UploadRecordingSchema.safeParse({
      roomId,
      roomName,
      isAssembly,
      assemblyTitle,
      clientId,
      assemblyDescription,
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

    const context = extractRequestContext(c, validation.data);
    const result = await transcriptionService.uploadRecording(
      recording,
      validation.data,
      context
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /videoconference/recordings/upload:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /videoconference/recordings/:recording_id/status - Status do processamento
transcription.get("/videoconference/recordings/:recording_id/status", async (c) => {
  try {
    const recordingId = c.req.param("recording_id");
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

    const result = await transcriptionService.getRecordingStatus(recordingId, companyId);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /videoconference/recordings/status:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { transcription };

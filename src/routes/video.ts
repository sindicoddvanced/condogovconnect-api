import { Hono } from "hono";
import { z } from "zod";
import { DailyService } from "../services/dailyService.js";

const video = new Hono();

// Função helper para obter DailyService (lazy initialization)
function getDailyService(): DailyService {
  try {
    return new DailyService();
  } catch (error) {
    console.error("[VideoRoutes] Erro ao inicializar DailyService:", error);
    throw new Error("DailyService não pôde ser inicializado. Verifique DAILY_API_KEY no arquivo .env");
  }
}

// Schemas de validação
const CreateRoomSchema = z.object({
  name: z.string().optional(),
  privacy: z.enum(["public", "private"]).default("public"),
  properties: z.object({
    enable_chat: z.boolean().optional(),
    enable_screenshare: z.boolean().optional(),
    enable_recording: z.enum(["cloud", "local", "raw-tracks"]).optional(),
    enable_transcription_storage: z.boolean().optional(),
    auto_transcription_settings: z.record(z.string(), z.any()).optional(), // Objeto com configurações de transcrição
    max_participants: z.number().optional(),
    exp: z.number().optional(),
    nbf: z.number().optional(), // "Not before" timestamp
    enable_prejoin_ui: z.boolean().optional(),
    enable_knocking: z.boolean().optional(),
    enable_network_ui: z.boolean().optional(),
    enable_people_ui: z.boolean().optional(),
    enable_pip_ui: z.boolean().optional(),
    enable_live_captions_ui: z.boolean().optional(),
    enable_noise_cancellation_ui: z.boolean().optional(),
    enable_breakout_rooms: z.boolean().optional(),
    enable_video_processing_ui: z.boolean().optional(),
    enable_shared_chat_history: z.boolean().optional(),
    start_video_off: z.boolean().optional(),
    start_audio_off: z.boolean().optional(),
    owner_only_broadcast: z.boolean().optional(),
    enable_emoji_reactions: z.boolean().optional(),
    enable_hand_raising: z.boolean().optional(),
    enable_advanced_chat: z.boolean().optional(),
    enable_hidden_participants: z.boolean().optional(),
    enable_mesh_sfu: z.boolean().optional(),
    sfu_switchover: z.number().optional(),
    enable_adaptive_simulcast: z.boolean().optional(),
    enable_multiparty_adaptive_simulcast: z.boolean().optional(),
    enforce_unique_user_ids: z.boolean().optional(),
    experimental_optimize_large_calls: z.boolean().optional(),
    lang: z.string().optional(),
    geo: z.string().optional(),
    eject_at_room_exp: z.boolean().optional(),
    eject_after_elapsed: z.number().optional(),
    enable_terse_logging: z.boolean().optional(),
    enable_dialout: z.boolean().optional(),
  }).passthrough().optional(), // passthrough permite propriedades adicionais não definidas no schema
});

const CreateMeetingTokenSchema = z.object({
  properties: z.object({
    room_name: z.string().min(1, "Nome da sala é obrigatório"),
    user_id: z.string().optional(),
    user_name: z.string().optional(),
    is_owner: z.boolean().optional(),
    exp: z.number().optional(),
    enable_recording: z.enum(["cloud", "local", "none"]).optional(),
    enable_transcription: z.boolean().optional(),
    enable_screenshare: z.boolean().optional(),
    enable_chat: z.boolean().optional(),
  }),
});

const StartRecordingSchema = z.object({
  format: z.enum(["mp4", "webm"]).optional(),
  layout: z.enum(["default", "grid", "single-speaker", "active-speaker"]).optional(),
  max_duration: z.number().optional(),
  resolution: z.enum(["720p", "1080p"]).optional(),
});

const StartTranscriptionSchema = z.object({
  language: z.string().optional(),
  model: z.enum(["nova-2", "whisper"]).optional(),
});

// POST /video/rooms - Criar uma nova sala de vídeo
video.post("/rooms", async (c) => {
  try {
    const body = await c.req.json();
    console.log("[VideoRoutes] Criando sala com dados:", JSON.stringify(body, null, 2));
    
    // Converter enable_recording de boolean para string se necessário (compatibilidade)
    if (body.properties?.enable_recording === true) {
      body.properties.enable_recording = "cloud";
    } else if (body.properties?.enable_recording === false) {
      delete body.properties.enable_recording;
    }
    
    // Remover propriedades inválidas
    if (body.properties?.enable_transcription !== undefined) {
      console.warn("[VideoRoutes] enable_transcription não é suportado. Use enable_transcription_storage.");
      delete body.properties.enable_transcription;
    }
    
    if (body.properties?.auto_start_transcription !== undefined) {
      console.warn("[VideoRoutes] auto_start_transcription não é uma propriedade de room. Use enable_transcription_storage ou inicie transcrição via API após criar a sala.");
      delete body.properties.auto_start_transcription;
    }
    
    const validation = CreateRoomSchema.safeParse(body);

    if (!validation.success) {
      console.error("[VideoRoutes] Validação falhou:", validation.error.issues);
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    console.log("[VideoRoutes] Dados validados, criando sala...");
    const dailyService = getDailyService();
    const room = await dailyService.createRoom(validation.data);
    console.log("[VideoRoutes] Sala criada com sucesso:", room.id || room.name);

    return c.json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("[VideoRoutes] Error creating room:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    console.error("[VideoRoutes] Detalhes do erro:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

// GET /video/rooms - Listar todas as salas
video.get("/rooms", async (c) => {
  try {
    const limit = c.req.query("limit");
    const starting_after = c.req.query("starting_after");
    const ending_before = c.req.query("ending_before");

    const dailyService = getDailyService();
    const rooms = await dailyService.listRooms({
      limit: limit ? parseInt(limit) : undefined,
      starting_after: starting_after || undefined,
      ending_before: ending_before || undefined,
    });

    return c.json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    console.error("Error listing rooms:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/rooms/:name - Obter detalhes de uma sala
video.get("/rooms/:name", async (c) => {
  try {
    const roomName = c.req.param("name");
    const dailyService = getDailyService();
    const room = await dailyService.getRoom(roomName);

    return c.json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Error getting room:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// DELETE /video/rooms/:name - Deletar uma sala
video.delete("/rooms/:name", async (c) => {
  try {
    const roomName = c.req.param("name");
    const dailyService = getDailyService();
    const result = await dailyService.deleteRoom(roomName);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error deleting room:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /video/meeting-tokens - Criar token de reunião
video.post("/meeting-tokens", async (c) => {
  try {
    const body = await c.req.json();
    const validation = CreateMeetingTokenSchema.safeParse(body);

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

    const dailyService = getDailyService();
    const token = await dailyService.createMeetingToken(validation.data);

    return c.json({
      success: true,
      data: token,
    });
  } catch (error) {
    console.error("Error creating meeting token:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/meeting-tokens/:token - Obter informações de um token
video.get("/meeting-tokens/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const dailyService = getDailyService();
    const tokenInfo = await dailyService.getMeetingToken(token);

    return c.json({
      success: true,
      data: tokenInfo,
    });
  } catch (error) {
    console.error("Error getting meeting token:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /video/rooms/:name/recordings/start - Iniciar gravação
video.post("/rooms/:name/recordings/start", async (c) => {
  try {
    const roomName = c.req.param("name");
    const body = await c.req.json();
    const validation = StartRecordingSchema.safeParse(body);

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

    const dailyService = getDailyService();
    const recording = await dailyService.startRecording(roomName, validation.data);

    return c.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /video/rooms/:name/recordings/stop - Parar gravação
video.post("/rooms/:name/recordings/stop", async (c) => {
  try {
    const roomName = c.req.param("name");
    const dailyService = getDailyService();
    const result = await dailyService.stopRecording(roomName);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error stopping recording:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /video/rooms/:name/transcription/start - Iniciar transcrição
video.post("/rooms/:name/transcription/start", async (c) => {
  try {
    const roomName = c.req.param("name");
    const body = await c.req.json();
    const validation = StartTranscriptionSchema.safeParse(body);

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

    const dailyService = getDailyService();
    const transcription = await dailyService.startTranscription(roomName, validation.data);

    return c.json({
      success: true,
      data: transcription,
    });
  } catch (error) {
    console.error("Error starting transcription:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /video/rooms/:name/transcription/stop - Parar transcrição
video.post("/rooms/:name/transcription/stop", async (c) => {
  try {
    const roomName = c.req.param("name");
    const dailyService = getDailyService();
    const result = await dailyService.stopTranscription(roomName);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error stopping transcription:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/recordings - Listar gravações
video.get("/recordings", async (c) => {
  try {
    const limit = c.req.query("limit");
    const starting_after = c.req.query("starting_after");
    const ending_before = c.req.query("ending_before");
    const room_name = c.req.query("room_name");

    const dailyService = getDailyService();
    const recordings = await dailyService.listRecordings({
      limit: limit ? parseInt(limit) : undefined,
      starting_after: starting_after || undefined,
      ending_before: ending_before || undefined,
      room_name: room_name || undefined,
    });

    return c.json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    console.error("Error listing recordings:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/recordings/:id - Obter detalhes de uma gravação
video.get("/recordings/:id", async (c) => {
  try {
    const recordingId = c.req.param("id");
    const dailyService = getDailyService();
    const recording = await dailyService.getRecording(recordingId);

    return c.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    console.error("Error getting recording:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/recordings/:id/access-link - Obter link de acesso para gravação
video.get("/recordings/:id/access-link", async (c) => {
  try {
    const recordingId = c.req.param("id");
    const valid_for_secs = c.req.query("valid_for_secs");

    // Validar valid_for_secs (máximo 43200 segundos = 12 horas)
    let validForSecs: number | undefined = undefined;
    if (valid_for_secs) {
      const parsed = parseInt(valid_for_secs);
      if (isNaN(parsed) || parsed < 1) {
        return c.json(
          {
            success: false,
            error: "valid_for_secs deve ser um número positivo",
          },
          400
        );
      }
      if (parsed > 43200) {
        return c.json(
          {
            success: false,
            error: "valid_for_secs não pode exceder 43200 segundos (12 horas). Valor máximo permitido: 43200",
          },
          400
        );
      }
      validForSecs = parsed;
    }

    const dailyService = getDailyService();
    const link = await dailyService.getRecordingAccessLink(recordingId, {
      valid_for_secs: validForSecs,
    });

    return c.json({
      success: true,
      data: link,
    });
  } catch (error) {
    console.error("Error getting recording access link:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/transcripts - Listar transcrições
video.get("/transcripts", async (c) => {
  try {
    const limit = c.req.query("limit");
    const starting_after = c.req.query("starting_after");
    const ending_before = c.req.query("ending_before");

    const dailyService = getDailyService();
    const transcripts = await dailyService.listTranscripts({
      limit: limit ? parseInt(limit) : undefined,
      starting_after: starting_after || undefined,
      ending_before: ending_before || undefined,
    });

    return c.json({
      success: true,
      data: transcripts,
    });
  } catch (error) {
    console.error("Error listing transcripts:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/transcripts/:id - Obter detalhes de uma transcrição
video.get("/transcripts/:id", async (c) => {
  try {
    const transcriptId = c.req.param("id");
    const dailyService = getDailyService();
    const transcript = await dailyService.getTranscript(transcriptId);

    return c.json({
      success: true,
      data: transcript,
    });
  } catch (error) {
    console.error("Error getting transcript:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /video/transcripts/:id/access-link - Obter link de acesso para transcrição
video.get("/transcripts/:id/access-link", async (c) => {
  try {
    const transcriptId = c.req.param("id");
    const valid_for_secs = c.req.query("valid_for_secs");

    // Validar valid_for_secs (máximo 43200 segundos = 12 horas)
    let validForSecs: number | undefined = undefined;
    if (valid_for_secs) {
      const parsed = parseInt(valid_for_secs);
      if (isNaN(parsed) || parsed < 1) {
        return c.json(
          {
            success: false,
            error: "valid_for_secs deve ser um número positivo",
          },
          400
        );
      }
      if (parsed > 43200) {
        return c.json(
          {
            success: false,
            error: "valid_for_secs não pode exceder 43200 segundos (12 horas). Valor máximo permitido: 43200",
          },
          400
        );
      }
      validForSecs = parsed;
    }

    const dailyService = getDailyService();
    const link = await dailyService.getTranscriptAccessLink(transcriptId, {
      valid_for_secs: validForSecs,
    });

    return c.json({
      success: true,
      data: link,
    });
  } catch (error) {
    console.error("Error getting transcript access link:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { video };


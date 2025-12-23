/**
 * Serviço para integração com Daily.co API
 * Documentação: https://docs.daily.co/reference/rest-api
 */
export class DailyService {
  private apiKey: string;
  private baseUrl: string = "https://api.daily.co/v1";

  constructor() {
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
      console.error("[DailyService] DAILY_API_KEY não encontrada nas variáveis de ambiente");
      throw new Error("DAILY_API_KEY environment variable is required");
    }
    this.apiKey = apiKey;
    console.log(`[DailyService] Inicializado com API key: ${apiKey.substring(0, 10)}...`);
  }

  /**
   * Helper para tratar erros da API Daily.co
   */
  private handleApiError(response: Response, url: string, error: { error?: string; info?: string }): never {
    const errorMessage = `Daily API error: ${error.error || response.statusText}`;
    console.error(`[DailyService] Erro na requisição: ${errorMessage}`, {
      status: response.status,
      statusText: response.statusText,
      error: error.error,
      info: error.info,
      url: url,
      apiKeyPrefix: this.apiKey?.substring(0, 20),
    });
    
    // Mensagem mais clara para erro de autenticação
    if (error.error === "authentication-error" || response.status === 401) {
      throw new Error(`Erro de autenticação Daily.co (401): A chave DAILY_API_KEY pode estar incorreta ou expirada. Verifique o arquivo .env e confirme que a chave está correta. Token usado: ${this.apiKey.substring(0, 20)}... Erro detalhado: ${error.info || error.error}`);
    }
    
    // Mensagem mais clara para erro de requisição inválida
    if (error.error === "invalid-request-error" || response.status === 400) {
      throw new Error(`Erro de requisição inválida Daily.co (400): ${error.info || error.error || "Verifique o formato dos dados enviados. Consulte a documentação: https://docs.daily.co/reference/rest-api/rooms/create-room"}`);
    }
    
    throw new Error(errorMessage);
  }

  /**
   * Cria uma nova sala de vídeo
   */
  async createRoom(options?: {
    name?: string;
    privacy?: "public" | "private";
    properties?: Record<string, any>; // Aceitar qualquer propriedade válida da API Daily.co
  }): Promise<any> {
    // Construir properties removendo campos undefined/null
    const properties: any = {};
    if (options?.properties) {
      Object.entries(options.properties).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          properties[key] = value;
        }
      });
    }
    
    const requestBody: any = {
      name: options?.name,
      privacy: options?.privacy || "public",
    };
    
    // Só adicionar properties se houver propriedades definidas
    if (Object.keys(properties).length > 0) {
      requestBody.properties = properties;
    }
    
    const requestUrl = `${this.baseUrl}/rooms`;
    console.log(`[DailyService] Criando sala: ${requestUrl}`);
    console.log(`[DailyService] Request body:`, JSON.stringify(requestBody, null, 2));
    console.log(`[DailyService] API Key (primeiros 20 chars): ${this.apiKey.substring(0, 20)}...`);
    
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Lista todas as salas
   */
  async listRooms(options?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.starting_after) params.append("starting_after", options.starting_after);
    if (options?.ending_before) params.append("ending_before", options.ending_before);

    const url = `${this.baseUrl}/rooms${params.toString() ? `?${params.toString()}` : ""}`;
    console.log(`[DailyService] Listando salas: ${url}`);
    console.log(`[DailyService] API Key configurada: ${this.apiKey ? 'Sim' : 'Não'} (${this.apiKey?.substring(0, 10)}...)`);
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, url, error);
    }

    return await response.json();
  }

  /**
   * Obtém detalhes de uma sala específica
   */
  async getRoom(roomName: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Deleta uma sala
   */
  async deleteRoom(roomName: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}`;
    const response = await fetch(requestUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Gera um token de reunião para um usuário
   */
  async createMeetingToken(options: {
    properties: {
      room_name: string;
      user_id?: string;
      user_name?: string;
      is_owner?: boolean;
      exp?: number; // Expiração em segundos
      enable_recording?: "cloud" | "local" | "none";
      enable_transcription?: boolean;
      enable_screenshare?: boolean;
      enable_chat?: boolean;
    };
  }): Promise<any> {
    const requestUrl = `${this.baseUrl}/meeting-tokens`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Obtém informações de um token de reunião
   */
  async getMeetingToken(token: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/meeting-tokens/${token}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Inicia gravação de uma sala
   */
  async startRecording(roomName: string, options?: {
    format?: "mp4" | "webm";
    layout?: "default" | "grid" | "single-speaker" | "active-speaker" | { preset?: string; [key: string]: any };
    max_duration?: number;
    resolution?: "720p" | "1080p";
  }): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}/recordings/start`;
    
    // Construir body dinamicamente
    // Nota: A API do Daily.co não aceita os parâmetros 'format' e 'resolution' na requisição de gravação
    // Apenas 'layout' e 'max_duration' são aceitos
    const body: any = {};
    
    // Layout deve ser um objeto, não uma string
    if (options?.layout) {
      if (typeof options.layout === "string") {
        // Se for string, converter para objeto com preset
        body.layout = { preset: options.layout };
      } else {
        // Se já for objeto, usar diretamente
        body.layout = options.layout;
      }
    } else {
      // Se não especificado, usar default como objeto
      body.layout = { preset: "default" };
    }
    
    // Adicionar max_duration apenas se especificado
    if (options?.max_duration) {
      body.max_duration = options.max_duration;
    }
    
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Para gravação de uma sala
   */
  async stopRecording(roomName: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}/recordings/stop`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Inicia transcrição de uma sala
   */
  async startTranscription(roomName: string, options?: {
    language?: string;
    model?: "nova-2" | "whisper";
  }): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}/transcription/start`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: options?.language || "pt-BR",
        model: options?.model || "nova-2",
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Para transcrição de uma sala
   */
  async stopTranscription(roomName: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/rooms/${roomName}/transcription/stop`;
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Lista gravações
   */
  async listRecordings(options?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
    room_name?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.starting_after) params.append("starting_after", options.starting_after);
    if (options?.ending_before) params.append("ending_before", options.ending_before);
    if (options?.room_name) params.append("room_name", options.room_name);

    const requestUrl = `${this.baseUrl}/recordings${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Obtém detalhes de uma gravação
   */
  async getRecording(recordingId: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/recordings/${recordingId}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Obtém link de acesso para uma gravação
   */
  async getRecordingAccessLink(recordingId: string, options?: {
    valid_for_secs?: number;
  }): Promise<any> {
    // Validar valid_for_secs (máximo 43200 segundos = 12 horas)
    if (options?.valid_for_secs && options.valid_for_secs > 43200) {
      throw new Error(
        `valid_for_secs não pode exceder 43200 segundos (12 horas). Valor recebido: ${options.valid_for_secs}. ` +
        `Valor máximo permitido pela API Daily.co: 43200 segundos.`
      );
    }
    
    const params = new URLSearchParams();
    if (options?.valid_for_secs) params.append("valid_for_secs", options.valid_for_secs.toString());

    const requestUrl = `${this.baseUrl}/recordings/${recordingId}/access-link${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Lista transcrições
   */
  async listTranscripts(options?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.starting_after) params.append("starting_after", options.starting_after);
    if (options?.ending_before) params.append("ending_before", options.ending_before);

    const requestUrl = `${this.baseUrl}/transcript${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Obtém detalhes de uma transcrição
   */
  async getTranscript(transcriptId: string): Promise<any> {
    const requestUrl = `${this.baseUrl}/transcript/${transcriptId}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }

  /**
   * Obtém link de acesso para uma transcrição
   */
  async getTranscriptAccessLink(transcriptId: string, options?: {
    valid_for_secs?: number;
  }): Promise<any> {
    // Validar valid_for_secs (máximo 43200 segundos = 12 horas)
    if (options?.valid_for_secs && options.valid_for_secs > 43200) {
      throw new Error(
        `valid_for_secs não pode exceder 43200 segundos (12 horas). Valor recebido: ${options.valid_for_secs}. ` +
        `Valor máximo permitido pela API Daily.co: 43200 segundos.`
      );
    }
    
    const params = new URLSearchParams();
    if (options?.valid_for_secs) params.append("valid_for_secs", options.valid_for_secs.toString());

    const requestUrl = `${this.baseUrl}/transcript/${transcriptId}/access-link${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; info?: string };
      this.handleApiError(response, requestUrl, error);
    }

    return await response.json();
  }
}


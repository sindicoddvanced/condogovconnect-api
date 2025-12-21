import OpenAI from "openai";
import type { RequestContext } from "../types/ai.js";

/**
 * Serviço para transcrição de áudio usando Gemini 2.5 Pro
 * Implementa as APIs conforme especificado no PRD
 */
export class TranscriptionService {
  private openaiRouter: OpenAI;

  constructor() {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    this.openaiRouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      defaultHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "CondoGov API",
      },
    });
  }

  /**
   * Submete áudio para transcrição
   */
  async submitTranscription(data: any, context: RequestContext) {
    try {
      // 1. Upload do áudio para storage (simulado)
      const audioUrl = await this.uploadAudioToStorage(data.audio_url, context.companyId);

      // 2. Transcrição usando Gemini 2.5 Pro
      const transcription = await this.transcribeWithGemini(audioUrl, data);

      // 3. Salvar no banco
      const transcriptionId = await this.saveTranscription({
        companyId: context.companyId,
        audioUrl: data.audio_url,
        transcription,
        options: data,
        createdBy: context.userId,
      });

      return {
        transcription_id: transcriptionId,
        status: "queued",
        estimated_completion: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
      };
    } catch (error) {
      console.error("Error submitting transcription:", error);
      throw error;
    }
  }

  /**
   * Busca status da transcrição
   */
  async getTranscriptionStatus(transcriptionId: string, companyId: string) {
    try {
      // Simular busca no banco
      const transcription = await this.getTranscriptionFromDatabase(transcriptionId, companyId);

      if (!transcription) {
        throw new Error("Transcrição não encontrada");
      }

      return {
        status: transcription.status,
        text: transcription.text,
        speakers: transcription.speakers,
        highlights: transcription.highlights,
        entities: transcription.entities,
        sentiment_analysis: transcription.sentiment_analysis,
        confidence: transcription.confidence,
      };
    } catch (error) {
      console.error("Error getting transcription status:", error);
      throw error;
    }
  }

  /**
   * Upload de gravação
   */
  async uploadRecording(file: File, data: any, context: RequestContext) {
    try {
      // 1. Upload do arquivo para Supabase Storage
      const audioUrl = await this.uploadFileToStorage(file, context.companyId);

      // 2. Criar registro de gravação
      const recording = await this.saveRecording({
        companyId: context.companyId,
        roomId: data.roomId,
        roomName: data.roomName,
        filePath: audioUrl,
        fileSize: file.size,
        isAssembly: data.isAssembly,
        createdBy: context.userId,
      });

      // 3. Iniciar processamento de transcrição
      const transcriptionJob = await this.startTranscriptionJob(recording.id, audioUrl);

      return {
        recording: {
          id: recording.id,
          room_id: data.roomId,
          file_path: audioUrl,
          file_size: file.size,
          duration: 0, // Será calculado durante processamento
          status: "processing",
          created_at: new Date().toISOString(),
        },
        transcription_job: {
          id: transcriptionJob.id,
          status: "queued",
          estimated_completion: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
        },
      };
    } catch (error) {
      console.error("Error uploading recording:", error);
      throw error;
    }
  }

  /**
   * Status do processamento de gravação
   */
  async getRecordingStatus(recordingId: string, companyId: string) {
    try {
      // Simular busca no banco
      const recording = await this.getRecordingFromDatabase(recordingId, companyId);

      if (!recording) {
        throw new Error("Gravação não encontrada");
      }

      return {
        status: recording.status,
        progress: recording.progress,
        transcription_status: recording.transcription_status,
        transcription_id: recording.transcription_id,
        processing_time: recording.processing_time,
        error: recording.error,
      };
    } catch (error) {
      console.error("Error getting recording status:", error);
      throw error;
    }
  }

  /**
   * Transcrição usando Gemini 2.5 Pro
   */
  private async transcribeWithGemini(audioUrl: string, options: any) {
    try {
      const completion = await this.openaiRouter.chat.completions.create({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcreva este áudio para texto em ${options.language_code}. 
                
                Configurações:
                - Identificação de falantes: ${options.speaker_labels ? 'Sim' : 'Não'}
                - Destaques automáticos: ${options.auto_highlights ? 'Sim' : 'Não'}
                - Análise de sentimento: ${options.sentiment_analysis ? 'Sim' : 'Não'}
                - Detecção de entidades: ${options.entity_detection ? 'Sim' : 'Não'}
                - Pontuação: ${options.formatting.punctuate ? 'Sim' : 'Não'}
                - Filtro de profanidade: ${options.formatting.profanity_filter ? 'Sim' : 'Não'}
                
                Vocabulário personalizado: ${options.custom_vocabulary.join(', ')}
                
                Mantenha formatação natural e identifique falantes quando possível.`,
              },
              {
                type: "audio_url",
                audio_url: { url: audioUrl },
              },
            ],
          },
        ],
        temperature: 0.1,
      });

      const text = completion.choices[0]?.message?.content || "";
      
      // Processar resultado para extrair informações estruturadas
      const processedResult = this.processTranscriptionResult(text, options);

      return processedResult;
    } catch (error) {
      console.error("Gemini transcription failed:", error);
      throw error;
    }
  }

  /**
   * Processa resultado da transcrição
   */
  private processTranscriptionResult(text: string, options: any) {
    // Extrair speakers se identificados
    const speakers = this.extractSpeakers(text);
    
    // Extrair highlights se solicitado
    const highlights = options.auto_highlights ? this.extractHighlights(text) : [];
    
    // Extrair entidades se solicitado
    const entities = options.entity_detection ? this.extractEntities(text) : [];
    
    // Análise de sentimento se solicitado
    const sentiment_analysis = options.sentiment_analysis ? this.analyzeSentiment(text) : null;

    return {
      text,
      confidence: 0.95,
      language: options.language_code,
      duration: 0, // Será calculado
      speakers,
      highlights,
      entities,
      sentiment_analysis,
    };
  }

  /**
   * Extrai speakers do texto
   */
  private extractSpeakers(text: string) {
    // Implementação simplificada
    const speakerPattern = /(?:Falante|Speaker|Participante)\s*([A-Z]):\s*(.+?)(?=(?:Falante|Speaker|Participante)\s*[A-Z]:|$)/gs;
    const speakers = [];
    let match;

    while ((match = speakerPattern.exec(text)) !== null) {
      speakers.push({
        speaker: match[1],
        text: match[2].trim(),
        start_time: speakers.length * 30, // Estimativa
        end_time: (speakers.length + 1) * 30,
        confidence: 0.9,
      });
    }

    return speakers;
  }

  /**
   * Extrai highlights do texto
   */
  private extractHighlights(text: string) {
    // Implementação simplificada
    const highlights = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    
    // Selecionar frases importantes (contendo palavras-chave)
    const keywords = ['aprovação', 'decisão', 'votação', 'resolução', 'importante', 'urgente'];
    
    sentences.forEach((sentence, index) => {
      if (keywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
        highlights.push({
          text: sentence.trim(),
          start_time: index * 10,
          end_time: (index + 1) * 10,
          sentiment: "neutral",
        });
      }
    });

    return highlights;
  }

  /**
   * Extrai entidades do texto
   */
  private extractEntities(text: string) {
    // Implementação simplificada
    const entities = [];
    
    // Padrões para diferentes tipos de entidades
    const patterns = {
      PERSON: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
      MONEY: /R\$\s*[\d.,]+/g,
      DATE: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
    };

    Object.entries(patterns).forEach(([type, pattern]) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          text: match[0],
          entity_type: type,
          start_time: 0, // Seria calculado com base na posição no texto
          confidence: 0.8,
        });
      }
    });

    return entities;
  }

  /**
   * Análise de sentimento
   */
  private analyzeSentiment(text: string) {
    // Implementação simplificada
    const positiveWords = ['bom', 'ótimo', 'excelente', 'aprovado', 'concordo'];
    const negativeWords = ['ruim', 'problema', 'erro', 'rejeitado', 'discordo'];
    
    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    
    let overall = "neutral";
    if (positiveCount > negativeCount) {
      overall = "positive";
    } else if (negativeCount > positiveCount) {
      overall = "negative";
    }

    return {
      overall,
      by_speaker: {
        A: overall,
        B: overall,
      },
    };
  }

  /**
   * Upload de áudio para storage
   */
  private async uploadAudioToStorage(audioUrl: string, companyId: string): Promise<string> {
    // Simular upload
    const mockUrl = `https://dzfippnhokywoylasoiz.supabase.co/storage/v1/object/public/audio-files/${companyId}/audio-${Date.now()}.mp3`;
    console.log(`📁 Audio uploaded (simulated): ${mockUrl}`);
    return mockUrl;
  }

  /**
   * Upload de arquivo para storage
   */
  private async uploadFileToStorage(file: File, companyId: string): Promise<string> {
    // Simular upload
    const mockUrl = `https://dzfippnhokywoylasoiz.supabase.co/storage/v1/object/public/recordings/${companyId}/${file.name}`;
    console.log(`📁 File uploaded (simulated): ${mockUrl}`);
    return mockUrl;
  }

  /**
   * Salva transcrição no banco
   */
  private async saveTranscription(data: any): Promise<string> {
    const transcriptionId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`💾 Transcription saved (simulated): ${transcriptionId}`);
    return transcriptionId;
  }

  /**
   * Salva gravação no banco
   */
  private async saveRecording(data: any): Promise<any> {
    const recordingId = Math.floor(Math.random() * 1000000);
    console.log(`💾 Recording saved (simulated): ${recordingId}`);
    return {
      id: recordingId,
      ...data,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Inicia job de transcrição
   */
  private async startTranscriptionJob(recordingId: number, audioUrl: string): Promise<any> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔄 Transcription job started (simulated): ${jobId}`);
    return {
      id: jobId,
      recording_id: recordingId,
      status: "queued",
    };
  }

  /**
   * Busca transcrição no banco
   */
  private async getTranscriptionFromDatabase(transcriptionId: string, companyId: string): Promise<any> {
    // Simular busca
    return {
      id: transcriptionId,
      company_id: companyId,
      status: "completed",
      text: "Transcrição completa da assembleia...",
      speakers: [
        {
          speaker: "A",
          text: "Boa tarde a todos. Vamos iniciar nossa assembleia.",
          start_time: 0.0,
          end_time: 5.2,
          confidence: 0.95,
        },
      ],
      highlights: [
        {
          text: "aprovação da ata",
          start_time: 30.5,
          end_time: 35.0,
          sentiment: "neutral",
        },
      ],
      entities: [
        {
          text: "João Silva",
          entity_type: "PERSON",
          start_time: 120.0,
          confidence: 0.89,
        },
      ],
      sentiment_analysis: {
        overall: "positive",
        by_speaker: {
          A: "neutral",
          B: "positive",
        },
      },
      confidence: 0.91,
    };
  }

  /**
   * Busca gravação no banco
   */
  private async getRecordingFromDatabase(recordingId: string, companyId: string): Promise<any> {
    // Simular busca
    return {
      id: recordingId,
      company_id: companyId,
      status: "completed",
      progress: 100,
      transcription_status: "completed",
      transcription_id: `trans_${recordingId}`,
      processing_time: 900,
      error: null,
    };
  }
}

import OpenAI from "openai";
import { getSupabaseServiceClient, createSignedUrl } from "../utils/supabaseClient.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import type {
  GenerateDocumentRequest,
  GenerateDocumentResponse,
  TranscribeAudioRequest,
  TranscribeAudioResponse,
  SummarizeMinuteRequest,
  SummarizeMinuteResponse,
  RequestContext,
} from "../types/ai.js";
import { RAGService } from "./ragService.js";
import { createDatabaseAdapter } from "./databaseAdapter.js";

/**
 * Serviço para geração de documentos, transcrição de áudio e atas
 * Usa Gemini 2.5 Pro para transcrição e GPT-5 para geração de documentos
 */
export class DocumentService {
  private openaiRouter: OpenAI; // Para GPT-5 via OpenRouter
  private openaiDirect?: OpenAI; // Para TTS (Text-to-Speech) direto
  private ragService: RAGService;
  private supabase = getSupabaseServiceClient();

  constructor() {
    // OpenRouter para modelos de chat (GPT-5, Gemini)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    this.openaiRouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      defaultHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "CondoGov AdminAssistant",
      },
    });

    // OpenAI direto para TTS (Text-to-Speech)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      this.openaiDirect = new OpenAI({
        apiKey: openaiKey,
      });
    }

    // RAG Service para contexto
    const databaseAdapter = createDatabaseAdapter();
    this.ragService = new RAGService(databaseAdapter);
  }

  /**
   * Gera documento usando IA com contexto RAG
   */
  async generateDocument(
    request: GenerateDocumentRequest,
    context: RequestContext
  ): Promise<GenerateDocumentResponse> {
    try {
      // 1. Buscar conhecimento relevante usando RAG (tolerante a erro de embeddings)
      let ragResult: { citations: any[] } = { citations: [] } as any;
      try {
        ragResult = await this.ragService.retrieveKnowledge(
          request.prompt,
          {
            ...context,
            contextMode: "sector",
            sector: request.metadata.sector,
          }
        );
      } catch (e) {
        console.warn("RAG unavailable for document generation, proceeding without citations", e instanceof Error ? e.message : e);
        ragResult = { citations: [] } as any;
      }

      // 2. Montar prompt enriquecido para geração de documento
      const systemPrompt = this.buildDocumentSystemPrompt(request, ragResult.citations);
      const userPrompt = this.buildDocumentUserPrompt(request, ragResult.citations);

      // 3. Chamar GPT-5 para geração
      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content generated");
      }

      // 4. Extrair título
      const title = this.extractTitleFromContent(content) || "Documento Gerado por IA";

      // 5. Gerar arquivo (simulado por enquanto)
      const fileResult = await this.generateFile(content, request.documentType, title, context.companyId);

      // 6. Salvar no banco via MCP
      const documentId = await this.saveDocument({
        companyId: context.companyId,
        title,
        content,
        fileUrl: fileResult.url,
        fileName: fileResult.fileName,
        fileSize: fileResult.size,
        documentType: request.documentType,
        metadata: request.metadata,
        createdBy: context.userId,
        usage: completion.usage,
      });

      return {
        documentId,
        title,
        content,
        fileUrl: fileResult.url,
        fileName: fileResult.fileName,
        fileSize: fileResult.size,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        citations: ragResult.citations,
      };
    } catch (error) {
      console.error("Error generating document:", error);
      throw new Error(
        `Failed to generate document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Transcreve áudio usando Gemini 2.5 Pro (melhor para áudio)
   */
  async transcribeAudio(
    request: TranscribeAudioRequest,
    audioBuffer: Buffer,
    fileName: string,
    context: RequestContext,
    originalUrl?: string, // URL original para detectar formato
  ): Promise<TranscribeAudioResponse> {
    try {
      console.log("[DocumentService] Iniciando transcrição de áudio");
      console.log("[DocumentService] Nome do arquivo:", fileName);
      console.log("[DocumentService] URL original:", originalUrl || "N/A");
      console.log("[DocumentService] Tamanho do buffer:", audioBuffer.length, "bytes");
      console.log("[DocumentService] Idioma solicitado:", request.options.language);
      console.log("[DocumentService] Company ID:", context.companyId);
      console.log("[DocumentService] User ID:", context.userId);

      // 0.5. Se for vídeo grande, tentar extrair apenas o áudio (opcional, reduz tamanho)
      let finalBuffer = audioBuffer;
      let finalFileName = fileName;
      const fileSizeMB = audioBuffer.length / (1024 * 1024);
      const isVideoFile = /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v)$/i.test(fileName);
      
      // Sempre tentar extrair áudio de vídeos para reduzir tamanho (especialmente se > 10MB)
      if (isVideoFile && fileSizeMB > 10) {
        console.log("[DocumentService] Vídeo detectado, tentando extrair áudio para reduzir tamanho...");
        try {
          const extractedAudio = await this.extractAudioFromVideo(audioBuffer, fileName);
          if (extractedAudio && extractedAudio.length < audioBuffer.length) {
            finalBuffer = extractedAudio;
            finalFileName = fileName.replace(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v)$/i, '.mp3');
            const newSizeMB = finalBuffer.length / (1024 * 1024);
            console.log(`[DocumentService] ✅ Áudio extraído: ${fileSizeMB.toFixed(2)} MB -> ${newSizeMB.toFixed(2)} MB (redução de ${((1 - finalBuffer.length / audioBuffer.length) * 100).toFixed(1)}%)`);
          } else {
            console.log("[DocumentService] Não foi possível extrair áudio, usando vídeo original");
          }
        } catch (error) {
          console.warn("[DocumentService] Erro ao extrair áudio (continuando com vídeo original):", error);
          // Continuar com o vídeo original se a extração falhar
        }
      }

      // 1. Upload arquivo (áudio ou vídeo) para Supabase Storage
      console.log("[DocumentService] Fazendo upload do arquivo para Supabase Storage...");
      const uploadResult = await this.uploadAudioToStorage(finalBuffer, finalFileName, context.companyId);
      const audioUrl = uploadResult.url;
      const storageBucket = uploadResult.bucket;
      const storagePath = uploadResult.path;
      console.log("[DocumentService] Upload concluído, URL:", audioUrl);

      // 2. Transcrição usando Gemini 2.5 Pro
      // IMPORTANTE: Tudo é tratado como áudio (vídeos são processados como áudio também)
      console.log("[DocumentService] Iniciando transcrição com Gemini...");
      
      let transcription: any;
      try {
        // Sempre passar o buffer e tratar como áudio
        // Vídeos também são processados como áudio (Gemini extrai o áudio automaticamente)
        transcription = await this.transcribeWithGemini(
          audioUrl,
          request.options.language,
          finalBuffer, // Usar buffer final (pode ser áudio extraído)
          originalUrl || audioUrl // Passar URL original para detecção de formato
        );
      } catch (error) {
        // Se falhar, tentar deletar arquivo antes de relançar erro
        try {
          await this.deleteFileFromStorage(storageBucket, storagePath);
        } catch (deleteError) {
          console.warn("[DocumentService] Erro ao deletar arquivo após falha na transcrição:", deleteError);
        }
        throw error;
      }
      console.log("[DocumentService] Transcrição concluída, tamanho do texto:", transcription.text.length, "caracteres");

      // 3. Análises opcionais com GPT-5
      console.log("[DocumentService] Iniciando análises opcionais...");
      const analysis = await this.analyzeTranscription(
        transcription.text,
        request.options,
        context
      );
      console.log("[DocumentService] Análises concluídas:", Object.keys(analysis));

      // 4. Identificação de speakers (se solicitada)
      const speakers = request.options.speakerIdentification
        ? await this.identifySpeakers(transcription.text, transcription.segments)
        : undefined;
      if (speakers) {
        console.log("[DocumentService] Speakers identificados:", speakers.length);
      }

      // 5. Salvar processamento no banco
      console.log("[DocumentService] Salvando processamento no banco...");
      const processingId = await this.saveAudioProcessing({
        companyId: context.companyId,
        meetingId: request.meetingId,
        audioFileName: fileName,
        audioSizeBytes: audioBuffer.length,
        audioUrl,
        transcription,
        speakers,
        analysis,
        options: request.options,
        createdBy: context.userId,
      });
      console.log("[DocumentService] Processamento salvo com ID:", processingId);

      // 6. Processar conforme o tipo de transcrição solicitado
      const transcriptionType = request.transcriptionType || "audio";
      console.log("[DocumentService] Tipo de transcrição:", transcriptionType);

      let summary: any = undefined;
      let minutes: any = undefined;
      let summaryTokens = 0;
      let minutesTokens = 0;

      // Gerar resumo se solicitado
      if (transcriptionType === "audio_summary" || transcriptionType === "audio_summary_minutes") {
        console.log("[DocumentService] Gerando resumo...");
        const summaryResult = await this.generateSummaryFromTranscription(
          transcription.text,
          request.summaryOptions || {},
          context
        );
        summary = summaryResult.summary;
        summaryTokens = summaryResult.usage.totalTokens;
        console.log("[DocumentService] Resumo gerado, tokens:", summaryTokens);
      }

      // Gerar ata se solicitado
      if (transcriptionType === "audio_minutes" || transcriptionType === "audio_summary_minutes") {
        console.log("[DocumentService] Gerando ata...");
        // Passar também o resumo se disponível para contexto adicional
        const minutesResult = await this.generateMinutesFromTranscription(
          transcription.text,
          summary ? summary.text : undefined, // Passar resumo como contexto adicional
          request.meetingId,
          request.minutesOptions || {},
          context
        );
        minutes = minutesResult.minutes;
        minutesTokens = minutesResult.usage.totalTokens;
        console.log("[DocumentService] Ata gerada, ID:", minutes.minuteId, "tokens:", minutesTokens);
      }

      console.log("[DocumentService] Transcrição finalizada com sucesso");

      // 7. Deletar arquivo do Supabase Storage após processamento bem-sucedido
      try {
        console.log("[DocumentService] Deletando arquivo do storage após processamento...");
        await this.deleteFileFromStorage(storageBucket, storagePath);
        console.log("[DocumentService] Arquivo deletado com sucesso do storage");
      } catch (deleteError) {
        console.warn("[DocumentService] Erro ao deletar arquivo do storage (não crítico):", deleteError);
        // Não relançar erro - o processamento foi bem-sucedido
      }

      return {
        processingId,
        transcription: {
          text: transcription.text,
          confidence: transcription.confidence,
          language: transcription.language,
          duration: transcription.duration,
        },
        speakers,
        analysis,
        summary,
        minutes,
        usage: {
          audioMinutes: Math.ceil(transcription.duration / 60),
          transcriptionTokens: Math.ceil(transcription.text.length / 4),
          analysisTokens: analysis.totalTokens || 0,
          summaryTokens,
          minutesTokens,
          totalTokens: Math.ceil(transcription.text.length / 4) + 
                      (analysis.totalTokens || 0) + 
                      summaryTokens + 
                      minutesTokens,
        },
      };
    } catch (error) {
      console.error("Error transcribing audio:", error);
      console.error("Error type:", typeof error);
      console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Tentar extrair mensagem de objetos de erro
        const err = error as any;
        errorMessage = err.message || err.error?.message || err.toString() || JSON.stringify(error);
      } else if (error !== null && error !== undefined) {
        errorMessage = String(error);
      }
      
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  /**
   * Transcreve áudio usando Gemini 2.5 Pro
   */
  private async transcribeWithGemini(audioUrl: string, language: string, audioBuffer?: Buffer, originalUrl?: string) {
    try {
      console.log("[Transcription] Iniciando transcrição com Gemini 2.5 Pro");
      console.log("[Transcription] Audio URL:", audioUrl);
      console.log("[Transcription] Idioma:", language);
      console.log("[Transcription] Audio buffer disponível:", !!audioBuffer);
      console.log("[Transcription] Tamanho do buffer:", audioBuffer?.length || 0, "bytes");
      
      if (!audioBuffer) {
        console.error("[Transcription] ERRO: Buffer não foi passado para transcribeWithGemini!");
        throw new Error("Buffer de áudio/vídeo é obrigatório para transcrição. O arquivo deve ser enviado no corpo da requisição.");
      }

      // Validar tamanho do arquivo antes de processar
      const fileSizeMB = audioBuffer.length / (1024 * 1024);
      console.log("[Transcription] Tamanho do arquivo:", fileSizeMB.toFixed(2), "MB");
      
      // Detectar se é vídeo antes de validar tamanho
      const urlToCheck = originalUrl || audioUrl;
      let isVideoFile = false;
      try {
        const urlObj = new URL(urlToCheck);
        const pathMatch = urlObj.pathname.toLowerCase().match(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v)$/);
        isVideoFile = !!pathMatch;
      } catch (e) {
        // Ignorar erro de parsing
      }
      
      // Limite mais realista: 50MB para vídeo, 30MB para áudio
      // Vídeos podem ser maiores porque extraímos apenas o áudio
      const maxSizeMB = isVideoFile ? 50 : 30;
      
      if (fileSizeMB > maxSizeMB) {
        console.warn(`[Transcription] Arquivo grande (${fileSizeMB.toFixed(2)} MB), mas tentando processar mesmo assim...`);
        // Não bloquear, apenas avisar - o OpenRouter vai retornar erro se não conseguir
      } else {
        console.log(`[Transcription] Tamanho do arquivo dentro do limite (${maxSizeMB} MB)`);
      }

      // Converter buffer para base64
      const audioBase64 = audioBuffer.toString('base64');
      const base64SizeMB = (audioBase64.length * 3) / 4 / (1024 * 1024); // Aproximação do tamanho real
      console.log("[Transcription] Convertendo arquivo para base64, tamanho base64:", audioBase64.length, "caracteres");
      console.log("[Transcription] Tamanho aproximado do base64:", base64SizeMB.toFixed(2), "MB");
      
      // Detectar formato do arquivo pela URL original ou atual
      const urlForExtensionDetection = originalUrl || audioUrl;
      let detectedExtension = '';
      
      try {
        // Tentar extrair extensão da URL original (pode estar em query params)
        if (originalUrl) {
          const urlObj = new URL(originalUrl);
          const searchParams = urlObj.searchParams;
          const filenameFromParams = searchParams.get('response-content-disposition');
          
          if (filenameFromParams) {
            const match = filenameFromParams.match(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|mp3|wav|m4a|ogg|flac|aac)$/i);
            if (match && match[1]) detectedExtension = match[1].toLowerCase();
          }
          
          // Se não encontrou, tentar pelo pathname
          if (!detectedExtension) {
            const pathMatch = urlObj.pathname.toLowerCase().match(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|mp3|wav|m4a|ogg|flac|aac)$/);
            if (pathMatch && pathMatch[1]) detectedExtension = pathMatch[1].toLowerCase();
          }
        }
        
        // Se ainda não encontrou, tentar pela URL do Supabase
        if (!detectedExtension) {
          const urlObj = new URL(audioUrl);
          const pathMatch = urlObj.pathname.toLowerCase().match(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|mp3|wav|m4a|ogg|flac|aac)$/);
          if (pathMatch && pathMatch[1]) detectedExtension = pathMatch[1].toLowerCase();
        }
      } catch (e) {
        console.warn("[Transcription] Erro ao parsear URL para detectar extensão:", e);
      }
      
      // Detectar se é vídeo ou áudio
      const isVideo = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(detectedExtension);
      const isAudio = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(detectedExtension);
      
      console.log(`[Transcription] Extensão detectada: ${detectedExtension || 'desconhecida'}, é vídeo: ${isVideo}, é áudio: ${isAudio}`);
      
      // Para vídeo: usar video_url com URL do Supabase (mais eficiente, não aumenta tamanho)
      // Para áudio: usar input_audio com base64
      let audioContent: any;
      
      if (isVideo) {
        // Vídeo: usar video_url com URL do Supabase Storage
        // Isso evita aumentar o tamanho do payload com base64
        console.log("[Transcription] Arquivo é VÍDEO - usando video_url com URL do Supabase");
        console.log("[Transcription] URL completa:", audioUrl);
        console.log("[Transcription] URL length:", audioUrl.length, "caracteres");
        
        audioContent = {
          type: "video_url",
          video_url: {
            url: audioUrl
          }
        };
        
        console.log("[Transcription] audioContent preparado:", JSON.stringify(audioContent, null, 2));
      } else if (isAudio) {
        // Áudio: usar input_audio com base64
        const audioFormat = detectedExtension === 'mp3' ? 'mp3' : 
                           detectedExtension === 'm4a' ? 'm4a' :
                           detectedExtension === 'ogg' ? 'ogg' :
                           detectedExtension === 'flac' ? 'flac' :
                           detectedExtension === 'aac' ? 'aac' : 'wav';
        console.log("[Transcription] Arquivo é ÁUDIO - usando input_audio com formato:", audioFormat);
        audioContent = {
          type: "input_audio",
          input_audio: {
            data: audioBase64,
            format: audioFormat
          }
        };
      } else {
        // Formato desconhecido: tentar como vídeo primeiro (mais comum)
        console.log("[Transcription] Formato desconhecido, tentando como vídeo com video_url");
        audioContent = {
          type: "video_url",
          video_url: {
            url: audioUrl
          }
        };
      }

      console.log("[Transcription] Enviando requisição para Gemini via OpenRouter...");
      if (isVideo) {
        console.log("[Transcription] Tipo de conteúdo: video_url (URL do Supabase)");
      } else {
        console.log("[Transcription] Tamanho do payload base64:", (audioBase64.length / 1024).toFixed(2), "KB");
        console.log("[Transcription] Tipo de conteúdo: input_audio");
      }
      const startTime = Date.now();

      // Preparar mensagem conforme exemplo do OpenRouter (sem system message, apenas user)
      // Para vídeo: prompt MUITO simples (como no chat do Gemini que funcionou: "transcreva esse video")
      // Para áudio: prompt mais detalhado
      const promptText = isVideo 
        ? "Transcreva esse vídeo"
        : `Você é um transcritor profissional. Sua única tarefa é transcrever EXATAMENTE o que você ouve neste áudio.

REGRAS CRÍTICAS:
1. Transcreva APENAS o que está realmente sendo dito no áudio
2. NÃO invente, NÃO adicione informações que não estão no áudio
3. NÃO faça interpretações ou resumos
4. Se não entender algo, use [inaudível] ou [ruído]
5. Mantenha a ordem cronológica das falas
6. Use QUEBRAS DE LINHA para separar parágrafos
7. Crie parágrafos quando houver mudança de assunto ou pausa natural
8. Se houver múltiplos falantes, identifique cada um e use quebras de linha entre falas
9. Mantenha espaçamento adequado (duas quebras de linha entre parágrafos)
10. Use pontuação correta

IMPORTANTE: Retorne APENAS a transcrição literal do áudio, sem adicionar informações externas, sem inventar conteúdo, sem fazer interpretações. Transcreva EXATAMENTE o que você ouve.`;
      
      const messages: any[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
            audioContent,
          ],
        },
      ];
      
      // Log completo da mensagem para debug
      console.log("[Transcription] Mensagem completa preparada:", JSON.stringify(messages, null, 2));

      // Calcular tamanhos para debug
      const messageSizeKB = JSON.stringify(messages).length / 1024;
      const totalSizeMB = messageSizeKB / 1024;
      
      console.log("[Transcription] Mensagem completa (primeiros 500 chars):", JSON.stringify(messages).substring(0, 500));
      console.log("[Transcription] Tamanho total da mensagem:", messageSizeKB.toFixed(2), "KB (", totalSizeMB.toFixed(2), "MB)");
      console.log("[Transcription] Tamanho do arquivo original:", (audioBuffer.length / (1024 * 1024)).toFixed(2), "MB");
      
      if (isVideo) {
        console.log("[Transcription] Usando video_url - payload pequeno (apenas URL, não base64)");
      } else {
        const base64SizeKB = audioBase64.length / 1024;
        console.log("[Transcription] Tamanho do base64 no payload:", base64SizeKB.toFixed(2), "KB");
        
        // Verificar se o payload é muito grande (>20MB pode causar erro 500)
        if (totalSizeMB > 20) {
          console.warn(`[Transcription] AVISO: Payload muito grande (${totalSizeMB.toFixed(2)} MB). OpenRouter pode rejeitar.`);
          console.warn(`[Transcription] Considere usar um arquivo menor ou extrair apenas o áudio do vídeo.`);
        }
      }

      // Usar Gemini 2.5 Pro para transcrição via OpenRouter
      // Sempre usar 2.5-pro (modelos flash podem não estar disponíveis)
      const modelToUse = "google/gemini-2.5-pro";
      console.log("[Transcription] Enviando requisição para OpenRouter com modelo:", modelToUse);
      
      // Se o arquivo for muito grande, avisar mas tentar mesmo assim
      if (totalSizeMB > 15) {
        console.warn(`[Transcription] Arquivo grande (${totalSizeMB.toFixed(2)} MB) - OpenRouter pode ter problemas. Tentando mesmo assim...`);
      }
      
      // Preparar payload completo para log
      const requestPayload = {
        model: modelToUse,
        messages: messages,
        temperature: 0.1,
      };
      
      console.log("[Transcription] Payload completo que será enviado:", JSON.stringify(requestPayload, null, 2));
      
      let completion;
      try {
        completion = await this.openaiRouter.chat.completions.create(requestPayload);
      } catch (requestError: any) {
        console.error("[Transcription] Erro na requisição para OpenRouter:", {
          message: requestError?.message,
          status: requestError?.status,
          code: requestError?.code,
          response: requestError?.response,
          stack: requestError?.stack,
        });
        
        // Se o erro for 500, pode ser arquivo muito grande ou problema temporário
        if (requestError?.status === 500) {
          console.error(`[Transcription] Erro 500 do OpenRouter. Possíveis causas:`);
          console.error(`[Transcription] - Arquivo muito grande (${totalSizeMB.toFixed(2)} MB)`);
          console.error(`[Transcription] - Payload muito grande (${messageSizeKB.toFixed(2)} KB)`);
          console.error(`[Transcription] - Problema temporário do OpenRouter`);
          console.error(`[Transcription] - Formato não suportado (vídeo como input_audio)`);
        }
        
        throw requestError;
      }

      const elapsedTime = Date.now() - startTime;
      console.log("[Transcription] Resposta recebida em", elapsedTime, "ms");
      console.log("[Transcription] Modelo usado:", completion.model || "N/A");
      console.log("[Transcription] Tokens usados:", completion.usage?.total_tokens || "N/A");
      
      // Log completo da resposta para debug
      console.log("[Transcription] Resposta completa do OpenRouter:", JSON.stringify(completion, null, 2));
      console.log("[Transcription] Estrutura da resposta:", {
        hasChoices: !!completion.choices,
        choicesLength: completion.choices?.length || 0,
        responseKeys: Object.keys(completion),
        hasError: !!(completion as any).error,
        errorDetails: (completion as any).error || null,
      });

      // Verificar se a resposta tem a estrutura esperada
      if (!completion.choices || completion.choices.length === 0) {
        console.error("[Transcription] Resposta do Gemini não contém choices");
        console.error("[Transcription] Resposta completa:", JSON.stringify(completion, null, 2));
        
        // Verificar se há erro na resposta do OpenRouter
        if ((completion as any).error) {
          const error = (completion as any).error;
          const errorMessage = error.message || "Erro desconhecido do OpenRouter";
          const errorCode = error.code || "unknown";
          console.error("[Transcription] Erro do OpenRouter detectado:", {
            code: errorCode,
            message: errorMessage,
            fullError: error,
          });
          throw new Error(`Erro do OpenRouter: ${errorMessage} (Código: ${errorCode})`);
        }
        
        console.error("[Transcription] Resposta não contém choices nem error - formato inesperado");
        throw new Error("Resposta do Gemini não contém choices. A resposta pode estar em formato diferente.");
      }
      
      // Log detalhado dos choices
      console.log("[Transcription] Choices encontrados:", completion.choices.length);
      completion.choices.forEach((choice, index) => {
        console.log(`[Transcription] Choice ${index}:`, {
          index: choice.index,
          finishReason: choice.finish_reason,
          messageRole: choice.message?.role,
          messageContentLength: choice.message?.content?.length || 0,
          messageContentPreview: choice.message?.content?.substring(0, 200) || "N/A",
        });
      });

      let text = completion.choices[0]?.message?.content || "";
      if (!text) {
        console.error("[Transcription] Texto vazio na resposta:", JSON.stringify(completion.choices[0], null, 2));
        throw new Error("Resposta do Gemini não contém texto transcrito.");
      }
      
      console.log("[Transcription] Texto bruto recebido, tamanho:", text.length, "caracteres");
      console.log("[Transcription] Primeiros 200 caracteres:", text.substring(0, 200));
      
      // Limpar texto removendo explicações mas PRESERVANDO parágrafos e quebras de linha
      const originalLength = text.length;
      text = this.cleanTranscriptionText(text);
      
      // Garantir que parágrafos estejam bem formatados com quebras de linha adequadas
      text = this.formatTranscriptionParagraphs(text);
      
      console.log("[Transcription] Texto após limpeza e formatação, tamanho:", text.length, "caracteres");
      console.log("[Transcription] Caracteres removidos:", originalLength - text.length);
      console.log("[Transcription] Primeiros 200 caracteres após formatação:", text.substring(0, 200));
      
      return {
        text,
        confidence: 0.95, // Gemini geralmente tem alta confiança
        language: language,
        duration: 0, // Gemini não retorna duração diretamente
        segments: this.parseTextIntoSegments(text),
      };
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || "Unknown error";
      const errorCode = error?.status || error?.code || error?.error?.code;
      
      console.error(`[Transcription] Gemini transcription failed (${errorCode || 'unknown'}): ${errorMessage}`);
      console.error(`[Transcription] Stack trace:`, error?.stack);
      
      // Retornar erro diretamente, sem fallback
      if (errorCode === 401) {
        throw new Error(
          `Autenticação falhou ao usar Gemini via OpenRouter. ` +
          `Verifique se OPENROUTER_API_KEY está configurada e válida. ` +
          `Erro original: ${errorMessage}`
        );
      }
      
      // Erro 500 do OpenRouter geralmente indica problema com o arquivo (muito grande, formato inválido, etc)
      if (errorCode === 500) {
        const fileSizeMB = audioBuffer ? (audioBuffer.length / (1024 * 1024)).toFixed(2) : "desconhecido";
        throw new Error(
          `Erro interno do OpenRouter ao processar o arquivo (${fileSizeMB} MB). ` +
          `Possíveis causas: arquivo muito grande, formato não suportado, ou problema temporário do serviço. ` +
          `Tente novamente ou use um arquivo menor/comprimido. ` +
          `Erro original: ${errorMessage}`
        );
      }
      
      throw new Error(
        `Falha na transcrição com Gemini: ${errorMessage} ` +
        `(Código: ${errorCode || 'unknown'}). ` +
        `Verifique se OPENROUTER_API_KEY está configurada corretamente.`
      );
    }
  }

  /**
   * Analisa transcrição com GPT-5 para extrair informações
   */
  private async analyzeTranscription(
    text: string,
    options: TranscribeAudioRequest["options"],
    context: RequestContext
  ) {
    try {
      console.log("[Analysis] Iniciando análise de transcrição");
      console.log("[Analysis] Tamanho do texto:", text.length, "caracteres");
      console.log("[Analysis] Opções ativas:", {
        actionItemExtraction: options.actionItemExtraction,
        keyPointsExtraction: options.keyPointsExtraction,
        agendaGeneration: options.agendaGeneration,
        sentimentAnalysis: options.sentimentAnalysis,
      });

      if (!options.actionItemExtraction && !options.keyPointsExtraction && 
          !options.agendaGeneration && !options.sentimentAnalysis) {
        console.log("[Analysis] Nenhuma análise solicitada, retornando vazio");
        return {};
      }

      const analysisPrompts = [];
      
      if (options.actionItemExtraction) {
        analysisPrompts.push("- Extraia todas as ações, tarefas e responsabilidades mencionadas, com responsáveis e prazos quando identificáveis");
      }
      
      if (options.keyPointsExtraction) {
        analysisPrompts.push("- Liste os pontos principais, decisões importantes e conclusões da reunião");
      }
      
      if (options.agendaGeneration) {
        analysisPrompts.push("- Gere uma pauta estruturada baseada nos tópicos efetivamente discutidos");
      }

      if (options.sentimentAnalysis) {
        analysisPrompts.push("- Analise o sentimento geral e por tópicos principais");
      }

      const prompt = `Analise a seguinte transcrição de reunião:

"${text}"

Tarefas solicitadas:
${analysisPrompts.join('\n')}

Responda em JSON estruturado com as chaves:
{
  "actionItems": [{"description": "...", "assignee": "...", "dueDate": "...", "priority": "high|medium|low"}],
  "keyPoints": ["ponto 1", "ponto 2", ...],
  "agenda": [{"title": "...", "description": "...", "presenter": "..."}],
  "sentiment": {
    "overall": "positive|neutral|negative",
    "byTopic": [{"topic": "...", "sentiment": "...", "confidence": 0.8}]
  }
}`;

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em análise de reuniões e atas. 
            Analise transcrições e extraia informações estruturadas com precisão.
            Contexto: Empresa ${context.companyId}, Usuário ${context.userId}`,
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const analysisResult = JSON.parse(completion.choices[0]?.message?.content || "{}");
      
      return {
        ...analysisResult,
        totalTokens: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      console.error("Error analyzing transcription:", error);
      return {};
    }
  }

  /**
   * Resumo inteligente de ata
   */
  async summarizeMinute(
    request: SummarizeMinuteRequest,
    context: RequestContext
  ): Promise<SummarizeMinuteResponse> {
    try {
      // 1. Buscar ata no banco (simulado)
      const minute = await this.getMinuteFromDatabase(request.minuteId, context.companyId);
      
      if (!minute) {
        throw new Error("Ata não encontrada");
      }

      // 2. Buscar contexto RAG
      const ragResult = await this.ragService.retrieveKnowledge(
        `resumo ata reunião ${minute.title}`,
        {
          ...context,
          contextMode: "sector",
          sector: "Reuniões CondoGov",
        }
      );

      // 3. Prompt baseado no tipo de resumo
      const systemPrompt = this.buildSummarySystemPrompt(request.summaryType, ragResult.citations);
      const userPrompt = this.buildSummaryUserPrompt(minute, request.summaryType);

      // 4. Gerar resumo com GPT-5
      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const summary = JSON.parse(completion.choices[0]?.message?.content || "{}");

      return {
        summary: summary.summary || "",
        highlights: summary.highlights || [],
        actionItems: summary.actionItems || [],
        decisions: summary.decisions || [],
        nextSteps: summary.nextSteps || [],
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("Error summarizing minute:", error);
      throw new Error(
        `Failed to summarize minute: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Upload de áudio para Supabase Storage
   */
  private async uploadAudioToStorage(
    audioBuffer: Buffer,
    fileName: string,
    companyId: string
  ): Promise<{ url: string; bucket: string; path: string }> {
    try {
      const objectPath = `${companyId}/${fileName}`;
      
      // Detectar content type baseado na extensão do arquivo
      const extension = fileName.toLowerCase().split('.').pop() || '';
      let contentType = "audio/wav";
      if (extension === 'mp4' || extension === 'm4v') {
        contentType = "video/mp4";
      } else if (extension === 'webm') {
        contentType = "video/webm";
      } else if (extension === 'mp3') {
        contentType = "audio/mpeg";
      } else if (extension === 'm4a') {
        contentType = "audio/mp4";
      } else if (extension === 'ogg') {
        contentType = "audio/ogg";
      } else if (extension === 'flac') {
        contentType = "audio/flac";
      } else if (extension === 'aac') {
        contentType = "audio/aac";
      }
      
      const blob = new Blob([audioBuffer], { type: contentType });
      let bucket = "audio-recordings";
      let uploadError: any = null;
      {
        const res = await this.supabase.storage
          .from(bucket)
          .upload(objectPath, blob, { upsert: true, contentType });
        uploadError = res.error || null;
      }
      if (uploadError) {
        throw uploadError;
      }

      const signedUrl = await createSignedUrl(bucket, objectPath, 60 * 60);
      return { url: signedUrl, bucket, path: objectPath };
    } catch (error) {
      console.error("Error uploading audio:", error);
      throw error;
    }
  }

  /**
   * Deleta arquivo do Supabase Storage
   */
  private async deleteFileFromStorage(bucket: string, path: string): Promise<void> {
    try {
      console.log(`[FileDelete] Deletando arquivo: ${bucket}/${path}`);
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);
      
      if (error) {
        console.error(`[FileDelete] Erro ao deletar arquivo:`, error);
        // Não lançar erro, apenas logar (arquivo pode já ter sido deletado)
      } else {
        console.log(`[FileDelete] Arquivo deletado com sucesso: ${bucket}/${path}`);
      }
    } catch (error) {
      console.error(`[FileDelete] Erro ao deletar arquivo:`, error);
      // Não lançar erro, apenas logar
    }
  }

  /**
   * Gera arquivo PDF ou DOCX
   */
  private async generateFile(
    content: string,
    type: "pdf" | "docx",
    title: string,
    companyId: string
  ): Promise<{ url: string; fileName: string; size: number }> {
    try {
      const bucket = "documents";
      const safeTitle = title.replace(/[^a-zA-Z0-9\-_. ]/g, "-");
      const timestamp = Date.now();
      let fileName = `${safeTitle}-${timestamp}.${type}`;

      let fileBytes: Uint8Array;
      let contentType: string;

      if (type === "pdf") {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;

        const margin = 50;
        const maxWidth = width - margin * 2;
        const safeTitle = sanitizePdfText(title);
        const safeContent = sanitizePdfText(content);
        const lines = wrapText(safeContent, font, fontSize, maxWidth);

        let y = height - margin;
        page.drawText(safeTitle, { x: margin, y, size: 16, font, color: rgb(0, 0, 0.6) });
        y -= 24;

        for (const line of lines) {
          if (y < margin) {
            // nova página
            const newPage = pdfDoc.addPage();
            y = newPage.getSize().height - margin;
          }
          page.drawText(line, { x: margin, y, size: fontSize, font });
          y -= fontSize + 4;
        }

        fileBytes = await pdfDoc.save();
        contentType = "application/pdf";
      } else {
        const paragraphs = content.split(/\r?\n/).map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));
        const doc = new Document({
          sections: [
            {
              properties: {},
              children: [
                new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }),
                ...paragraphs
              ],
            },
          ],
        });
        const buffer = await Packer.toBuffer(doc);
        fileBytes = new Uint8Array(buffer);
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }

      const objectPath = `${companyId}/${fileName}`;
      const { error: uploadError } = await this.supabase.storage
        .from(bucket)
        .upload(objectPath, new Blob([fileBytes], { type: contentType }), { upsert: true, contentType });
      if (uploadError) throw uploadError;

      const signedUrl = await createSignedUrl(bucket, objectPath, 60 * 60 * 24);

      return { url: signedUrl, fileName, size: fileBytes.byteLength };
    } catch (error) {
      console.error("Error generating file:", error);
      throw error;
    }
  }

  /**
   * Salva documento no banco
   */
  private async saveDocument(data: any): Promise<string> {
    try {
      const payload = {
        company_id: data.companyId,
        title: data.title,
        content: data.content,
        file_url: data.fileUrl,
        file_name: data.fileName,
        file_size: data.fileSize,
        // document_type e metadata podem não existir no cache do PostgREST imediatamente
        created_by: data.createdBy,
        usage: data.usage || null,
      };

      const { data: inserted, error } = await this.supabase
        .from("documents")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return inserted?.id as string;
    } catch (error) {
      console.error("Error saving document:", error);
      throw error;
    }
  }

  /**
   * Salva processamento de áudio no banco
   */
  private async saveAudioProcessing(data: any): Promise<string> {
    try {
      const payload = {
        company_id: data.companyId,
        meeting_id: data.meetingId ?? null,
        audio_file_name: data.audioFileName,
        audio_size_bytes: data.audioSizeBytes,
        audio_url: data.audioUrl,
        transcription: data.transcription,
        speakers: data.speakers ?? null,
        analysis: data.analysis ?? null,
        options: data.options ?? null,
        created_by: data.createdBy,
      };

      const { data: inserted, error } = await this.supabase
        .from("audio_processings")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return inserted?.id as string;
    } catch (error) {
      console.error("Error saving audio processing:", error);
      throw error;
    }
  }

  /**
   * Busca ata no banco
   */
  private async getMinuteFromDatabase(minuteId: string, companyId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from("minutes")
      .select("*")
      .eq("id", minuteId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Identificação simples de speakers
   */
  private async identifySpeakers(text: string, segments: any[]): Promise<any[]> {
    // Implementação simplificada
    // Em produção, usar bibliotecas especializadas como pyannote.audio
    
    const speakers = [
      {
        id: "speaker_1",
        name: "Participante 1",
        segments: segments?.slice(0, Math.ceil(segments.length / 2)) || [],
      },
      {
        id: "speaker_2", 
        name: "Participante 2",
        segments: segments?.slice(Math.ceil(segments.length / 2)) || [],
      },
    ];

    return speakers;
  }

  /**
   * Helpers para construção de prompts
   */
  private buildDocumentSystemPrompt(request: GenerateDocumentRequest, citations: any[]): string {
    return `Você é um assistente jurídico especializado em documentos corporativos para gestão condominial.

CONTEXTO:
- Tipo de documento: ${request.documentType.toUpperCase()}
- Setor: ${request.metadata.sector}
- Categoria: ${request.metadata.category}
- Tags: ${request.metadata.tags.join(", ")}

CONHECIMENTO RELEVANTE:
${citations.map((c, i) => `${i + 1}. [${c.sector}] ${c.content}`).join('\n')}

INSTRUÇÕES:
- Gere um documento profissional em português brasileiro
- Use linguagem jurídica apropriada quando necessário
- Inclua cabeçalho com título claro
- Organize em seções bem estruturadas
- Deixe campos para preenchimento quando apropriado
- Inclua espaço para assinaturas ao final
- Cite as fontes do conhecimento quando relevante`;
  }

  private buildDocumentUserPrompt(request: GenerateDocumentRequest, citations: any[]): string {
    return `Gere o seguinte documento:

${request.prompt}

Use o conhecimento fornecido no contexto para fundamentar o documento e garantir que esteja alinhado com as práticas da empresa.`;
  }

  private buildSummarySystemPrompt(summaryType: string, citations: any[]): string {
    const typeInstructions = {
      executive: "Crie um resumo executivo conciso focando em decisões e resultados principais",
      detailed: "Crie um resumo detalhado mantendo todas as informações importantes",
      action_items: "Foque apenas nas ações, tarefas e responsabilidades definidas",
      decisions: "Foque apenas nas decisões tomadas e votações realizadas",
    };

    return `Você é um assistente especializado em análise de atas e reuniões.

TIPO DE RESUMO: ${typeInstructions[summaryType as keyof typeof typeInstructions]}

CONHECIMENTO RELEVANTE:
${citations.map((c, i) => `${i + 1}. [${c.sector}] ${c.content}`).join('\n')}

FORMATO DE RESPOSTA JSON:
{
  "summary": "texto do resumo principal",
  "highlights": ["destaque 1", "destaque 2"],
  "actionItems": [{"description": "...", "assignee": "...", "dueDate": "YYYY-MM-DD", "priority": "high|medium|low"}],
  "decisions": [{"item": "...", "decision": "...", "approved": true|false}],
  "nextSteps": ["próximo passo 1", "próximo passo 2"]
}`;
  }

  private buildSummaryUserPrompt(minute: any, summaryType: string): string {
    return `Analise e resuma a seguinte ata de reunião:

INFORMAÇÕES DA REUNIÃO:
- Título: ${minute.title}
- Data: ${minute.meeting_date}
- Participantes: ${JSON.stringify(minute.attendees)}

PAUTA:
${minute.agenda_items.map((item: any, i: number) => `${i + 1}. ${item.title}: ${item.description}`).join('\n')}

DECISÕES:
${minute.decisions.map((dec: any, i: number) => `${i + 1}. ${dec.item}: ${dec.decision} (${dec.approved ? 'Aprovado' : 'Rejeitado'})`).join('\n')}

AÇÕES DEFINIDAS:
${minute.action_items.map((action: any, i: number) => `${i + 1}. ${action.description} - Responsável: ${action.assignee} - Prazo: ${action.due_date}`).join('\n')}

CONTEÚDO ADICIONAL:
${minute.content || 'Nenhum conteúdo adicional'}

Gere um resumo do tipo: ${summaryType}`;
  }

  private extractTitleFromContent(content: string): string {
    // Extrair título das primeiras linhas
    const lines = content.split('\n').filter(line => line.trim());
    const firstLine = lines[0]?.trim();
    
    if (firstLine && firstLine.length < 100) {
      return firstLine.replace(/^#+\s*/, ''); // Remover markdown headers
    }
    
    return "Documento Gerado";
  }

  /**
   * Limpa texto de transcrição removendo explicações e formatação desnecessária
   * Mantém formatação útil como identificação de falantes
   */
  private cleanTranscriptionText(text: string): string {
    if (!text) return "";
    
    let cleaned = text;
    
    // Remover introduções comuns do Gemini (linha por linha)
    const introPatterns = [
      /^Com certeza!?\s*/i,
      /^Com certeza\.?\s*/i,
      /^Segue abaixo a transcrição do áudio\.?\s*/i,
      /^Aqui está a transcrição\.?\s*/i,
      /^Transcrição do áudio:\s*/i,
      /^A transcrição é:\s*/i,
      /^Abaixo apresento a transcrição do diálogo que ocorre no vídeo:\s*/i,
      /^Transcrição do Vídeo\s*/i,
      /^Transcrição do vídeo\s*/i,
    ];
    
    // Remover seções extras como "Resumo da Cena", "Deseja que eu analise", etc
    cleaned = cleaned.replace(/\n\s*Resumo da Cena\s*\n.*$/is, "");
    cleaned = cleaned.replace(/\n\s*Deseja que eu analise.*$/is, "");
    
    // Remover linhas de separação (asteriscos, traços, etc) que estejam sozinhas
    cleaned = cleaned.replace(/^\s*[\*\-\=]{3,}\s*$/gm, "");
    
    // Remover introduções no início do texto
    for (const pattern of introPatterns) {
      cleaned = cleaned.replace(pattern, "");
    }
    
    // Remover timestamps como [00:15], [00:26], etc (mas manter o texto após)
    cleaned = cleaned.replace(/\[(\d{2}):(\d{2})\]\s*/g, "");
    
    // Remover explicações entre parênteses ou colchetes no início de linhas
    cleaned = cleaned.replace(/^(\s*[\[\(].*?[\]\)]\s*\n?)+/gm, "");
    
    // Remover linhas vazias excessivas no início (máximo 1)
    cleaned = cleaned.replace(/^(\s*\n){2,}/, "\n");
    
    // PRESERVAR parágrafos: normalizar quebras de linha múltiplas
    // Manter até 2 quebras consecutivas (para separar parágrafos)
    cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n"); // Máximo 3 quebras
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Máximo 2 quebras entre parágrafos
    
    // Garantir que parágrafos tenham quebra de linha dupla
    // Se houver ponto final seguido de espaço e letra maiúscula, adicionar quebra
    cleaned = cleaned.replace(/([.!?])\s+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ])/g, "$1\n\n$2");
    
    // Garantir quebra de linha após identificação de falantes
    cleaned = cleaned.replace(/(\*\*[^*]+\*\*:)\s*([A-Z])/g, "$1\n$2");
    cleaned = cleaned.replace(/([A-Z][^:]+:)\s*([A-Z])/g, "$1\n$2");
    
    // Remover espaços em branco no início e fim, mas manter quebras de linha internas
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  /**
   * Formata parágrafos na transcrição garantindo quebras de linha adequadas
   */
  private formatTranscriptionParagraphs(text: string): string {
    let formatted = text;
    
    // Garantir quebra de linha após identificação de falantes
    formatted = formatted.replace(/(\*\*[^*]+\*\*:)\s*([A-Z])/g, "$1\n$2");
    formatted = formatted.replace(/([A-Z][^:]+:)\s*([A-Z])/g, "$1\n$2");
    
    // Adicionar quebra de linha dupla após pontos finais quando apropriado
    // Mas não se já houver quebra de linha
    formatted = formatted.replace(/([.!?])\s+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][a-záéíóúàèìòùâêîôûãõç])/g, "$1\n\n$2");
    
    // Normalizar quebras de linha múltiplas (máximo 2 consecutivas)
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    
    return formatted;
  }

  /**
   * Formata conteúdo de ata garantindo quebras de linha e parágrafos adequados
   */
  private formatMinutesContent(content: string): string {
    let formatted = content;
    
    // Remover espaçamentos excessivos e formatação markdown problemática
    // Remover linhas com apenas espaços, asteriscos ou hífens
    formatted = formatted.replace(/^[\s\-\*]+\n/gm, '');
    
    // Remover padrões como "**Data:\n*" ou "**Hora:\n*"
    formatted = formatted.replace(/\*\*([^*]+):\s*\n\s*\*/g, '**$1:**');
    
    // Remover linhas com apenas "--" ou "-"
    formatted = formatted.replace(/^[\s\-]+\n/gm, '');
    
    // Normalizar quebras de linha múltiplas (máximo 2 consecutivas)
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    
    // Garantir que títulos de seções tenham quebra de linha antes
    formatted = formatted.replace(/([^\n])(##\s+)/g, "$1\n\n$2");
    
    // Garantir quebra de linha após títulos de seções
    formatted = formatted.replace(/(##\s+[^\n]+)\n([^\n])/g, "$1\n\n$2");
    
    // Limpar formatação markdown excessiva em títulos
    formatted = formatted.replace(/\*\*([^*]+)\*\*\s*\n\s*\*/g, '**$1**');
    
    // Remover espaços em branco no início e fim de linhas
    formatted = formatted.split('\n').map(line => line.trim()).join('\n');
    
    // Normalizar novamente quebras de linha múltiplas após limpeza
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    
    // Remover espaços em branco no início e fim
    formatted = formatted.trim();
    
    return formatted;
  }

  private parseTextIntoSegments(text: string): any[] {
    // Quebrar texto em segmentos simulados
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const segmentDuration = 5; // 5 segundos por segmento
    
    return sentences.map((sentence, index) => ({
      start: index * segmentDuration,
      end: (index + 1) * segmentDuration,
      text: sentence.trim(),
    }));
  }

  /**
   * Gera resumo a partir da transcrição
   */
  private async generateSummaryFromTranscription(
    transcriptionText: string,
    options: {
      summaryType?: "executive" | "detailed" | "action_items" | "decisions";
      maxLength?: number;
      includeMetrics?: boolean;
    },
    context: RequestContext
  ): Promise<{ summary: any; usage: { totalTokens: number } }> {
    try {
      console.log("[Summary] Gerando resumo da transcrição");
      console.log("[Summary] Tipo:", options.summaryType || "executive");
      console.log("[Summary] Tamanho máximo:", options.maxLength || 500);

      const typeInstructions = {
        executive: "Crie um resumo executivo CONCISO focando em decisões e resultados principais. Seja direto e objetivo.",
        detailed: "Crie um resumo detalhado mantendo as informações importantes, mas ainda assim resumido (não é uma ata completa).",
        action_items: "Foque APENAS nas ações, tarefas e responsabilidades definidas. Extraia apenas os itens de ação.",
        decisions: "Foque APENAS nas decisões tomadas e votações realizadas. Liste apenas as decisões finais.",
      };

      // Prompt específico para RESUMO (diferente de ATA)
      const systemPrompt = `Você é um assistente especializado em RESUMOS de reuniões.

IMPORTANTE: Você está criando um RESUMO, não uma ata completa. Resumo é conciso, direto e focado nos pontos principais.

TIPO DE RESUMO: ${typeInstructions[options.summaryType || "executive"]}
TAMANHO MÁXIMO: ${options.maxLength || 500} caracteres
${options.includeMetrics ? "INCLUA métricas e estatísticas quando relevante" : ""}

DIFERENÇA ENTRE RESUMO E ATA:
- RESUMO: Conciso, direto, focado em highlights e pontos principais
- ATA: Documento formal completo, detalhado, com todas as seções jurídicas

Você está criando um RESUMO. Seja conciso e objetivo.

FORMATO DE RESPOSTA JSON:
{
  "summary": "texto do resumo principal (CONCISO, máximo ${options.maxLength || 500} caracteres)",
  "highlights": ["destaque 1", "destaque 2", "destaque 3"],
  "actionItems": [{"description": "...", "assignee": "...", "dueDate": "YYYY-MM-DD", "priority": "high|medium|low"}],
  "decisions": [{"item": "...", "decision": "...", "approved": true|false}],
  "nextSteps": ["próximo passo 1", "próximo passo 2"]
}`;

      const userPrompt = `Gere um RESUMO CONCISO da seguinte transcrição de reunião:

"${transcriptionText.substring(0, 15000)}"

IMPORTANTE:
- Gere um RESUMO, não uma ata completa
- Seja conciso e direto
- Foque nos pontos principais
- Máximo de ${options.maxLength || 500} caracteres no campo "summary"`;

      console.log("[Summary] Enviando requisição para gerar resumo...");
      const startTime = Date.now();

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4, // Um pouco mais alto que ata para ser mais flexível
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[Summary] Resumo gerado em", elapsedTime, "ms");
      console.log("[Summary] Tokens usados:", completion.usage?.total_tokens || 0);

      const summary = JSON.parse(completion.choices[0]?.message?.content || "{}");
      console.log("[Summary] Tamanho do resumo:", summary.summary?.length || 0, "caracteres");
      console.log("[Summary] Highlights:", summary.highlights?.length || 0);
      console.log("[Summary] Action items:", summary.actionItems?.length || 0);
      console.log("[Summary] Decisions:", summary.decisions?.length || 0);

      return {
        summary: {
          text: summary.summary || "",
          highlights: summary.highlights || [],
          actionItems: summary.actionItems || [],
          decisions: summary.decisions || [],
          nextSteps: summary.nextSteps || [],
        },
        usage: {
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("[Summary] Erro ao gerar resumo:", error);
      throw error;
    }
  }

  /**
   * Gera ata a partir da transcrição
   * ATA é um documento formal completo, diferente de resumo
   */
  private async generateMinutesFromTranscription(
    transcriptionText: string,
    summaryText: string | undefined,
    meetingId: string | undefined,
    options: {
      format?: "markdown" | "pdf" | "word";
      includeSections?: string[];
      customInstructions?: string;
    },
    context: RequestContext
  ): Promise<{ minutes: any; usage: { totalTokens: number } }> {
    try {
      console.log("[Minutes] Gerando ATA formal da transcrição");
      console.log("[Minutes] Formato:", options.format || "markdown");
      console.log("[Minutes] ATA é diferente de resumo: documento jurídico completo e estruturado");

      const defaultSections = [
        "abertura",
        "participantes",
        "ordem_do_dia",
        "deliberacoes",
        "votacoes",
        "encerramento"
      ];

      const sections = options.includeSections || defaultSections;

      // Prompt MUITO RESTRITIVO para evitar alucinações
      const systemPrompt = `Você é um transcritor especializado em criar ATAS DE ASSEMBLEIA CONDOMINIAL baseadas EXCLUSIVAMENTE em transcrições de áudio/vídeo.

REGRAS CRÍTICAS - LEIA COM ATENÇÃO:
1. Você DEVE usar APENAS o conteúdo fornecido na transcrição
2. NÃO invente, NÃO adicione informações que não estão na transcrição
3. NÃO crie participantes fictícios, datas fictícias, ou assuntos fictícios
4. Se algo não estiver na transcrição, use "[Não mencionado]" ou omita
5. NÃO adicione detalhes que não foram mencionados
6. Se não houver informação sobre data, use a data atual
7. Se não houver informação sobre local, use "[Local não especificado]"
8. Se não houver participantes identificados, use "Participantes conforme transcrição"
9. NÃO invente nomes, unidades, ou funções
10. Mantenha fidelidade ABSOLUTA ao conteúdo transcrito

FORMATO DE SAÍDA: ${options.format || "markdown"}
TIPO DE DOCUMENTO: ATA DE ASSEMBLEIA (documento jurídico formal)

ESTRUTURA OBRIGATÓRIA DA ATA (preencha apenas com o que está na transcrição):
1. CABEÇALHO
   - Título: "ATA DE ASSEMBLEIA"
   - Data: Use data atual se não mencionada na transcrição
   - Hora: Use "[Hora não especificada]" se não mencionada
   - Local: Use "[Local não especificado]" se não mencionado
   - Tipo: Use "Assembleia" se não especificado

2. ABERTURA
   - Declare abertura baseada no que está na transcrição
   - Se não houver menção a quórum, omita ou use "[Quórum não mencionado]"

3. PARTICIPANTES
   - Liste APENAS participantes mencionados na transcrição
   - Se não houver identificação clara, use "Participantes conforme transcrição"
   - NÃO invente nomes ou funções

4. ORDEM DO DIA
   - Liste APENAS assuntos que foram realmente discutidos na transcrição
   - Use as palavras exatas da transcrição quando possível
   - NÃO adicione itens que não foram mencionados

5. DELIBERAÇÕES
   - Registre APENAS discussões que estão na transcrição
   - Use as palavras e argumentos mencionados
   - NÃO invente argumentos ou propostas

6. VOTAÇÕES
   - Registre APENAS votações mencionadas na transcrição
   - Se não houver votação, omita esta seção ou use "[Nenhuma votação registrada]"
   - NÃO invente resultados de votação

7. ENCERRAMENTO
   - Declare encerramento baseado na transcrição
   - Se não houver menção, use formato padrão

FORMATAÇÃO OBRIGATÓRIA:
- Use QUEBRAS DE LINHA (\\n) para separar seções e parágrafos
- Cada seção deve ter uma quebra de linha dupla (\\n\\n) antes do título
- Parágrafos dentro de seções devem ter quebra de linha simples (\\n)
- Use espaçamento adequado entre seções (duas quebras de linha)
- Formate títulos de seções com ## ou ** (markdown)
- Mantenha parágrafos bem separados e legíveis

${options.customInstructions ? `INSTRUÇÕES ESPECIAIS: ${options.customInstructions}` : ''}

LEMBRE-SE: Você está criando um documento jurídico baseado APENAS no que foi realmente dito na transcrição. NÃO invente nada. Se não estiver na transcrição, não coloque na ATA.`;

      // Usar transcrição completa (enviar tudo, sem truncar)
      // Se for muito grande, enviar pelo menos os primeiros 100k caracteres
      const fullTranscription = transcriptionText;
      const maxTranscriptionLength = 100000; // Limite maior para garantir contexto completo
      const transcriptionToUse = fullTranscription.length > maxTranscriptionLength
        ? fullTranscription.substring(0, maxTranscriptionLength) + `\n\n[... transcrição continua - total: ${fullTranscription.length} caracteres ...]`
        : fullTranscription;
      
      console.log(`[Minutes] Tamanho da transcrição: ${fullTranscription.length} caracteres`);
      console.log(`[Minutes] Transcrição a ser usada: ${transcriptionToUse.length} caracteres`);

      let userPrompt = `Crie uma ATA DE ASSEMBLEIA baseada EXCLUSIVAMENTE na seguinte transcrição:

TRANSCRIÇÃO COMPLETA (use APENAS este conteúdo, NÃO invente nada):
"""
${transcriptionToUse}
"""

${summaryText ? `\nRESUMO PARA CONTEXTO ADICIONAL (use apenas para entender melhor, mas baseie-se na transcrição completa):
"""
${summaryText}
"""
` : ''}

INSTRUÇÕES CRÍTICAS:
1. Use APENAS informações que estão na transcrição acima
2. NÃO invente participantes, datas, locais, ou assuntos
3. Se algo não estiver na transcrição, use "[Não mencionado]" ou omita
4. Mantenha fidelidade ABSOLUTA ao conteúdo transcrito
5. Organize o conteúdo em uma ATA formal seguindo a estrutura obrigatória
6. Use linguagem formal e jurídica apropriada
7. Formate conforme ${options.format || "markdown"}

FORMATAÇÃO:
- Use QUEBRAS DE LINHA para separar seções e parágrafos
- Cada seção deve começar com título formatado (## Título)
- Use quebra de linha dupla (\\n\\n) entre seções
- Use quebra de linha simples (\\n) entre parágrafos dentro da mesma seção
- Mantenha espaçamento adequado para legibilidade
- Formate listas e itens de forma clara

IMPORTANTE: Esta ATA será usada como documento oficial. Seja preciso e use APENAS o que está na transcrição. NÃO invente nada.`;

      console.log("[Minutes] Enviando requisição para gerar ATA completa...");
      const startTime = Date.now();

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Muito baixo para evitar alucinações e manter fidelidade
        max_tokens: 8000, // Mais tokens para documento completo baseado na transcrição
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[Minutes] ATA gerada em", elapsedTime, "ms");
      console.log("[Minutes] Tokens usados:", completion.usage?.total_tokens || 0);

      let minutesContent = completion.choices[0]?.message?.content || "";
      
      // Garantir formatação adequada com quebras de linha e parágrafos
      minutesContent = this.formatMinutesContent(minutesContent);
      
      console.log("[Minutes] Tamanho da ATA gerada:", minutesContent.length, "caracteres");

      // Salvar ata no banco
      const minuteId = await this.saveMinute({
        companyId: context.companyId,
        meetingId: meetingId || null,
        title: `Ata de Reunião - ${new Date().toLocaleDateString('pt-BR')}`,
        content: minutesContent,
        format: options.format || "markdown",
        isAutoGenerated: true,
        createdBy: context.userId,
      });

      // Gerar arquivo se necessário (PDF ou Word)
      let fileUrl: string | undefined = undefined;
      if (options.format === "pdf" || options.format === "word") {
        const fileResult = await this.generateFile(
          minutesContent,
          options.format === "pdf" ? "pdf" : "docx",
          `Ata de Reunião - ${new Date().toLocaleDateString('pt-BR')}`,
          context.companyId
        );
        fileUrl = fileResult.url;
      }

      return {
        minutes: {
          minuteId,
          content: minutesContent,
          format: options.format || "markdown",
          fileUrl,
        },
        usage: {
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("[Minutes] Erro ao gerar ata:", error);
      throw error;
    }
  }

  /**
   * Salva ata no banco
   */
  private async saveMinute(data: {
    companyId: string;
    meetingId: string | null;
    title: string;
    content: string;
    format: string;
    isAutoGenerated: boolean;
    createdBy: string;
  }): Promise<string> {
    try {
      console.log("[Minutes] Salvando ata no banco de dados...");
      console.log("[Minutes] Dados para salvar:", {
        companyId: data.companyId,
        meetingId: data.meetingId,
        title: data.title.substring(0, 50) + "...",
        contentLength: data.content.length,
        format: data.format,
        isAutoGenerated: data.isAutoGenerated,
        createdBy: data.createdBy,
      });
      
      // Payload básico com colunas que devem existir
      // A tabela minutes tem apenas: id, company_id, title, meeting_date, attendees, 
      // agenda_items, decisions, action_items, content, created_at
      // NÃO tem: created_by, format, is_auto_generated, meeting_id
      const payload: any = {
        company_id: data.companyId,
        title: data.title,
        content: data.content,
        meeting_date: new Date().toISOString(), // Usar data atual como meeting_date
      };

      // Campos opcionais que existem na tabela
      // meeting_id não existe na tabela, então não incluímos
      
      console.log("[Minutes] Salvando ata com campos:", Object.keys(payload));
      const { data: inserted, error } = await this.supabase
        .from("minutes")
        .insert(payload)
        .select("id")
        .maybeSingle();
      
      if (error) {
        throw error;
      }
      
      if (!inserted?.id) {
        throw new Error("Ata não foi salva - nenhum ID retornado");
      }
      
      console.log("[Minutes] ✅ Ata salva com sucesso! ID:", inserted.id);
      return inserted.id as string;
    } catch (error: any) {
      console.error("[Minutes] Erro ao salvar ata:", error);
      console.error("[Minutes] Detalhes do erro:", {
        code: error?.code,
        message: error?.message,
        hint: error?.hint,
        details: error?.details,
      });
      
      throw error;
    }
  }

  /**
   * Analisa arquivo/imagem/vídeo e gera resumo com título
   */
  async analyzeFile(
    request: {
      fileUrl: string;
      fileType: "image" | "video" | "document" | "audio";
      includeTags: boolean;
      includeDescription: boolean;
      language: string;
    },
    context: RequestContext
  ): Promise<{
    title: string;
    description: string;
    summary: string;
    tags: string[];
    category?: string;
    metadata: {
      fileType: string;
      fileUrl: string;
      analyzedAt: string;
    };
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      console.log("[FileAnalysis] Iniciando análise de arquivo");
      console.log("[FileAnalysis] Tipo:", request.fileType);
      console.log("[FileAnalysis] URL:", request.fileUrl);
      console.log("[FileAnalysis] Idioma:", request.language);

      // Preparar prompt baseado no tipo de arquivo
      const typePrompts = {
        image: `Analise esta imagem em detalhes. Descreva o que você vê, incluindo:
- Objetos, pessoas, lugares visíveis
- Texto presente na imagem (se houver)
- Cores, estilo, qualidade
- Contexto e possível propósito
- Qualquer informação relevante

Gere um título descritivo e conciso para a imagem.`,
        
        video: `Analise este vídeo. Descreva:
- Conteúdo principal do vídeo
- Cenas e ações principais
- Pessoas ou objetos presentes
- Áudio/fala (se houver)
- Duração e qualidade
- Contexto e propósito

Gere um título descritivo e conciso para o vídeo.`,
        
        document: `Analise este documento. Extraia:
- Tipo de documento (contrato, relatório, etc.)
- Título ou assunto principal
- Conteúdo resumido
- Informações importantes
- Data, assinaturas, valores (se houver)
- Contexto e propósito

Gere um título descritivo e conciso para o documento.`,
        
        audio: `Analise este áudio. Descreva:
- Tipo de áudio (música, fala, ruído, etc.)
- Conteúdo principal (se for fala, resuma)
- Qualidade e duração
- Contexto e propósito
- Qualquer informação relevante

Gere um título descritivo e conciso para o áudio.`,
      };

      // Detectar extensão real do arquivo pela URL PRIMEIRO
      const urlPath = request.fileUrl.toLowerCase();
      const extension = urlPath.split('.').pop()?.split('?')[0] || '';
      const actualFileType = this.detectFileTypeFromExtension(extension);
      
      console.log("[FileAnalysis] Tipo solicitado:", request.fileType);
      console.log("[FileAnalysis] Extensão detectada:", extension);
      console.log("[FileAnalysis] Tipo real detectado:", actualFileType);
      
      // Se o tipo solicitado não corresponde ao tipo real, usar o tipo real
      const finalFileType: "image" | "video" | "audio" | "document" = 
        actualFileType !== "unknown" ? actualFileType : request.fileType;

      // Usar o tipo real detectado para o prompt
      const systemPrompt = `Você é um especialista em análise de mídia e documentos.

TAREFA: ${typePrompts[finalFileType]}

REQUISITOS:
- Gere um TÍTULO claro e descritivo (máximo 100 caracteres)
- Crie uma DESCRIÇÃO detalhada mas concisa (200-500 caracteres)
- Gere um RESUMO completo do conteúdo (500-1000 caracteres)
${request.includeTags ? "- Extraia TAGS relevantes (5-10 tags)" : ""}
- Identifique a CATEGORIA quando possível
- Use idioma: ${request.language}

FORMATO DE RESPOSTA JSON:
{
  "title": "Título descritivo",
  "description": "Descrição concisa",
  "summary": "Resumo completo do conteúdo",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "categoria (opcional)"
}`;

      // Preparar conteúdo para análise baseado no tipo real do arquivo
      let content: any[] = [];
      
      if (finalFileType === "image") {
        // Apenas para imagens reais
        if (!['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(extension)) {
          content = [
            {
              type: "text",
              text: `Analise esta imagem e gere um resumo completo com título, descrição, tags e categoria.`,
            },
            {
              type: "image_url",
              image_url: { url: request.fileUrl },
            },
          ];
        } else {
          // Arquivo de texto/documento foi marcado como imagem por engano
          throw new Error(`Arquivo com extensão .${extension} não é uma imagem. Tipo correto: ${actualFileType}`);
        }
      } else if (finalFileType === "video") {
        content = [
          {
            type: "text",
            text: `Analise este vídeo e gere um resumo completo com título, descrição, tags e categoria.`,
          },
          {
            type: "video_url" as any,
            video_url: { url: request.fileUrl },
          },
        ];
      } else if (finalFileType === "audio") {
        // Para áudio, baixar e converter para base64 se possível
        try {
          const audioBuffer = await this.downloadFile(request.fileUrl);
          const audioBase64 = audioBuffer.toString('base64');
          const audioFormat = extension === 'mp3' ? 'mp3' : 
                            extension === 'wav' ? 'wav' : 
                            extension === 'm4a' ? 'm4a' : 'wav';
          
          content = [
            {
              type: "text",
              text: `Analise este áudio e gere um resumo completo com título, descrição, tags e categoria.`,
            },
            {
              type: "input_audio" as any,
              input_audio: {
                data: audioBase64,
                format: audioFormat
              }
            },
          ];
        } catch (error) {
          throw new Error(`Erro ao processar áudio: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      } else {
        // Para documentos de texto, baixar e ler o conteúdo
        try {
          console.log("[FileAnalysis] Baixando documento para extrair texto...");
          const fileBuffer = await this.downloadFile(request.fileUrl);
          let fileText = "";
          
          if (extension === 'txt') {
            // Arquivo de texto simples
            fileText = fileBuffer.toString('utf-8');
          } else if (extension === 'pdf') {
            // Tentar extrair texto do PDF
            try {
              const pdfParse = require('pdf-parse');
              const pdfData = await pdfParse(fileBuffer);
              fileText = pdfData.text;
            } catch (pdfError) {
              throw new Error(`Erro ao extrair texto do PDF: ${pdfError instanceof Error ? pdfError.message : 'Erro desconhecido'}`);
            }
          } else {
            // Para outros documentos, tentar como texto
            fileText = fileBuffer.toString('utf-8');
          }
          
          console.log("[FileAnalysis] Texto extraído, tamanho:", fileText.length, "caracteres");
          
          // Limitar tamanho do texto para não exceder limites da API
          const maxTextLength = 50000; // Limite seguro
          if (fileText.length > maxTextLength) {
            fileText = fileText.substring(0, maxTextLength) + "\n\n[... conteúdo truncado ...]";
          }
          
          content = [
            {
              type: "text",
              text: `Analise este documento e gere um resumo completo com título, descrição, tags e categoria.

CONTEÚDO DO DOCUMENTO:
${fileText}`,
            },
          ];
        } catch (error) {
          console.error("[FileAnalysis] Erro ao baixar/ler documento:", error);
          throw new Error(`Erro ao processar documento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      }

      console.log("[FileAnalysis] Enviando requisição para IA...");
      const startTime = Date.now();

      const completion = await this.openaiRouter.chat.completions.create({
        model: "google/gemini-2.5-pro", // Gemini é melhor para multimodal
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: content as any },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[FileAnalysis] Análise concluída em", elapsedTime, "ms");

      const analysis = JSON.parse(completion.choices[0]?.message?.content || "{}");

      return {
        title: analysis.title || "Arquivo sem título",
        description: analysis.description || "",
        summary: analysis.summary || "",
        tags: request.includeTags ? (analysis.tags || []) : [],
        category: analysis.category,
        metadata: {
          fileType: request.fileType,
          fileUrl: request.fileUrl,
          analyzedAt: new Date().toISOString(),
        },
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("[FileAnalysis] Erro ao analisar arquivo:", error);
      throw new Error(
        `Failed to analyze file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Faz upload de arquivo para Supabase Storage
   */
  async uploadFileToStorage(
    fileBuffer: Buffer,
    fileName: string,
    companyId: string
  ): Promise<string> {
    try {
      console.log("[FileUpload] Fazendo upload de arquivo...");
      const filePath = `files/${companyId}/${Date.now()}_${fileName}`;
      
      const { data, error } = await this.supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
          contentType: this.getContentType(fileName),
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = this.supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      console.log("[FileUpload] Upload concluído:", urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error("[FileUpload] Erro ao fazer upload:", error);
      throw error;
    }
  }

  /**
   * Detecta tipo de arquivo baseado na extensão
   */
  private detectFileTypeFromExtension(extension: string): "image" | "video" | "audio" | "document" | "unknown" {
    const ext = extension.toLowerCase();
    
    // Imagens
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) {
      return "image";
    }
    
    // Vídeos
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) {
      return "video";
    }
    
    // Áudios
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus'].includes(ext)) {
      return "audio";
    }
    
    // Documentos
    if (['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt', 'ods'].includes(ext)) {
      return "document";
    }
    
    return "unknown";
  }

  /**
   * Baixa arquivo de uma URL
   */
  private async downloadFile(url: string): Promise<Buffer> {
    try {
      console.log("[FileAnalysis] Baixando arquivo de:", url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log("[FileAnalysis] Arquivo baixado, tamanho:", buffer.length, "bytes");
      return buffer;
    } catch (error) {
      console.error("[FileAnalysis] Erro ao baixar arquivo:", error);
      throw error;
    }
  }

  /**
   * Gera imagem usando IA (Gemini 3 Pro Image Preview)
   */
  async generateImage(
    prompt: string,
    options: {
      model?: string;
      size?: string;
      quality?: string;
      style?: string;
    } = {}
  ): Promise<{
    images: Array<{ imageUrl: string; index: number }>;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }> {
    try {
      console.log("[ImageGeneration] Iniciando geração de imagem");
      console.log("[ImageGeneration] Prompt:", prompt);
      console.log("[ImageGeneration] Modelo:", options.model || "google/gemini-3-pro-image-preview");

      const startTime = Date.now();

      const completion = await this.openaiRouter.chat.completions.create({
        model: options.model || "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"] as any,
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[ImageGeneration] Geração concluída em", elapsedTime, "ms");

      const response = completion.choices[0]?.message as any;
      const images: Array<{ imageUrl: string; index: number }> = [];

      if (response?.images && Array.isArray(response.images)) {
        response.images.forEach((image: any, index: number) => {
          if (image.image_url?.url) {
            images.push({
              imageUrl: image.image_url.url, // Base64 data URL
              index: index + 1,
            });
          }
        });
      }

      if (images.length === 0) {
        throw new Error("Nenhuma imagem foi gerada pela IA");
      }

      console.log("[ImageGeneration] Imagens geradas:", images.length);

      return {
        images,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("[ImageGeneration] Erro ao gerar imagem:", error);
      throw new Error(
        `Failed to generate image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Gera apresentação/documento usando Gamma API
   */
  async generateGamma(
    request: {
      inputText: string;
      textMode?: "generate" | "condense" | "preserve";
      format?: "presentation" | "document" | "webpage" | "social";
      themeId?: string;
      numCards?: number;
      cardSplit?: "auto" | "inputTextBreaks";
      additionalInstructions?: string;
      folderIds?: string[];
      exportAs?: "pdf" | "pptx" | ("pdf" | "pptx")[];
      textOptions?: {
        amount?: "brief" | "medium" | "detailed" | "extensive";
        tone?: string;
        audience?: string;
        language?: string;
      };
      imageOptions?: {
        source?: "aiGenerated" | "pictographic" | "unsplash" | "giphy" | "webAllImages" | "webFreeToUse" | "webFreeToUseCommercially" | "placeholder" | "noImages";
        model?: string;
        style?: string;
      };
      cardOptions?: {
        dimensions?: string;
        headerFooter?: {
          topLeft?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          topRight?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          topCenter?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          bottomLeft?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          bottomRight?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          bottomCenter?: { type: "text" | "image" | "cardNumber"; value?: string; source?: "themeLogo" | "custom"; src?: string; size?: "sm" | "md" | "lg" | "xl" };
          hideFromFirstCard?: boolean;
          hideFromLastCard?: boolean;
        };
      };
      sharingOptions?: {
        workspaceAccess?: "noAccess" | "view" | "comment" | "edit" | "fullAccess";
        externalAccess?: "noAccess" | "view" | "comment" | "edit";
        emailOptions?: {
          recipients?: string[];
          access?: "view" | "comment" | "edit" | "fullAccess";
        };
      };
    }
  ): Promise<{
    generationId: string;
    status: string;
    message?: string;
  }> {
    try {
      const gammaApiKey = process.env.GAMMA_API_KEY;
      if (!gammaApiKey) {
        throw new Error("GAMMA_API_KEY não configurada no ambiente");
      }

      console.log("[GammaGeneration] Iniciando geração com Gamma");
      console.log("[GammaGeneration] Formato:", request.format || "presentation");
      console.log("[GammaGeneration] Texto (primeiros 100 chars):", request.inputText.substring(0, 100));

      const startTime = Date.now();

      const payload: any = {
        inputText: request.inputText,
        textMode: request.textMode || "generate",
        format: request.format || "presentation",
      };

      if (request.themeId) payload.themeId = request.themeId;
      if (request.numCards) payload.numCards = request.numCards;
      if (request.cardSplit) payload.cardSplit = request.cardSplit;
      if (request.additionalInstructions) payload.additionalInstructions = request.additionalInstructions;
      if (request.folderIds && request.folderIds.length > 0) payload.folderIds = request.folderIds;
      if (request.exportAs && request.exportAs.length > 0) payload.exportAs = request.exportAs;
      if (request.textOptions) payload.textOptions = request.textOptions;
      if (request.imageOptions) payload.imageOptions = request.imageOptions;
      if (request.cardOptions) payload.cardOptions = request.cardOptions;
      if (request.sharingOptions) payload.sharingOptions = request.sharingOptions;

      const response = await fetch("https://public-api.gamma.app/v1.0/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": gammaApiKey,
        },
        body: JSON.stringify(payload),
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[GammaGeneration] Requisição concluída em", elapsedTime, "ms");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gamma API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = await response.json() as { generationId: string };
      console.log("[GammaGeneration] Gamma ID:", data.generationId);

      return {
        generationId: data.generationId,
        status: "processing",
        message: "Gamma está sendo gerado. Use o generationId para verificar o status.",
      };
    } catch (error) {
      console.error("[GammaGeneration] Erro ao gerar Gamma:", error);
      throw new Error(
        `Failed to generate Gamma: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Obtém status e URLs dos arquivos gerados pelo Gamma
   */
  async getGammaStatus(generationId: string): Promise<{
    status: string;
    fileUrls?: {
      gammaUrl?: string;
      pdfUrl?: string;
      pptxUrl?: string;
    };
    error?: string;
  }> {
    try {
      const gammaApiKey = process.env.GAMMA_API_KEY;
      if (!gammaApiKey) {
        throw new Error("GAMMA_API_KEY não configurada no ambiente");
      }

      console.log("[GammaStatus] Verificando status do Gamma:", generationId);

      const response = await fetch(
        `https://public-api.gamma.app/v1.0/generations/${generationId}`,
        {
          method: "GET",
          headers: {
            "X-API-KEY": gammaApiKey,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gamma API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = await response.json() as { status?: string; fileUrls?: { gammaUrl?: string; pdfUrl?: string; pptxUrl?: string }; error?: string };
      console.log("[GammaStatus] Status:", data.status);

      return {
        status: data.status || "unknown",
        fileUrls: data.fileUrls || {},
        error: data.error,
      };
    } catch (error) {
      console.error("[GammaStatus] Erro ao verificar status:", error);
      throw new Error(
        `Failed to get Gamma status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Cria Gamma a partir de um template existente
   */
  async createGammaFromTemplate(
    request: {
      gammaId: string;
      prompt: string;
      themeId?: string;
      folderIds?: string[];
      exportAs?: "pdf" | "pptx" | ("pdf" | "pptx")[];
      imageOptions?: {
        model?: string;
        style?: string;
      };
      sharingOptions?: {
        workspaceAccess?: "noAccess" | "view" | "comment" | "edit" | "fullAccess";
        externalAccess?: "noAccess" | "view" | "comment" | "edit";
        emailOptions?: {
          recipients?: string[];
          access?: "view" | "comment" | "edit" | "fullAccess";
        };
      };
    }
  ): Promise<{
    generationId: string;
    status: string;
    message?: string;
  }> {
    try {
      const gammaApiKey = process.env.GAMMA_API_KEY;
      if (!gammaApiKey) {
        throw new Error("GAMMA_API_KEY não configurada no ambiente");
      }

      console.log("[GammaFromTemplate] Criando Gamma a partir de template");
      console.log("[GammaFromTemplate] Template ID:", request.gammaId);
      console.log("[GammaFromTemplate] Prompt (primeiros 100 chars):", request.prompt.substring(0, 100));

      const startTime = Date.now();

      const payload: any = {
        gammaId: request.gammaId,
        prompt: request.prompt,
      };

      if (request.themeId) payload.themeId = request.themeId;
      if (request.folderIds && request.folderIds.length > 0) payload.folderIds = request.folderIds;
      
      // exportAs pode ser string ou array
      if (request.exportAs) {
        payload.exportAs = Array.isArray(request.exportAs) ? request.exportAs : [request.exportAs];
      }
      
      // imageOptions
      if (request.imageOptions) {
        payload.imageOptions = {};
        if (request.imageOptions.model) payload.imageOptions.model = request.imageOptions.model;
        if (request.imageOptions.style) payload.imageOptions.style = request.imageOptions.style;
      }
      
      // sharingOptions
      if (request.sharingOptions) {
        payload.sharingOptions = {};
        if (request.sharingOptions.workspaceAccess) payload.sharingOptions.workspaceAccess = request.sharingOptions.workspaceAccess;
        if (request.sharingOptions.externalAccess) payload.sharingOptions.externalAccess = request.sharingOptions.externalAccess;
        if (request.sharingOptions.emailOptions) {
          payload.sharingOptions.emailOptions = {};
          if (request.sharingOptions.emailOptions.recipients) payload.sharingOptions.emailOptions.recipients = request.sharingOptions.emailOptions.recipients;
          if (request.sharingOptions.emailOptions.access) payload.sharingOptions.emailOptions.access = request.sharingOptions.emailOptions.access;
        }
      }

      const response = await fetch("https://public-api.gamma.app/v1.0/generations/from-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": gammaApiKey,
        },
        body: JSON.stringify(payload),
      });

      const elapsedTime = Date.now() - startTime;
      console.log("[GammaFromTemplate] Requisição concluída em", elapsedTime, "ms");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gamma API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = await response.json() as { generationId: string };
      console.log("[GammaFromTemplate] Gamma ID:", data.generationId);

      return {
        generationId: data.generationId,
        status: "processing",
        message: "Gamma está sendo gerado a partir do template. Use o generationId para verificar o status.",
      };
    } catch (error) {
      console.error("[GammaFromTemplate] Erro ao criar Gamma:", error);
      throw new Error(
        `Failed to create Gamma from template: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Lista temas disponíveis no Gamma
   */
  async listGammaThemes(options?: {
    query?: string;
    limit?: number;
    after?: string;
  }): Promise<{
    themes: Array<{
      id: string;
      name: string;
      type: string;
      colorKeywords?: string[];
      toneKeywords?: string[];
    }>;
    nextCursor?: string;
  }> {
    try {
      const gammaApiKey = process.env.GAMMA_API_KEY;
      if (!gammaApiKey) {
        throw new Error("GAMMA_API_KEY não configurada no ambiente");
      }

      const params = new URLSearchParams();
      if (options?.query) params.append("query", options.query);
      if (options?.limit) params.append("limit", options.limit.toString());
      if (options?.after) params.append("after", options.after);

      const url = `https://public-api.gamma.app/v1.0/themes${params.toString() ? `?${params.toString()}` : ""}`;

      console.log("[GammaThemes] Listando temas...");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-API-KEY": gammaApiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gamma API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = await response.json() as Array<any> | { themes?: Array<any>; nextCursor?: string };
      console.log("[GammaThemes] Temas encontrados:", Array.isArray(data) ? data.length : "N/A");

      // Gamma pode retornar array ou objeto com paginação
      if (Array.isArray(data)) {
        return { themes: data };
      } else {
        return {
          themes: data.themes || [],
          nextCursor: data.nextCursor,
        };
      }
    } catch (error) {
      console.error("[GammaThemes] Erro ao listar temas:", error);
      throw new Error(
        `Failed to list Gamma themes: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Obtém content type baseado na extensão do arquivo
   */
  private getContentType(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop() || '';
    const contentTypes: Record<string, string> = {
      // Imagens
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      // Vídeos
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      webm: 'video/webm',
      // Áudio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      // Documentos
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return contentTypes[extension] || 'application/octet-stream';
  }

  private async downloadAudio(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Converte texto em áudio usando OpenAI TTS via OpenRouter
   */
  async textToSpeech(
    text: string,
    options?: {
      voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
      model?: "tts-1" | "tts-1-hd";
      speed?: number; // 0.25 a 4.0
      format?: "mp3" | "opus" | "aac" | "flac";
    }
  ): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error("Texto não pode estar vazio");
    }

    // Limitar tamanho do texto (OpenAI TTS tem limite de 4096 caracteres)
    const maxLength = 4096;
    if (text.length > maxLength) {
      console.warn(`[TTS] Texto excede ${maxLength} caracteres. Truncando...`);
      text = text.substring(0, maxLength);
    }

    const voice = options?.voice || "alloy";
    const model = options?.model || "tts-1-hd"; // Usar HD por padrão para melhor qualidade
    const speed = options?.speed || 1.0;
    const format = options?.format || "mp3";

    console.log(`[TTS] Gerando áudio: ${text.length} caracteres, voz: ${voice}, modelo: ${model}, formato: ${format}`);

    // OpenRouter não suporta TTS, então usamos apenas OpenAI direta
    if (!this.openaiDirect) {
      throw new Error(
        "OPENAI_API_KEY não configurada. Text-to-Speech requer uma chave direta da OpenAI (não OpenRouter). " +
        "OpenRouter não suporta TTS diretamente. " +
        "Configure OPENAI_API_KEY no arquivo .env com uma chave direta da OpenAI (formato: sk-...). " +
        "Obtenha sua chave em: https://platform.openai.com/account/api-keys"
      );
    }

    try {
      console.log(`[TTS] Gerando áudio via OpenAI...`);
      const response = await this.openaiDirect.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
        speed: speed,
        response_format: format,
      });
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`[TTS] Áudio gerado com sucesso: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error("[TTS] Erro ao gerar áudio:", error);
      
      // Mensagem mais clara para erro de autenticação
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Incorrect API key") || error.message.includes("authentication")) {
          const openaiKey = process.env.OPENAI_API_KEY || "";
          const keyPrefix = openaiKey.substring(0, 10);
          
          if (openaiKey.startsWith("sk-or-v1-")) {
            throw new Error(
              "Erro de autenticação: A chave OPENAI_API_KEY é do OpenRouter (sk-or-v1-...), mas Text-to-Speech requer uma chave direta da OpenAI (sk-...). " +
              "OpenRouter não suporta TTS. " +
              "Obtenha uma chave direta da OpenAI em: https://platform.openai.com/account/api-keys " +
              "e atualize o arquivo .env com OPENAI_API_KEY=sk-..."
            );
          }
          
          throw new Error(
            `Erro de autenticação OpenAI (401): A chave OPENAI_API_KEY está incorreta ou expirada. ` +
            `Chave usada: ${keyPrefix}... ` +
            `Verifique se a chave está correta no arquivo .env e se é uma chave direta da OpenAI (formato: sk-...). ` +
            `Obtenha uma nova chave em: https://platform.openai.com/account/api-keys`
          );
        }
      }
      
      throw new Error(
        `Falha ao gerar áudio: ${error instanceof Error ? error.message : "Erro desconhecido"}`
      );
    }
  }

  /**
   * Extrai áudio de um vídeo para reduzir o tamanho do arquivo usando ffmpeg
   * Requer ffmpeg instalado no sistema
   * Usa pipes para evitar criar arquivos temporários
   */
  private async extractAudioFromVideo(videoBuffer: Buffer, fileName: string): Promise<Buffer | null> {
    try {
      console.log("[DocumentService] Tentando extrair áudio com ffmpeg...");
      
      // Extrair áudio usando ffmpeg com pipes (stdin/stdout)
      // -i pipe:0 = ler do stdin
      // -f mp3 = formato de saída MP3
      // -acodec libmp3lame = codec MP3
      // -ab 128k = bitrate de áudio 128kbps (boa qualidade, tamanho reduzido)
      // -ar 44100 = sample rate 44.1kHz
      // pipe:1 = escrever no stdout
      const ffmpegProcess = Bun.spawn([
        "ffmpeg",
        "-i", "pipe:0", // Ler do stdin
        "-vn", // Sem vídeo
        "-f", "mp3", // Formato MP3
        "-acodec", "libmp3lame", // Codec MP3
        "-ab", "128k", // Bitrate 128kbps
        "-ar", "44100", // Sample rate
        "-y", // Sobrescrever (não necessário com pipe, mas não faz mal)
        "pipe:1" // Escrever no stdout
      ], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      
      // Escrever vídeo no stdin do ffmpeg
      ffmpegProcess.stdin.write(videoBuffer);
      ffmpegProcess.stdin.end();
      
      // Ler áudio do stdout
      const audioChunks: Uint8Array[] = [];
      const reader = ffmpegProcess.stdout.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) audioChunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      
      // Aguardar processo terminar
      const exitCode = await ffmpegProcess.exited;
      
      if (exitCode !== 0) {
        const errorOutput = await new Response(ffmpegProcess.stderr).text();
        console.error("[DocumentService] Erro ao executar ffmpeg:", errorOutput);
        console.error("[DocumentService] Exit code:", exitCode);
        return null;
      }
      
      // Combinar chunks em um único buffer
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const audioBuffer = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        audioBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      
      console.log(`[DocumentService] ✅ Áudio extraído com sucesso: ${audioBuffer.length} bytes (${(audioBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
      
      return audioBuffer;
    } catch (error: any) {
      // Se ffmpeg não estiver instalado, o erro será capturado aqui
      if (error?.code === "ENOENT" || error?.message?.includes("ffmpeg")) {
        console.warn("[DocumentService] ffmpeg não encontrado. Instale ffmpeg para extrair áudio de vídeos.");
        console.warn("[DocumentService] Windows: choco install ffmpeg ou baixe de https://ffmpeg.org/download.html");
        console.warn("[DocumentService] Linux/Mac: apt-get install ffmpeg ou brew install ffmpeg");
      } else {
        console.error("[DocumentService] Erro ao extrair áudio:", error);
      }
      return null;
    }
  }
}

function wrapText(
  text: string,
  font: any,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);
    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function sanitizePdfText(text: string): string {
  // Substitui bullets e símbolos não suportados pelo WinAnsi
  return text
    .replace(/[\u2022\u25CF\u25A0\u25CB\u25E6]/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00A0]/g, ' ');
}

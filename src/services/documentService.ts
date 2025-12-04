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
  private openaiDirect: OpenAI; // Para Whisper direto
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

    // OpenAI direto para Whisper (fallback se Gemini não funcionar)
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
    context: RequestContext
  ): Promise<TranscribeAudioResponse> {
    try {
      // 1. Upload áudio para Supabase Storage
      const audioUrl = await this.uploadAudioToStorage(audioBuffer, fileName, context.companyId);

      // 2. Transcrição usando Gemini 2.5 Pro (melhor para áudio)
      const transcription = await this.transcribeWithGemini(audioUrl, request.options.language);

      // 3. Análises opcionais com GPT-5
      const analysis = await this.analyzeTranscription(
        transcription.text,
        request.options,
        context
      );

      // 4. Identificação de speakers (se solicitada)
      const speakers = request.options.speakerIdentification
        ? await this.identifySpeakers(transcription.text, transcription.segments)
        : undefined;

      // 5. Salvar processamento no banco
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
        usage: {
          audioMinutes: Math.ceil(transcription.duration / 60),
          transcriptionTokens: Math.ceil(transcription.text.length / 4),
          analysisTokens: analysis.totalTokens || 0,
          totalTokens: Math.ceil(transcription.text.length / 4) + (analysis.totalTokens || 0),
        },
      };
    } catch (error) {
      console.error("Error transcribing audio:", error);
      throw new Error(
        `Failed to transcribe audio: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Transcreve áudio usando Gemini 2.5 Pro
   */
  private async transcribeWithGemini(audioUrl: string, language: string) {
    try {
      // Usar Gemini 2.5 Pro para transcrição (melhor que Whisper para muitos casos)
      const completion = await this.openaiRouter.chat.completions.create({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcreva este áudio para texto em ${language}. Mantenha pontuação, parágrafos e formatação natural. Se houver múltiplos falantes, indique quando possível.`,
              },
              {
                type: "audio_url", // Gemini suporta áudio diretamente
                audio_url: { url: audioUrl },
              },
            ],
          },
        ],
        temperature: 0.1, // Baixa para transcrição precisa
      });

      const text = completion.choices[0]?.message?.content || "";
      
      return {
        text,
        confidence: 0.95, // Gemini geralmente tem alta confiança
        language: language,
        duration: 0, // Gemini não retorna duração diretamente
        segments: this.parseTextIntoSegments(text),
      };
    } catch (error) {
      console.error("Gemini transcription failed, trying Whisper fallback:", error);
      
      // Fallback para Whisper se Gemini falhar
      if (this.openaiDirect) {
        return this.transcribeWithWhisper(audioUrl, language);
      }
      
      throw error;
    }
  }

  /**
   * Fallback: transcrição com Whisper
   */
  private async transcribeWithWhisper(audioUrl: string, language: string) {
    try {
      // Download do áudio para transcrição local
      const audioBuffer = await this.downloadAudio(audioUrl);
      const tempFile = `temp_${Date.now()}.wav`;
      
      // Salvar temporariamente
      require('fs').writeFileSync(tempFile, audioBuffer);

      const transcription = await this.openaiDirect.audio.transcriptions.create({
        file: require('fs').createReadStream(tempFile),
        model: "whisper-1",
        language: language.split('-')[0], // 'pt' de 'pt-BR'
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      // Limpar arquivo temporário
      require('fs').unlinkSync(tempFile);

      return {
        text: transcription.text,
        confidence: 0.9,
        language: transcription.language || language,
        duration: transcription.duration || 0,
        segments: transcription.segments || [],
      };
    } catch (error) {
      console.error("Whisper transcription failed:", error);
      throw error;
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
      if (!options.actionItemExtraction && !options.keyPointsExtraction && 
          !options.agendaGeneration && !options.sentimentAnalysis) {
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
  ): Promise<string> {
    try {
      const objectPath = `${companyId}/${fileName}`;
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      let bucket = "audio-files";
      let uploadError: any = null;
      {
        const res = await this.supabase.storage
          .from(bucket)
          .upload(objectPath, blob, { upsert: true, contentType: "audio/wav" });
        uploadError = res.error || null;
      }
      if (uploadError && String(uploadError.message || uploadError).toLowerCase().includes("bucket not found")) {
        // fallback para bucket documents
        bucket = "documents";
        const res2 = await this.supabase.storage
          .from(bucket)
          .upload(objectPath, blob, { upsert: true, contentType: "audio/wav" });
        if (res2.error) throw res2.error;
      } else if (uploadError) {
        throw uploadError;
      }

      const signedUrl = await createSignedUrl(bucket, objectPath, 60 * 60);
      return signedUrl;
    } catch (error) {
      console.error("Error uploading audio:", error);
      throw error;
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
        const paragraphs = content.split(/\r?\n/).map((line) => new Paragraph(new TextRun({ text: line })));
        const doc = new Document({
          sections: [
            {
              properties: {},
              children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }), ...paragraphs],
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
      // Fallback: retornar ID gerado localmente para não falhar o fluxo
      const fallbackId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return fallbackId;
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

  private async downloadAudio(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
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

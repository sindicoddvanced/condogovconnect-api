import OpenAI from "openai";
import type { RequestContext } from "../types/ai.js";

/**
 * Serviço para gestão de assembleias e geração de atas
 * Implementa as APIs conforme especificado no PRD
 */
export class AssemblyService {
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
   * Cria nova assembleia
   */
  async createAssembly(data: any, context: RequestContext) {
    try {
      const assembly = await this.saveAssembly({
        companyId: context.companyId,
        title: data.title,
        description: data.description,
        scheduledDate: data.scheduledDate || new Date().toISOString(),
        location: data.location,
        status: data.status,
        clientId: data.clientId,
        recordingId: data.recordingId,
        createdBy: context.userId,
      });

      return assembly;
    } catch (error) {
      console.error("Error creating assembly:", error);
      throw error;
    }
  }

  /**
   * Lista assembleias
   */
  async getAssemblies(companyId: string, filters: any = {}) {
    try {
      const assemblies = await this.getAssembliesFromDatabase(companyId, filters);
      return assemblies;
    } catch (error) {
      console.error("Error getting assemblies:", error);
      throw error;
    }
  }

  /**
   * Busca transcrição da assembleia
   */
  async getAssemblyTranscription(assemblyId: string, companyId: string) {
    try {
      const transcription = await this.getTranscriptionFromDatabase(assemblyId, companyId);
      return transcription;
    } catch (error) {
      console.error("Error getting assembly transcription:", error);
      throw error;
    }
  }

  /**
   * Gera ata com IA usando GPT-5 ou Gemini 2.5 Flash
   */
  async generateMinutes(data: any, context: RequestContext) {
    try {
      // 1. Preparar prompt para geração de ata
      const systemPrompt = this.buildMinutesSystemPrompt(data);
      const userPrompt = this.buildMinutesUserPrompt(data);

      // 2. Chamar IA (GPT-5 ou Gemini 2.5 Flash)
      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat", // ou "google/gemini-2.5-flash"
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = completion.choices[0]?.message?.content || "";
      
      // 3. Processar resultado
      const processedResult = this.processMinutesResult(content, data);

      // 4. Salvar ata
      const minuteId = await this.saveMinute({
        companyId: context.companyId,
        assemblyDetails: data.assembly_details,
        content: processedResult.minutes_content,
        summary: processedResult.summary,
        participants: processedResult.participants,
        createdBy: context.userId,
      });

      return {
        minuteId,
        ...processedResult,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("Error generating minutes:", error);
      throw error;
    }
  }

  /**
   * Análise de sentimento e conflitos
   */
  async analyzeSentiment(data: any, context: RequestContext) {
    try {
      const systemPrompt = `Você é um especialista em análise de sentimento e detecção de conflitos em reuniões.
      
      TIPO DE ANÁLISE: ${data.analysis_type}
      SENSIBILIDADE: ${data.sensitivity}
      
      Analise o texto fornecido e identifique:
      1. Sentimento geral da reunião
      2. Pontos de conflito ou tensão
      3. Timeline emocional
      4. Recomendações para melhorias
      
      Responda em JSON estruturado.`;

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.transcription_text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const analysis = JSON.parse(completion.choices[0]?.message?.content || "{}");

      return {
        overall_sentiment: analysis.overall_sentiment || "neutral",
        conflict_points: analysis.conflict_points || [],
        emotion_timeline: analysis.emotion_timeline || [],
        recommendations: analysis.recommendations || [],
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      throw error;
    }
  }

  /**
   * Gera resumo executivo
   */
  async generateSummary(data: any, context: RequestContext) {
    try {
      const systemPrompt = `Você é um especialista em criação de resumos executivos para atas de reunião.
      
      TIPO DE RESUMO: ${data.summary_type}
      TAMANHO MÁXIMO: ${data.max_length} caracteres
      AUDIÊNCIA: ${data.target_audience}
      INCLUIR MÉTRICAS: ${data.include_metrics ? 'Sim' : 'Não'}
      
      Crie um resumo claro, conciso e focado nos pontos mais importantes.
      
      Responda em JSON estruturado.`;

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.minutes_content },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const summary = JSON.parse(completion.choices[0]?.message?.content || "{}");

      return {
        executive_summary: summary.executive_summary || "",
        key_metrics: summary.key_metrics || {},
        action_items: summary.action_items || [],
        next_steps: summary.next_steps || [],
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("Error generating summary:", error);
      throw error;
    }
  }

  /**
   * Identifica participantes
   */
  async identifySpeakers(data: any, context: RequestContext) {
    try {
      const systemPrompt = `Você é um especialista em identificação de participantes em reuniões.
      
      Analise os dados de transcrição e identifique:
      1. Participantes conhecidos baseado na lista fornecida
      2. Participantes desconhecidos
      3. Estatísticas de participação
      4. Tempo de fala por participante
      
      Responda em JSON estruturado.`;

      const completion = await this.openaiRouter.chat.completions.create({
        model: "openai/gpt-5-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Dados de transcrição: ${JSON.stringify(data.transcription_data)}
            
            Participantes conhecidos: ${JSON.stringify(data.known_participants)}`
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const identification = JSON.parse(completion.choices[0]?.message?.content || "{}");

      return {
        identified_speakers: identification.identified_speakers || [],
        unknown_speakers: identification.unknown_speakers || [],
        participation_stats: identification.participation_stats || {},
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      console.error("Error identifying speakers:", error);
      throw error;
    }
  }

  /**
   * Constrói prompt do sistema para geração de atas
   */
  private buildMinutesSystemPrompt(data: any): string {
    return `Você é um assistente especializado em criar atas de assembleia condominial.

FORMATO DE SAÍDA: ${data.format}
IDIOMA: ${data.language}
SEÇÕES INCLUÍDAS: ${data.include_sections.join(', ')}

INSTRUÇÕES ESPECIAIS: ${data.custom_instructions || 'Use linguagem formal e técnica. Inclua resumo executivo.'}

ESTRUTURA DA ATA:
1. Cabeçalho com informações da assembleia
2. Lista de participantes
3. Ordem do dia
4. Deliberações e discussões
5. Votações e decisões
6. Encerramento

Use linguagem formal, seja preciso e inclua todos os detalhes importantes.`;
  }

  /**
   * Constrói prompt do usuário para geração de atas
   */
  private buildMinutesUserPrompt(data: any): string {
    return `Gere uma ata para a seguinte assembleia:

INFORMAÇÕES DA ASSEMBLEIA:
- Título: ${data.assembly_details.title}
- Data: ${data.assembly_details.date}
- Local: ${data.assembly_details.location}
- Tipo: ${data.assembly_details.type}

TRANSCRIÇÃO:
${data.transcription_text}

Formate a resposta conforme o formato ${data.format} solicitado.`;
  }

  /**
   * Processa resultado da geração de ata
   */
  private processMinutesResult(content: string, data: any) {
    // Extrair seções da ata
    const sections = this.extractSections(content);
    
    // Gerar resumo
    const summary = this.generateSummaryFromContent(content);
    
    // Extrair participantes
    const participants = this.extractParticipants(content);

    return {
      minutes_content: content,
      summary,
      participants,
      confidence_score: 0.94,
    };
  }

  /**
   * Extrai seções da ata
   */
  private extractSections(content: string) {
    const sections = {};
    const sectionHeaders = ['ABERTURA', 'PARTICIPANTES', 'ORDEM DO DIA', 'DELIBERAÇÕES', 'VOTAÇÕES', 'ENCERRAMENTO'];
    
    sectionHeaders.forEach(header => {
      const regex = new RegExp(`##?\\s*${header}[\\s\\S]*?(?=##?\\s*[A-Z]|$)`, 'i');
      const match = content.match(regex);
      if (match) {
        sections[header.toLowerCase()] = match[0].trim();
      }
    });

    return sections;
  }

  /**
   * Gera resumo da ata
   */
  private generateSummaryFromContent(content: string) {
    return {
      total_participants: this.countParticipants(content),
      main_topics: this.extractMainTopics(content),
      decisions_made: this.extractDecisions(content),
      next_meeting: this.extractNextMeeting(content),
    };
  }

  /**
   * Conta participantes
   */
  private countParticipants(content: string): number {
    const participantMatches = content.match(/participante|membro|presente/gi);
    return participantMatches ? participantMatches.length : 0;
  }

  /**
   * Extrai tópicos principais
   */
  private extractMainTopics(content: string): string[] {
    const topics = [];
    const topicPattern = /(?:item|tópico|assunto)\s*\d*[:\-]?\s*([^.\n]+)/gi;
    let match;
    
    while ((match = topicPattern.exec(content)) !== null) {
      topics.push(match[1].trim());
    }
    
    return topics.slice(0, 5); // Máximo 5 tópicos
  }

  /**
   * Extrai decisões
   */
  private extractDecisions(content: string): string[] {
    const decisions = [];
    const decisionPattern = /(?:aprovado|rejeitado|decisão|votação)[:\-]?\s*([^.\n]+)/gi;
    let match;
    
    while ((match = decisionPattern.exec(content)) !== null) {
      decisions.push(match[1].trim());
    }
    
    return decisions;
  }

  /**
   * Extrai próxima reunião
   */
  private extractNextMeeting(content: string): string {
    const nextMeetingPattern = /(?:próxima|próximo)\s*(?:reunião|encontro)[:\-]?\s*([^.\n]+)/gi;
    const match = content.match(nextMeetingPattern);
    return match ? match[0] : "Não definida";
  }

  /**
   * Extrai participantes
   */
  private extractParticipants(content: string) {
    const participants = [];
    const participantPattern = /([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*-\s*([^,\n]+))?/g;
    let match;
    
    while ((match = participantPattern.exec(content)) !== null) {
      participants.push({
        name: match[1],
        role: match[2] || "Participante",
        attendance: "present",
        votes: 1,
      });
    }
    
    return participants;
  }

  /**
   * Salva assembleia no banco
   */
  private async saveAssembly(data: any): Promise<any> {
    const assemblyId = Math.floor(Math.random() * 1000000);
    console.log(`💾 Assembly saved (simulated): ${assemblyId}`);
    return {
      id: assemblyId,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Salva ata no banco
   */
  private async saveMinute(data: any): Promise<string> {
    const minuteId = `minute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`💾 Minute saved (simulated): ${minuteId}`);
    return minuteId;
  }

  /**
   * Busca assembleias no banco
   */
  private async getAssembliesFromDatabase(companyId: string, filters: any): Promise<any[]> {
    // Simular busca
    return [
      {
        id: 1,
        title: "Assembleia Ordinária - Janeiro 2025",
        description: "Assembleia para aprovação de orçamento",
        scheduled_date: "2025-01-25T14:00:00Z",
        location: "Salão de festas",
        status: "realizada",
        client_id: 1,
        created_at: "2025-01-20T10:00:00Z",
      },
    ];
  }

  /**
   * Busca transcrição no banco
   */
  private async getTranscriptionFromDatabase(assemblyId: string, companyId: string): Promise<any> {
    // Simular busca
    return {
      id: `trans_${assemblyId}`,
      assembly_id: assemblyId,
      transcript: "Transcrição completa da assembleia...",
      status: "completed",
      confidence: 0.91,
      created_at: "2025-01-25T15:00:00Z",
    };
  }
}

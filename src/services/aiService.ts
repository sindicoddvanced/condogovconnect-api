import OpenAI from "openai";
import type {
  AIModel,
  ChatMessage,
  AIRequest,
  AIResponse,
  MessageContent,
  RequestContext,
} from "../types/ai.js";
import { RAGService } from "./ragService.js";
import { createDatabaseAdapter } from "./databaseAdapter.js";

export class AIService {
  private openai: OpenAI;
  private ragService: RAGService;
  private models: AIModel[] = [
    {
      id: "openai/gpt-5-chat",
      name: "GPT-5",
      provider: "openai",
      description:
        "Modelo multimodal de última geração da OpenAI com forte raciocínio",
      capabilities: ["text", "images", "multimodal", "analysis", "reasoning"],
      maxTokens: 200000,
    },
    {
      id: "openai/gpt-4.1",
      name: "GPT-4.1",
      provider: "openai",
      description: "Modelo mais avançado da OpenAI para análises complexas",
      capabilities: ["text", "analysis", "reasoning"],
      maxTokens: 128000,
    },
    {
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      description:
        "Modelo multimodal do Google com capacidade de análise de imagens",
      capabilities: ["text", "images", "multimodal", "analysis"],
      maxTokens: 2000000,
    },
    {
      id: "google/gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "google",
      description:
        "Modelo rápido do Google otimizado para velocidade, ideal para resumos e análises rápidas",
      capabilities: ["text", "images", "multimodal", "analysis", "fast"],
      maxTokens: 1000000,
    },
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "openai",
      description: "Modelo rápido e eficiente da OpenAI, ideal para tarefas que precisam de velocidade",
      capabilities: ["text", "analysis", "fast"],
      maxTokens: 128000,
    },
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      provider: "anthropic",
      description: "Modelo da Anthropic focado em segurança e precisão",
      capabilities: ["text", "analysis", "safety", "reasoning"],
      maxTokens: 200000,
    },
    {
      id: "x-ai/grok-4",
      name: "Grok 4",
      provider: "x-ai",
      description: "Modelo open source eficiente para análises rápidas",
      capabilities: ["text", "analysis", "efficiency"],
      maxTokens: 131072,
    },
  ];

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const siteName = process.env.SITE_NAME || "CondoGov AdminAssistant";

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": siteUrl,
        "X-Title": siteName,
      },
    });

    // Inicializar RAG Service
    const databaseAdapter = createDatabaseAdapter();
    this.ragService = new RAGService(databaseAdapter);
  }

  getModels(): AIModel[] {
    return this.models;
  }

  getModel(modelId: string): AIModel | undefined {
    return this.models.find((model) => model.id === modelId);
  }

  async sendMessageWithRAG(
    request: AIRequest,
    context: RequestContext
  ): Promise<AIResponse> {
    try {
      const model = this.getModel(request.model);
      if (!model) {
        throw new Error(`Model ${request.model} not found`);
      }

      // Buscar conhecimento relevante usando RAG
      const ragResult = await this.ragService.retrieveKnowledge(
        request.message,
        context
      );

      // Montar prompt enriquecido
      const enrichedPrompt = this.ragService.buildEnrichedPrompt(
        request.message,
        ragResult.citations,
        ragResult.memories,
        context
      );

      // Preparar mensagens para o OpenAI
      const messages = this.prepareMessagesWithRAG(enrichedPrompt, context);

      const completion = await this.openai.chat.completions.create({
        model: request.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error("No response from AI model");
      }

      // Extrair memórias da conversa para aprendizado futuro
      await this.ragService.extractMemories(
        request.message,
        response.content || "",
        context
      );

      return {
        message: response.content || "",
        model: request.model,
        tokens: completion.usage?.total_tokens || 0,
        sessionId: request.sessionId || this.generateSessionId(),
        messageId: this.generateMessageId(),
        timestamp: new Date(),
        citations: ragResult.citations,
        memoryUsed: ragResult.memories,
      };
    } catch (error) {
      console.error("Error sending message with RAG:", error);
      throw new Error(
        `Failed to get AI response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async sendMessage(request: AIRequest): Promise<AIResponse> {
    try {
      const model = this.getModel(request.model);
      if (!model) {
        throw new Error(`Model ${request.model} not found`);
      }

      // Preparar mensagens para o OpenAI
      const messages = this.prepareMessages(request);

      const completion = await this.openai.chat.completions.create({
        model: request.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error("No response from AI model");
      }

      return {
        message: response.content || "",
        model: request.model,
        tokens: completion.usage?.total_tokens || 0,
        sessionId: request.sessionId || this.generateSessionId(),
        messageId: this.generateMessageId(),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Error sending message to AI:", error);
      throw new Error(
        `Failed to get AI response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async sendMessageWithImages(
    request: AIRequest,
    imageUrls: string[]
  ): Promise<AIResponse> {
    try {
      const model = this.getModel(request.model);
      if (!model) {
        throw new Error(`Model ${request.model} not found`);
      }

      // Verificar se o modelo suporta imagens
      if (
        !model.capabilities.includes("images") &&
        !model.capabilities.includes("multimodal")
      ) {
        throw new Error(
          `Model ${request.model} does not support image analysis`
        );
      }

      // Preparar conteúdo com imagens usando tipos compatíveis com OpenAI
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: "text",
          text: request.message,
        },
      ];

      // Adicionar imagens
      imageUrls.forEach((url) => {
        content.push({
          type: "image_url",
          image_url: { url },
        });
      });

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "user",
          content: content,
        },
      ];

      const completion = await this.openai.chat.completions.create({
        model: request.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
      });

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error("No response from AI model");
      }

      return {
        message: response.content || "",
        model: request.model,
        tokens: completion.usage?.total_tokens || 0,
        sessionId: request.sessionId || this.generateSessionId(),
        messageId: this.generateMessageId(),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Error sending message with images to AI:", error);
      throw new Error(
        `Failed to get AI response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async analyzeCondominiumData(
    data: any,
    analysisType: string,
    model: string = "openai/gpt-4.1",
    userId: string = "system"
  ): Promise<AIResponse> {
    const prompts = {
      performance: `Analise os dados de performance deste condomínio e forneça insights sobre:
      - Taxa de conclusão de projetos
      - Projetos atrasados e suas causas
      - Eficiência operacional
      - Recomendações para melhorias
      
      Dados: ${JSON.stringify(data, null, 2)}`,

      financial: `Analise a situação financeira deste condomínio e forneça:
      - Análise de receitas e despesas
      - Previsões financeiras
      - Identificação de problemas financeiros
      - Sugestões de otimização de orçamento
      
      Dados: ${JSON.stringify(data, null, 2)}`,

      alerts: `Analise os alertas críticos deste condomínio e priorize:
      - Questões mais urgentes
      - Impacto potencial de cada alerta
      - Plano de ação recomendado
      - Prevenção de problemas futuros
      
      Dados: ${JSON.stringify(data, null, 2)}`,

      optimization: `Analise os processos deste condomínio e sugira otimizações:
      - Processos que podem ser automatizados
      - Melhorias na gestão
      - Redução de custos operacionais
      - Aumento da satisfação dos moradores
      
      Dados: ${JSON.stringify(data, null, 2)}`,
    };

    const prompt =
      prompts[analysisType as keyof typeof prompts] || prompts.performance;

    return this.sendMessage({
      message: prompt,
      model: model,
      userId: userId,
      context: { analysisType, data },
    });
  }

  private prepareMessagesWithRAG(
    enrichedPrompt: string,
    context: RequestContext
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: this.getSystemPrompt(context),
    };

    const userMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "user",
      content: enrichedPrompt,
    };

    return [systemMessage, userMessage];
  }

  private prepareMessages(
    request: AIRequest,
    context?: RequestContext
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Usar getSystemPrompt se tiver contexto, senão usar prompt padrão
    const systemContent = context 
      ? this.getSystemPrompt(context)
      : `Você é o AdminAssistantAI, um assistente inteligente especializado em gestão de condomínios. 
      Você ajuda administradores com análises, insights e suporte para tomada de decisões.
      
      Suas especialidades incluem:
      - Análise de performance de projetos
      - Gestão financeira de condomínios
      - Identificação e priorização de alertas
      - Otimização de processos
      - Suporte à tomada de decisões
      
      Sempre forneça respostas práticas, objetivas e acionáveis.`;

    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: systemContent,
    };

    const userMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "user",
      content: request.message,
    };

    return [systemMessage, userMessage];
  }

  private getSystemPrompt(context: RequestContext): string {
    const basePrompt = `Você é o AdminAssistantAI, um assistente inteligente especializado em gestão condominial da plataforma CondoGov Connect.

CONTEXTO ATUAL:
- Usuário: ${context.userId}
- Modo: ${context.contextMode}${context.sector ? ` (Setor: ${context.sector})` : ""}

SUAS CAPACIDADES:
- Análise de dados com base no conhecimento da empresa
- Personalização baseada no histórico do usuário
- Suporte especializado por setor quando aplicável
- Respostas fundamentadas em informações verificadas

INSTRUÇÕES ESPECÍFICAS:
- Use sempre as informações fornecidas no contexto
- Cite fontes quando relevante
- Personalize respostas com base nas memórias do usuário
- Mantenha foco no setor específico quando em modo setorial
- Seja prático, objetivo e acionável
- Se não souber algo, seja honesto sobre as limitações
- IMPORTANTE: NUNCA mencione IDs técnicos (como UUIDs de empresa, usuário ou sistema) nas suas respostas. Use apenas informações descritivas e nomes quando disponíveis.

${context.contextMode === "sector" && context.sector ? 
  `FOCO SETORIAL: Suas respostas devem priorizar informações e ações relacionadas ao setor ${context.sector}.` : 
  `VISÃO GERAL: Forneça uma perspectiva ampla da empresa, considerando todos os setores relevantes.`
}`;

    return basePrompt;
  }

  private generateSessionId(): string {
    // Usar crypto.randomUUID() para gerar UUID válido
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: gerar UUID v4 manualmente
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private generateMessageId(): string {
    // Usar UUID para compatibilidade com banco de dados
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: gerar UUID v4 manualmente
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Gera um resumo rápido e direto para um setor específico com alertas críticos
   * Ideal para exibição inicial no dashboard
   */
  async generateQuickSectorSummary(
    sector: string,
    context: RequestContext,
    model: string = "google/gemini-2.5-flash"
  ): Promise<AIResponse & { criticalAlerts?: any[]; quickTip?: string }> {
    try {
      const modelInfo = this.getModel(model);
      if (!modelInfo) {
        throw new Error(`Model ${model} not found`);
      }

      // Buscar dados do setor usando RAG (limitado para acelerar)
      const sectorQuery = `resumo rápido do setor ${sector} alertas críticos urgente`;
      const ragResult = await this.ragService.retrieveKnowledge(sectorQuery, {
        ...context,
        contextMode: "sector",
        sector: sector,
      });

      // Limitar citações para acelerar (máximo 5)
      if (ragResult.citations && ragResult.citations.length > 5) {
        ragResult.citations = ragResult.citations.slice(0, 5);
      }

      // Extrair alertas críticos das citações
      const criticalAlerts = this.extractCriticalAlerts(ragResult.citations || [], sector);

      // Montar prompt para resumo rápido
      const enrichedPrompt = this.ragService.buildEnrichedPrompt(
        `Gere um resumo RÁPIDO e DIRETO para o setor ${sector}. Seja CONCISO (máximo 250 palavras).

INCLUA APENAS:
1. 📊 RESUMO EXECUTIVO: 2-3 frases sobre a situação atual
2. ⚠️ ALERTAS CRÍTICOS: Apenas itens que precisam de ação IMEDIATA (se houver)
3. 💡 DICA RÁPIDA: Uma dica prática e acionável para hoje

NÃO inclua:
- Detalhes extensos
- Recomendações gerais
- Próximos passos de longo prazo

Seja DIRETO e OBJETIVO. Use os dados fornecidos.`,
        ragResult.citations,
        ragResult.memories,
        {
          ...context,
          contextMode: "sector",
          sector: sector,
        }
      );

      const systemPrompt = `Você é um assistente especializado em gestão condominial.

Você está gerando um RESUMO RÁPIDO para o setor ${sector} que será exibido em um dashboard.

REGRAS:
- Seja EXTREMAMENTE CONCISO (máximo 250 palavras)
- Foque apenas no ESSENCIAL
- Destaque APENAS alertas críticos que precisam de ação imediata
- Use emojis para melhorar a legibilidade (📊, ⚠️, 💡)
- NUNCA mencione IDs técnicos
- Formato: Markdown simples com seções curtas

FORMATO:
## 📊 Resumo Executivo
[2-3 frases sobre a situação]

## ⚠️ Alertas Críticos
[Se houver, apenas itens urgentes. Se não houver, diga "✅ Nenhum alerta crítico no momento."]

## 💡 Dica Rápida
[Uma dica prática e acionável para hoje]`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: enrichedPrompt,
        },
      ];

      console.log(`[AIService] Gerando resumo rápido para setor: ${sector}...`);
      const startTime = Date.now();

      const isFastModel = model.includes("flash") || model.includes("mini") || model.includes("fast");
      const maxTokens = isFastModel ? 600 : 800;
      const temperature = isFastModel ? 0.5 : 0.6;

      const completion = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
      });

      const elapsedTime = Date.now() - startTime;
      console.log(`[AIService] Resumo rápido gerado em ${elapsedTime}ms. Tokens: ${completion.usage?.total_tokens || 0}`);

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error("No response from AI model");
      }

      // Extrair dica rápida do texto (última seção)
      const quickTip = this.extractQuickTip(response.content || "");

      return {
        message: response.content || "",
        model: model,
        tokens: completion.usage?.total_tokens || 0,
        sessionId: this.generateSessionId(),
        messageId: this.generateMessageId(),
        timestamp: new Date(),
        citations: ragResult.citations || [],
        memoryUsed: ragResult.memories || [],
        criticalAlerts: criticalAlerts,
        quickTip: quickTip,
      };
    } catch (error) {
      console.error("Error generating quick sector summary:", error);
      throw new Error(
        `Failed to generate quick sector summary: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extrai alertas críticos das citações baseado em palavras-chave e prioridades
   */
  private extractCriticalAlerts(citations: any[], sector: string): any[] {
    const alerts: any[] = [];
    const criticalKeywords = ["urgente", "crítico", "crítico", "emergência", "atrasado", "vencido", "quebrado", "falha", "erro", "problema"];
    
    citations.forEach((citation) => {
      const content = (citation.content || "").toLowerCase();
      const hasCriticalKeyword = criticalKeywords.some(keyword => content.includes(keyword));
      
      // Verificar se tem status crítico
      const hasCriticalStatus = citation.tags?.some((tag: string) => 
        ["urgent", "critical", "high", "broken", "overdue", "failed"].includes(tag.toLowerCase())
      );

      if (hasCriticalKeyword || hasCriticalStatus || citation.score > 0.9) {
        alerts.push({
          id: citation.chunkId,
          sector: citation.sector || sector,
          content: citation.content?.substring(0, 150) || "",
          priority: hasCriticalKeyword ? "critical" : "high",
          source: citation.sourceId,
          tags: citation.tags || [],
        });
      }
    });

    return alerts.slice(0, 5); // Máximo 5 alertas
  }

  /**
   * Extrai a dica rápida do texto gerado
   */
  private extractQuickTip(text: string): string {
    // Procurar pela seção "💡 Dica Rápida" ou "💡 Dica"
    const tipMatch = text.match(/##\s*💡\s*Dica\s*Rápida?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (tipMatch && tipMatch[1]) {
      return tipMatch[1].trim().substring(0, 200); // Limitar tamanho
    }
    
    // Se não encontrar, procurar por qualquer seção com 💡
    const emojiMatch = text.match(/💡\s*([^\n]+(?:\n[^\n]+){0,2})/);
    if (emojiMatch && emojiMatch[1]) {
      return emojiMatch[1].trim().substring(0, 200);
    }

    return "";
  }

  /**
   * Gera um resumo executivo completo para um setor específico
   * Busca dados do BD e gera automaticamente resumo, alertas, dicas e próximos passos
   */
  async generateSectorSummary(
    sector: string,
    context: RequestContext,
    model: string = "google/gemini-2.5-flash"
  ): Promise<AIResponse> {
    try {
      const modelInfo = this.getModel(model);
      if (!modelInfo) {
        throw new Error(`Model ${model} not found`);
      }

      // Buscar dados do setor usando RAG (limitado para acelerar)
      const sectorQuery = `resumo do setor ${sector} situação atual alertas recomendações`;
      const ragResult = await this.ragService.retrieveKnowledge(sectorQuery, {
        ...context,
        contextMode: "sector",
        sector: sector,
      });

      // Limitar citações para acelerar o processamento (máximo 10)
      if (ragResult.citations && ragResult.citations.length > 10) {
        ragResult.citations = ragResult.citations.slice(0, 10);
      }

      // Montar prompt específico para resumo executivo do setor
      const enrichedPrompt = this.ragService.buildEnrichedPrompt(
        `Gere um resumo executivo completo e detalhado para o setor ${sector}. Inclua:
1. VISÃO GERAL: Situação atual do setor
2. SITUAÇÃO ATUAL: Dados principais, estatísticas e status
3. ALERTAS: Itens que precisam de atenção urgente
4. RECOMENDAÇÕES: O que fazer para melhorar
5. PRÓXIMOS PASSOS: Ações práticas e priorizadas
6. DICAS: Orientações operacionais para a equipe

Seja detalhado, prático e acionável. Use os dados fornecidos no contexto.`,
        ragResult.citations,
        ragResult.memories,
        {
          ...context,
          contextMode: "sector",
          sector: sector,
        }
      );

      // Preparar mensagens para o OpenAI
      const systemPrompt = `Você é um assistente especializado em gestão condominial da plataforma CondoGov Connect.

Você está gerando um resumo executivo automático para o setor ${sector}.

INSTRUÇÕES:
- Gere um resumo completo, detalhado e prático
- Use APENAS os dados fornecidos no contexto
- Seja objetivo e acionável
- Organize em seções claras (Visão Geral, Situação Atual, Alertas, Recomendações, Próximos Passos, Dicas)
- Use emojis para melhorar a legibilidade (🔍, 📊, ⚠️, 💡, 🧭, etc.)
- NUNCA mencione IDs técnicos (UUIDs) nas respostas
- Foque em informações práticas e operacionais para a equipe do setor
- Se não houver dados suficientes, seja claro sobre as limitações

FORMATO:
Use markdown com seções bem definidas. Seja detalhado e completo.`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: enrichedPrompt,
        },
      ];

      console.log(`[AIService] Enviando requisição para gerar resumo do setor ${sector}...`);
      const startTime = Date.now();

      // Usar menos tokens para modelos rápidos, acelerar a resposta
      const isFastModel = model.includes("flash") || model.includes("mini") || model.includes("fast");
      const maxTokens = isFastModel ? 2048 : 4096;
      const temperature = isFastModel ? 0.6 : 0.7; // Menor temperatura = mais rápido e determinístico

      const completion = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
      });

      const elapsedTime = Date.now() - startTime;
      console.log(`[AIService] Resumo gerado em ${elapsedTime}ms. Tokens: ${completion.usage?.total_tokens || 0}`);

      const response = completion.choices[0]?.message;
      if (!response) {
        throw new Error("No response from AI model");
      }

      const messageContent = response.content || "";
      console.log(`[AIService] Tamanho da resposta: ${messageContent.length} caracteres`);

      return {
        message: messageContent,
        model: model,
        tokens: completion.usage?.total_tokens || 0,
        sessionId: this.generateSessionId(),
        messageId: this.generateMessageId(),
        timestamp: new Date(),
        citations: ragResult.citations || [],
        memoryUsed: ragResult.memories || [],
      };
    } catch (error) {
      console.error("Error generating sector summary:", error);
      throw new Error(
        `Failed to generate sector summary: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

}

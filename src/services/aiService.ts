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
    model: string = "openai/gpt-4.1"
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
    request: AIRequest
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `Você é o AdminAssistantAI, um assistente inteligente especializado em gestão de condomínios. 
      Você ajuda administradores com análises, insights e suporte para tomada de decisões.
      
      Suas especialidades incluem:
      - Análise de performance de projetos
      - Gestão financeira de condomínios
      - Identificação e priorização de alertas
      - Otimização de processos
      - Suporte à tomada de decisões
      
      Sempre forneça respostas práticas, objetivas e acionáveis.`,
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
- Empresa: ${context.companyId}
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

${context.contextMode === "sector" && context.sector ? 
  `FOCO SETORIAL: Suas respostas devem priorizar informações e ações relacionadas ao setor ${context.sector}.` : 
  `VISÃO GERAL: Forneça uma perspectiva ampla da empresa, considerando todos os setores relevantes.`
}`;

    return basePrompt;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

}

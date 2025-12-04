import type {
  KnowledgeChunk,
  KnowledgeCitation,
  UserMemory,
  RequestContext,
  RAGConfig,
} from "../types/ai.js";
import { EmbeddingService } from "./embeddingService.js";

/**
 * Interface para database adapter (permite trocar de Postgres para outros BDs)
 */
export interface DatabaseAdapter {
  searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit?: number,
    threshold?: number
  ): Promise<KnowledgeCitation[]>;
  
  searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit?: number
  ): Promise<UserMemory[]>;
  
  updateMemoryUsage(memoryId: string): Promise<void>;
  
  saveUserMemory(memory: Omit<UserMemory, "id" | "createdAt">): Promise<UserMemory>;
}

/**
 * Serviço RAG (Retrieval-Augmented Generation)
 * Combina busca semântica com memória do usuário para respostas contextualizadas
 */
export class RAGService {
  private embeddingService: EmbeddingService;
  private db: DatabaseAdapter;
  private defaultConfig: RAGConfig = {
    maxChunks: 8,
    similarityThreshold: 0.7,
    useMemory: true,
    memoryWeight: 0.3,
  };

  constructor(databaseAdapter: DatabaseAdapter) {
    this.embeddingService = new EmbeddingService();
    this.db = databaseAdapter;
  }

  /**
   * Busca conhecimento relevante baseado na query do usuário
   */
  async retrieveKnowledge(
    query: string,
    context: RequestContext,
    config: Partial<RAGConfig> = {}
  ): Promise<{
    citations: KnowledgeCitation[];
    memories: UserMemory[];
    queryEmbedding: number[];
  }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Gerar embedding da query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Buscar chunks de conhecimento
      let citations = await this.db.searchKnowledgeChunks(
        context.companyId,
        queryEmbedding,
        context.contextMode === "sector" ? context.sector : undefined,
        finalConfig.maxChunks,
        finalConfig.similarityThreshold
      );

      // Se vazio (pode ser por falta de embedding no chunk), tente uma busca "aberta" reduzida
      if (!citations || citations.length === 0) {
        citations = [];
      }

      // Buscar memórias do usuário (se habilitado)
      let memories: UserMemory[] = [];
      if (finalConfig.useMemory) {
        memories = await this.db.searchUserMemories(
          context.companyId,
          context.userId,
          queryEmbedding,
          Math.ceil(finalConfig.maxChunks * finalConfig.memoryWeight)
        );

        // Atualizar contadores de uso das memórias
        for (const memory of memories) {
          await this.db.updateMemoryUsage(memory.id);
        }
      }

      return {
        citations,
        memories,
        queryEmbedding,
      };
    } catch (error) {
      console.error("Error in RAG retrieval:", error);
      throw new Error(
        `Failed to retrieve knowledge: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Monta prompt enriquecido com contexto RAG
   */
  buildEnrichedPrompt(
    originalQuery: string,
    citations: KnowledgeCitation[],
    memories: UserMemory[],
    context: RequestContext
  ): string {
    let enrichedPrompt = "";

    // Contexto da empresa e setor
    enrichedPrompt += `CONTEXTO DA CONSULTA:\n`;
    enrichedPrompt += `- Empresa: ${context.companyId}\n`;
    enrichedPrompt += `- Usuário: ${context.userId}\n`;
    enrichedPrompt += `- Modo: ${context.contextMode}${
      context.sector ? ` (Setor: ${context.sector})` : ""
    }\n\n`;

    // Memórias do usuário (personalizações)
    if (memories.length > 0) {
      enrichedPrompt += `MEMÓRIAS DO USUÁRIO (use para personalizar a resposta):\n`;
      memories.forEach((memory, index) => {
        enrichedPrompt += `${index + 1}. [${memory.memoryType.toUpperCase()}] ${memory.content}\n`;
      });
      enrichedPrompt += `\n`;
    }

    // Conhecimento da base (RAG)
    if (citations.length > 0) {
      enrichedPrompt += `CONHECIMENTO RELEVANTE:\n`;
      citations.forEach((citation, index) => {
        enrichedPrompt += `${index + 1}. [${citation.sector}] ${citation.content}\n`;
        if (citation.tags && citation.tags.length > 0) {
          enrichedPrompt += `   Tags: ${citation.tags.join(", ")}\n`;
        }
      });
      enrichedPrompt += `\n`;
    } else {
      enrichedPrompt += `CONHECIMENTO RELEVANTE: (nenhum conteúdo indexado encontrado)\n\n`;
    }

    // Query original do usuário
    enrichedPrompt += `PERGUNTA DO USUÁRIO:\n${originalQuery}\n\n`;

    // Instruções para a IA
    enrichedPrompt += `INSTRUÇÕES:\n`;
    enrichedPrompt += `- Use o conhecimento relevante acima para responder com precisão\n`;
    enrichedPrompt += `- Considere as memórias do usuário para personalizar a resposta\n`;
    enrichedPrompt += `- Se não houver informação suficiente, seja claro sobre as limitações\n`;
    enrichedPrompt += `- Cite as fontes quando apropriado\n`;
    enrichedPrompt += `- Mantenha o foco no contexto ${
      context.contextMode === "sector" ? `do setor ${context.sector}` : "geral da empresa"
    }\n`;

    return enrichedPrompt;
  }

  /**
   * Extrai possíveis memórias da conversa para salvar
   */
  async extractMemories(
    userMessage: string,
    assistantResponse: string,
    context: RequestContext
  ): Promise<void> {
    try {
      // Lógica simples de extração de memórias
      // Em produção, você pode usar um modelo menor ou regras mais sofisticadas
      
      const memoryPatterns = [
        // Preferências explícitas
        /eu prefiro|gosto de|não gosto|sempre|nunca|costumo/i,
        // Contexto específico da empresa
        /nosso condomínio|nossa empresa|nosso setor/i,
        // Regras e políticas
        /nossa política|nossa regra|procedimento|protocolo/i,
      ];

      for (const pattern of memoryPatterns) {
        if (pattern.test(userMessage)) {
          const memoryContent = this.extractRelevantSentence(userMessage, pattern);
          if (memoryContent) {
            await this.saveMemory({
              companyId: context.companyId,
              userId: context.userId,
              memoryType: this.classifyMemoryType(memoryContent),
              content: memoryContent,
              confidence: 0.7,
              usageCount: 0,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error extracting memories:", error);
      // Não falhar a operação principal se extração de memória falhar
    }
  }

  /**
   * Salva uma nova memória do usuário
   */
  private async saveMemory(
    memory: Omit<UserMemory, "id" | "createdAt" | "embedding">
  ): Promise<void> {
    try {
      const embedding = await this.embeddingService.generateEmbedding(memory.content);
      
      await this.db.saveUserMemory({
        ...memory,
        embedding,
      });
    } catch (error) {
      console.error("Error saving memory:", error);
    }
  }

  /**
   * Classifica o tipo de memória baseado no conteúdo
   */
  private classifyMemoryType(content: string): "preference" | "context" | "rule" | "fact" {
    if (/prefiro|gosto|não gosto/i.test(content)) return "preference";
    if (/política|regra|procedimento|protocolo/i.test(content)) return "rule";
    if (/nosso|nossa|empresa|condomínio/i.test(content)) return "context";
    return "fact";
  }

  /**
   * Extrai sentença relevante baseada no padrão encontrado
   */
  private extractRelevantSentence(text: string, pattern: RegExp): string | null {
    const sentences = text.split(/[.!?]+/);
    const relevantSentence = sentences.find(sentence => pattern.test(sentence));
    return relevantSentence?.trim() || null;
  }

  /**
   * Retorna estatísticas do serviço RAG
   */
  getStats() {
    return {
      embeddingModel: this.embeddingService.getModelInfo(),
      defaultConfig: this.defaultConfig,
      version: "1.0.0",
    };
  }
}

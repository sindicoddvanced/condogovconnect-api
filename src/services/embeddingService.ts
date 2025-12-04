import OpenAI from "openai";

/**
 * Serviço para geração de embeddings usando OpenAI
 * Suporta text-embedding-3-large (3072 dimensões) para máxima qualidade
 */
export class EmbeddingService {
  private openai: OpenAI;
  private readonly model: string;
  private readonly usingOpenRouter: boolean;
  private readonly dimensions = 3072;

  constructor() {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (openRouterKey) {
      // Primário: OpenRouter como provedor de embeddings
      this.openai = new OpenAI({
        apiKey: openRouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
          "X-Title": process.env.SITE_NAME || "CondoGov AdminAssistant",
        },
      });
      this.model = "openai/text-embedding-3-large"; // 3072D via OpenRouter
      this.usingOpenRouter = true;
    } else if (openAiKey) {
      // Fallback: OpenAI direto
      this.openai = new OpenAI({ apiKey: openAiKey });
      this.model = "text-embedding-3-large"; // 3072D no endpoint OpenAI
      this.usingOpenRouter = false;
    } else {
      throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is required for embeddings");
    }
  }

  /**
   * Gera embedding para um texto único
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Limpar e preparar texto
      const cleanText = this.preprocessText(text);
      
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: cleanText,
        dimensions: this.dimensions,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error("No embedding returned from OpenAI");
      }

      return embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error(
        `Failed to generate embedding: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Gera embeddings para múltiplos textos em lote (mais eficiente)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (texts.length === 0) return [];
      
      // Limitar lote para evitar timeout (máximo 100 textos por vez)
      const batchSize = 100;
      const results: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const cleanBatch = batch.map(text => this.preprocessText(text));
        
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: cleanBatch,
          dimensions: this.dimensions,
        });

        const embeddings = response.data.map(item => item.embedding);
        results.push(...embeddings);
      }

      return results;
    } catch (error) {
      console.error("Error generating batch embeddings:", error);
      throw new Error(
        `Failed to generate batch embeddings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Calcula similaridade de cosseno entre dois vetores
   */
  calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Pré-processa texto para embeddings
   */
  private preprocessText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, " ") // Normalizar espaços
      .replace(/[\r\n]+/g, " ") // Converter quebras de linha em espaços
      .substring(0, 8000); // Limitar tamanho (OpenAI tem limite de tokens)
  }

  /**
   * Quebra texto em chunks para processamento
   */
  chunkText(
    text: string,
    maxTokens: number = 800,
    overlapTokens: number = 100
  ): string[] {
    // Estimativa simples: ~4 caracteres por token em português
    const maxChars = maxTokens * 4;
    const overlapChars = overlapTokens * 4;
    
    if (text.length <= maxChars) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxChars;
      
      // Tentar quebrar em fronteira de palavra
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        const lastPeriod = text.lastIndexOf(".", end);
        const lastNewline = text.lastIndexOf("\n", end);
        
        const breakPoint = Math.max(lastSpace, lastPeriod, lastNewline);
        if (breakPoint > start + maxChars * 0.5) {
          end = breakPoint + 1;
        }
      }

      chunks.push(text.substring(start, end).trim());
      start = end - overlapChars;
    }

    return chunks.filter(chunk => chunk.length > 50); // Filtrar chunks muito pequenos
  }

  /**
   * Retorna informações sobre o modelo de embedding
   */
  getModelInfo() {
    return {
      model: this.model,
      dimensions: this.dimensions,
      maxTokens: 8192,
      costPer1kTokens: 0.00013, // USD (preço atual da OpenAI)
    };
  }
}

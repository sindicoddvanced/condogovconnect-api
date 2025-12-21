import type { KnowledgeCitation, UserMemory } from "../types/ai.js";
import type { DatabaseAdapter } from "./ragService.js";

/**
 * Adapter PostgreSQL para operações RAG
 * Implementa busca vetorial usando pgvector
 */
export class PostgreSQLAdapter implements DatabaseAdapter {
  private connectionString: string;

  constructor() {
    this.connectionString =
      process.env.DATABASE_URL ||
      process.env.SUPABASE_URL ||
      "postgresql://localhost:5432/condogov";

    if (!this.connectionString) {
      throw new Error(
        "DATABASE_URL or SUPABASE_URL environment variable is required"
      );
    }
  }

  /**
   * Busca chunks de conhecimento usando similaridade vetorial
   */
  async searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit: number = 8,
    threshold: number = 0.7
  ): Promise<KnowledgeCitation[]> {
    try {
      // Simular busca por enquanto - em produção, use um cliente PostgreSQL real
      // como 'pg' ou integração com Supabase

      const mockResults: KnowledgeCitation[] = [
        {
          chunkId: "chunk-1",
          sourceId: "source-1",
          sector: sector || "Dashboard",
          content: `Informação relevante sobre ${
            sector || "o sistema"
          } para a empresa ${companyId}`,
          score: 0.85,
          tags: ["seed", sector?.toLowerCase() || "geral"],
        },
      ];

      return mockResults.filter((result) => result.score >= threshold);
    } catch (error) {
      console.error("Error searching knowledge chunks:", error);
      return [];
    }
  }

  /**
   * Busca memórias do usuário
   */
  async searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit: number = 3
  ): Promise<UserMemory[]> {
    try {
      // Mock - em produção, implementar busca real
      const mockMemories: UserMemory[] = [];
      return mockMemories;
    } catch (error) {
      console.error("Error searching user memories:", error);
      return [];
    }
  }

  /**
   * Atualiza contador de uso de uma memória
   */
  async updateMemoryUsage(memoryId: string): Promise<void> {
    try {
      // Mock - em produção:
      // UPDATE user_memories
      // SET usage_count = usage_count + 1, last_used_at = now()
      // WHERE id = $1
      console.log(`Updated memory usage for ${memoryId}`);
    } catch (error) {
      console.error("Error updating memory usage:", error);
    }
  }

  /**
   * Salva nova memória do usuário
   */
  async saveUserMemory(
    memory: Omit<UserMemory, "id" | "createdAt">
  ): Promise<UserMemory> {
    try {
      // Mock - em produção, salvar no banco
      const savedMemory: UserMemory = {
        ...memory,
        id: `memory-${Date.now()}`,
        createdAt: new Date(),
      };

      console.log("Saved user memory:", savedMemory);
      return savedMemory;
    } catch (error) {
      console.error("Error saving user memory:", error);
      throw error;
    }
  }
}

/**
 * Factory para criar adapter baseado na configuração
 */
export function createDatabaseAdapter(): DatabaseAdapter {
  // Fallback inteligente: usa Supabase se configurado; caso contrário, mock local
  const hasSupabase =
    (!!process.env.SUPABASE_PROJECT_ID || !!process.env.SUPABASE_URL) &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (hasSupabase) {
    try {
      const { createSupabaseAdapter } = require("./supabaseAdapter.js");
      return createSupabaseAdapter();
    } catch (error) {
      console.warn(
        "📚 Supabase RAG adapter indisponível, usando PostgreSQLAdapter mock",
        error instanceof Error ? error.message : error
      );
      return new PostgreSQLAdapter();
    }
  }

  console.warn(
    "📚 SUPABASE_* env não configurado. Usando PostgreSQLAdapter mock (busca simulada)."
  );
  return new PostgreSQLAdapter();
}

/* 
IMPLEMENTAÇÃO REAL COM POSTGRES (exemplo para quando conectar o banco):

import { Pool } from 'pg';

export class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit: number = 8,
    threshold: number = 0.7
  ): Promise<KnowledgeCitation[]> {
    const query = `
      SELECT 
        kc.id as chunk_id,
        kc.source_id,
        kc.sector,
        kc.content,
        kc.tags,
        (1 - (kc.embedding <=> $2::vector)) as score
      FROM knowledge_chunks kc
      WHERE kc.company_id = $1
        ${sector ? 'AND kc.sector = $3' : ''}
        AND (1 - (kc.embedding <=> $2::vector)) >= $${sector ? '4' : '3'}
      ORDER BY kc.embedding <=> $2::vector
      LIMIT $${sector ? '5' : '4'}
    `;
    
    const params = [companyId, JSON.stringify(queryEmbedding)];
    if (sector) {
      params.push(sector, threshold.toString(), limit.toString());
    } else {
      params.push(threshold.toString(), limit.toString());
    }

    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      sourceId: row.source_id,
      sector: row.sector,
      content: row.content,
      score: parseFloat(row.score),
      tags: row.tags,
    }));
  }

  async searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit: number = 3
  ): Promise<UserMemory[]> {
    const query = `
      SELECT *
      FROM user_memories
      WHERE company_id = $1 AND user_id = $2
      ORDER BY embedding <=> $3::vector
      LIMIT $4
    `;

    const result = await this.pool.query(query, [
      companyId,
      userId,
      JSON.stringify(queryEmbedding),
      limit,
    ]);

    return result.rows.map(row => ({
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      memoryType: row.memory_type,
      content: row.content,
      embedding: row.embedding,
      confidence: parseFloat(row.confidence),
      usageCount: parseInt(row.usage_count),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  async updateMemoryUsage(memoryId: string): Promise<void> {
    const query = `
      UPDATE user_memories 
      SET usage_count = usage_count + 1, last_used_at = now()
      WHERE id = $1
    `;
    
    await this.pool.query(query, [memoryId]);
  }

  async saveUserMemory(
    memory: Omit<UserMemory, "id" | "createdAt">
  ): Promise<UserMemory> {
    const query = `
      INSERT INTO user_memories (
        company_id, user_id, memory_type, content, embedding, 
        confidence, usage_count
      )
      VALUES ($1, $2, $3, $4, $5::vector, $6, $7)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      memory.companyId,
      memory.userId,
      memory.memoryType,
      memory.content,
      JSON.stringify(memory.embedding),
      memory.confidence,
      memory.usageCount,
    ]);

    const row = result.rows[0];
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      memoryType: row.memory_type,
      content: row.content,
      embedding: row.embedding,
      confidence: parseFloat(row.confidence),
      usageCount: parseInt(row.usage_count),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
*/

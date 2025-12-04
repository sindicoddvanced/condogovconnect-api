import type { KnowledgeCitation, UserMemory } from "../types/ai.js";
import type { DatabaseAdapter } from "./ragService.js";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";

export class SupabaseAdapter implements DatabaseAdapter {
  private supabase = getSupabaseServiceClient();

  async searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit: number = 8,
    threshold: number = 0.7
  ): Promise<KnowledgeCitation[]> {
    // Requer função RPC no banco para busca vetorial (pgvector)
    const { data, error } = await this.supabase.rpc("match_knowledge_chunks", {
      p_company_id: companyId,
      p_query_embedding: queryEmbedding,
      p_match_count: limit,
      p_similarity_threshold: threshold,
      p_sector: sector || null,
    });

    if (error) throw error;
    if (!Array.isArray(data)) return [];

    let results = data.map((row: any) => ({
      chunkId: row.chunk_id ?? row.id ?? "",
      sourceId: row.source_id,
      sector: row.sector,
      content: row.content,
      score: typeof row.score === "number" ? row.score : 0,
      tags: row.tags || [],
    }));

    // Fallback: se nenhum resultado (pode ser porque embeddings dos chunks estão nulos), retornar por setor/top-N
    if (!results || results.length === 0) {
      const qb = this.supabase
        .from('knowledge_chunks')
        .select('id, source_id, sector, content, tags')
        .eq('company_id', companyId)
        .limit(limit);
      if (sector) qb.eq('sector', sector);
      const { data: plain, error: plainErr } = await qb;
      if (!plainErr && Array.isArray(plain)) {
        results = plain.map((row: any) => ({
          chunkId: row.id,
          sourceId: row.source_id,
          sector: row.sector,
          content: row.content,
          score: 0.1,
          tags: row.tags || [],
        }));
      }
    }

    return results;
  }

  async searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit: number = 3
  ): Promise<UserMemory[]> {
    // Requer função RPC no banco para busca vetorial (pgvector)
    const { data, error } = await this.supabase.rpc("match_user_memories", {
      p_company_id: companyId,
      p_user_id: userId,
      p_query_embedding: queryEmbedding,
      p_match_count: limit,
    });

    if (error) throw error;
    if (!Array.isArray(data)) return [];

    return data.map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      memoryType: row.memory_type,
      content: row.content,
      embedding: row.embedding,
      confidence: Number(row.confidence ?? 0),
      usageCount: Number(row.usage_count ?? 0),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  async updateMemoryUsage(memoryId: string): Promise<void> {
    // Estratégia segura: buscar usage_count atual e incrementar
    const { data, error } = await this.supabase
      .from("user_memories")
      .select("usage_count")
      .eq("id", memoryId)
      .maybeSingle();

    if (error) throw error;

    const current = data?.usage_count ?? 0;
    const { error: updateError } = await this.supabase
      .from("user_memories")
      .update({ usage_count: current + 1, last_used_at: new Date().toISOString() })
      .eq("id", memoryId);

    if (updateError) throw updateError;
  }

  async saveUserMemory(
    memory: Omit<UserMemory, "id" | "createdAt">
  ): Promise<UserMemory> {
    // Inserção via RPC para garantir cast do vetor
    const { data, error } = await this.supabase.rpc("insert_user_memory", {
      p_company_id: memory.companyId,
      p_user_id: memory.userId,
      p_memory_type: memory.memoryType,
      p_content: memory.content,
      p_embedding: memory.embedding ?? null,
      p_confidence: memory.confidence,
      p_usage_count: memory.usageCount,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      memoryType: row.memory_type,
      content: row.content,
      embedding: row.embedding,
      confidence: Number(row.confidence ?? 0),
      usageCount: Number(row.usage_count ?? 0),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

export function createSupabaseAdapter(): DatabaseAdapter {
  return new SupabaseAdapter();
}



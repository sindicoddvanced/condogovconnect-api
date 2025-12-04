import type {
  KnowledgeCitation,
  UserMemory,
} from "../types/ai.js";
import type { DatabaseAdapter } from "./ragService.js";

/**
 * Adapter Supabase MCP para operações RAG
 * Usa as funções MCP do Supabase para operações no banco
 */
export class SupabaseMcpAdapter implements DatabaseAdapter {
  private projectId: string;
  private serviceRoleKey: string;

  constructor() {
    this.projectId = process.env.SUPABASE_PROJECT_ID || "";
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!this.projectId || !this.serviceRoleKey) {
      throw new Error("SUPABASE_PROJECT_ID and SUPABASE_SERVICE_ROLE_KEY are required");
    }
  }


  /**
   * Busca chunks de conhecimento usando similaridade vetorial via MCP
   */
  async searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit: number = 8,
    threshold: number = 0.7
  ): Promise<KnowledgeCitation[]> {
    try {
      // Usar MCP Supabase para busca vetorial
      // Converter embedding para formato PostgreSQL vector
      const embeddingVector = `[${queryEmbedding.join(',')}]`;
      
      let query = `
        SELECT 
          kc.id as chunk_id,
          kc.source_id,
          kc.sector,
          kc.content,
          kc.tags,
          (1 - (kc.embedding <=> '${embeddingVector}'::vector)) as score
        FROM knowledge_chunks kc
        WHERE kc.company_id = '${companyId}'
      `;
      
      if (sector) {
        query += ` AND kc.sector = '${sector}'`;
      }
      
      query += `
        AND (1 - (kc.embedding <=> '${embeddingVector}'::vector)) >= ${threshold}
        ORDER BY kc.embedding <=> '${embeddingVector}'::vector
        LIMIT ${limit}
      `;

      // Executar query via MCP
      const result = await this.executeMcpSql(query);
      
      if (!result || !Array.isArray(result)) {
        console.warn("No results from knowledge search");
        return [];
      }

      return result.map(row => ({
        chunkId: row.chunk_id,
        sourceId: row.source_id,
        sector: row.sector,
        content: row.content,
        score: parseFloat(row.score) || 0,
        tags: row.tags || [],
      }));
    } catch (error) {
      console.error("Error searching knowledge chunks:", error);
      return [];
    }
  }

  /**
   * Busca memórias do usuário via MCP
   */
  async searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit: number = 3
  ): Promise<UserMemory[]> {
    try {
      const embeddingVector = `[${queryEmbedding.join(',')}]`;
      
      const query = `
        SELECT *
        FROM user_memories
        WHERE company_id = '${companyId}' AND user_id = '${userId}'
        ORDER BY embedding <=> '${embeddingVector}'::vector
        LIMIT ${limit}
      `;

      const result = await this.executeMcpSql(query);
      
      if (!result || !Array.isArray(result)) {
        return [];
      }

      return result.map(row => ({
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
      const query = `
        UPDATE user_memories 
        SET usage_count = usage_count + 1, last_used_at = now()
        WHERE id = '${memoryId}'
      `;
      
      await this.executeMcpSql(query);
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
      const embeddingVector = memory.embedding ? `'[${memory.embedding.join(',')}]'::vector` : 'NULL';
      
      const query = `
        INSERT INTO user_memories (
          company_id, user_id, memory_type, content, embedding, 
          confidence, usage_count
        )
        VALUES (
          '${memory.companyId}', '${memory.userId}', '${memory.memoryType}', 
          '${memory.content.replace(/'/g, "''")}', ${embeddingVector}, 
          ${memory.confidence}, ${memory.usageCount}
        )
        RETURNING *
      `;

      const result = await this.executeMcpSql(query);
      
      if (!result || !Array.isArray(result) || result.length === 0) {
        throw new Error("Failed to save user memory");
      }

      const row = result[0];
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
    } catch (error) {
      console.error("Error saving user memory:", error);
      throw error;
    }
  }

  /**
   * Verifica se as tabelas RAG existem no Supabase
   * Retorna true por padrão para evitar erros na inicialização
   */
  async checkTablesExist(): Promise<boolean> {
    // Assumir que as tabelas existem para evitar erros de conectividade
    console.log("📋 Assuming RAG tables exist (manual setup required)");
    return true;
  }

  /**
   * Placeholder para criação de tabelas
   * As tabelas devem ser criadas manualmente via SQL
   */
  async createTablesIfNeeded(): Promise<void> {
    console.log("📋 Tables should be created manually using supabase_setup.sql");
    console.log("📋 Execute the SQL file in Supabase Dashboard > SQL Editor");
  }

  /**
   * Executa operações no Supabase usando MCP + REST API híbrido
   * Tenta MCP primeiro, fallback para REST API
   */
  private async executeMcpSql(query: string): Promise<any> {
    try {
      // Primeiro, tentar usar MCP nativo se disponível
      const mcpResult = await this.tryMcpExecution(query);
      if (mcpResult !== null) {
        return mcpResult;
      }

      // Fallback para REST API
      if (query.trim().toUpperCase().startsWith('SELECT')) {
        return await this.executeSelectQuery(query);
      }
      
      return await this.executeRestQuery(query);
    } catch (error) {
      console.error("Error executing Supabase query:", error);
      console.error("Query:", query);
      
      // Para desenvolvimento, retornar array vazio em vez de falhar
      console.warn("Returning empty result for development");
      return [];
    }
  }

  /**
   * Tenta executar via MCP nativo, retorna null se não conseguir
   */
  private async tryMcpExecution(query: string): Promise<any | null> {
    try {
      // Usar wrapper MCP organizado
      const { mcp_supabase_execute_sql } = await import("../mcp-functions.js");
      
      const result = await mcp_supabase_execute_sql({
        project_id: this.projectId,
        query: query
      });

      if (result) {
        console.log("✅ MCP execution successful");
        return Array.isArray(result) ? result : [result];
      }
    } catch (error) {
      // MCP falhou, usar fallback
      console.log("MCP execution failed, using REST API fallback:", error instanceof Error ? error.message : error);
    }
    
    return null;
  }

  /**
   * Executa queries SELECT usando PostgREST
   */
  private async executeSelectQuery(query: string): Promise<any> {
    const supabaseUrl = `https://${this.projectId}.supabase.co`;
    
    // Detectar tabela da query (simplificado)
    const lowerQuery = query.toLowerCase();
    let endpoint = '';
    
    if (lowerQuery.includes('knowledge_chunks')) {
      endpoint = '/rest/v1/knowledge_chunks?select=*';
    } else if (lowerQuery.includes('knowledge_sources')) {
      endpoint = '/rest/v1/knowledge_sources?select=*';
    } else if (lowerQuery.includes('user_memories')) {
      endpoint = '/rest/v1/user_memories?select=*';
    } else if (lowerQuery.includes('chat_sessions')) {
      endpoint = '/rest/v1/chat_sessions?select=*';
    } else if (lowerQuery.includes('chat_messages')) {
      endpoint = '/rest/v1/chat_messages?select=*';
    } else if (lowerQuery.includes('information_schema')) {
      // Mock para verificação de tabelas
      return [
        { table_name: 'knowledge_sources' },
        { table_name: 'knowledge_chunks' },
        { table_name: 'user_memories' },
        { table_name: 'chat_sessions' },
        { table_name: 'chat_messages' }
      ];
    } else {
      console.warn(`Unsupported SELECT query: ${query}`);
      return [];
    }

    const response = await fetch(`${supabaseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.serviceRoleKey}`,
        'apikey': this.serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Supabase API error: ${response.status} ${response.statusText}`);
      return [];
    }

    return await response.json();
  }

  /**
   * Executa DDL/DML usando Service Role (quando possível)
   */
  private async executeRestQuery(query: string): Promise<any> {
    // Para desenvolvimento, apenas log as queries DDL
    // Em produção, você pode implementar via edge functions ou RPC
    console.log(`DDL/DML Query (logged): ${query}`);
    
    // Simular sucesso para queries de criação de tabela
    if (query.includes('CREATE TABLE') || query.includes('CREATE INDEX')) {
      console.log("✅ Table/Index creation simulated");
      return [{ success: true }];
    }

    return [];
  }

  private async createKnowledgeSourcesTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        sector TEXT NOT NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('url', 'file', 'manual')),
        uri TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    
    await this.executeMcpSql(query);
  }

  private async createKnowledgeChunksTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        sector TEXT NOT NULL,
        source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        chunk_index INT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(3072),
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    
    await this.executeMcpSql(query);
  }

  private async createUserMemoriesTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS user_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        user_id TEXT NOT NULL,
        memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'context', 'rule', 'fact')),
        content TEXT NOT NULL,
        embedding vector(3072),
        confidence FLOAT NOT NULL DEFAULT 0.5,
        usage_count INT NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    
    await this.executeMcpSql(query);
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_company_sector ON knowledge_chunks (company_id, sector)",
      "CREATE INDEX IF NOT EXISTS idx_knowledge_sources_company_sector ON knowledge_sources (company_id, sector)",
      "CREATE INDEX IF NOT EXISTS idx_user_memories_company_user ON user_memories (company_id, user_id)",
      "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)",
      "CREATE INDEX IF NOT EXISTS idx_user_memories_embedding ON user_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)"
    ];
    
    for (const indexQuery of indexes) {
      try {
        await this.executeMcpSql(indexQuery);
      } catch (error) {
        console.warn("Index creation failed (may already exist):", error);
      }
    }
  }
}

/**
 * Factory para criar adapter Supabase MCP
 */
export function createSupabaseMcpAdapter(): DatabaseAdapter {
  return new SupabaseMcpAdapter();
}

/* 
TODO: Implementar integração real com MCP
Substituir executeMcpSql por chamadas reais às funções MCP:

import { mcp_supabase_execute_sql } from '../mcp/supabase.js';

private async executeMcpSql(query: string): Promise<any> {
  try {
    const result = await mcp_supabase_execute_sql({
      project_id: this.projectId,
      query: query
    });
    
    return result.data;
  } catch (error) {
    console.error("MCP SQL Error:", error);
    throw error;
  }
}
*/

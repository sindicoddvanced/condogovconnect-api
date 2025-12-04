import type { ChatSession, ChatMessage } from "../types/ai.js";

/**
 * Interface para persistência de sessões de chat
 * Permite trocar implementação (memória, PostgreSQL, etc.)
 */
export interface SessionPersistence {
  // Sessões
  saveSession(session: ChatSession): Promise<void>;
  getSession(sessionId: string): Promise<ChatSession | null>;
  getUserSessions(userId: string, companyId: string): Promise<ChatSession[]>;
  deleteSession(sessionId: string): Promise<boolean>;
  updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null>;

  // Mensagens
  addMessage(sessionId: string, message: ChatMessage): Promise<void>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;
  updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage | null>;
  clearMessages(sessionId: string): Promise<void>;

  // Busca
  searchSessions(userId: string, companyId: string, query: string): Promise<ChatSession[]>;
  
  // Estatísticas
  getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    totalTokens: number;
    duration: number;
  } | null>;
}

/**
 * Implementação em memória (atual)
 * Para desenvolvimento e testes
 */
export class InMemorySessionPersistence implements SessionPersistence {
  private sessions: Map<string, ChatSession> = new Map();

  async saveSession(session: ChatSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async getUserSessions(userId: string, companyId: string): Promise<ChatSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId && session.companyId === companyId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    return { ...updatedSession };
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.messages.push({ ...message });
    session.updatedAt = new Date();

    // Atualizar título da sessão baseado na primeira mensagem do usuário
    if (session.messages.length === 1 && message.role === "user") {
      session.title = this.generateSessionTitle(message.content as string);
    }

    this.sessions.set(sessionId, session);
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = this.sessions.get(sessionId);
    return session ? [...session.messages] : [];
  }

  async updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const messageIndex = session.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return null;

    const updatedMessage = {
      ...session.messages[messageIndex],
      ...updates,
    };

    session.messages[messageIndex] = updatedMessage;
    session.updatedAt = new Date();
    this.sessions.set(sessionId, session);

    return { ...updatedMessage };
  }

  async clearMessages(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  async searchSessions(userId: string, companyId: string, query: string): Promise<ChatSession[]> {
    const userSessions = await this.getUserSessions(userId, companyId);
    const searchTerm = query.toLowerCase();

    return userSessions.filter(session => {
      // Buscar no título
      if (session.title.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Buscar nas mensagens
      return session.messages.some(message => {
        if (typeof message.content === "string") {
          return message.content.toLowerCase().includes(searchTerm);
        }
        return false;
      });
    });
  }

  async getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    totalTokens: number;
    duration: number;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const messageCount = session.messages.length;
    const totalTokens = session.messages.reduce(
      (sum, msg) => sum + (msg.tokens || 0),
      0
    );
    const duration = session.updatedAt.getTime() - session.createdAt.getTime();

    return { messageCount, totalTokens, duration };
  }

  private generateSessionTitle(firstMessage: string): string {
    // Gerar título baseado na primeira mensagem (limitado a 50 caracteres)
    const title =
      firstMessage.length > 50
        ? firstMessage.substring(0, 47) + "..."
        : firstMessage;

    return title || "Nova Conversa";
  }
}

/**
 * Implementação PostgreSQL (para produção)
 * Descomente e configure quando conectar ao banco
 */
/*
export class PostgreSQLSessionPersistence implements SessionPersistence {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async saveSession(session: ChatSession): Promise<void> {
    const query = `
      INSERT INTO chat_sessions (
        id, company_id, user_id, model, context_mode, sector, title, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        updated_at = EXCLUDED.updated_at
    `;

    await this.pool.query(query, [
      session.id,
      session.companyId,
      session.userId,
      session.model,
      session.contextMode,
      session.sector,
      session.title,
      session.createdAt,
      session.updatedAt,
    ]);
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const sessionQuery = `
      SELECT * FROM chat_sessions WHERE id = $1
    `;
    
    const messagesQuery = `
      SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY timestamp ASC
    `;

    const [sessionResult, messagesResult] = await Promise.all([
      this.pool.query(sessionQuery, [sessionId]),
      this.pool.query(messagesQuery, [sessionId]),
    ]);

    if (sessionResult.rows.length === 0) return null;

    const row = sessionResult.rows[0];
    const messages = messagesResult.rows.map(msgRow => ({
      id: msgRow.id,
      role: msgRow.role,
      content: msgRow.content,
      timestamp: new Date(msgRow.timestamp),
      model: msgRow.model,
      tokens: msgRow.tokens,
      favorite: msgRow.favorite,
    }));

    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      model: row.model,
      contextMode: row.context_mode,
      sector: row.sector,
      title: row.title,
      messages,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ... implementar outros métodos
}
*/

/**
 * Factory para criar instância de persistência
 */
export function createSessionPersistence(): SessionPersistence {
  // Fallback inteligente: usa Supabase se configurado; caso contrário, memória
  const hasSupabase = (!!process.env.SUPABASE_PROJECT_ID || !!process.env.SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (hasSupabase) {
    try {
      const { createSupabaseSessionPersistence } = require('./supabaseSessionPersistence.js');
      const { HybridSessionPersistence } = require('./hybridSessionPersistence.js');
      const supa = createSupabaseSessionPersistence();
      const memory = new InMemorySessionPersistence();
      return new HybridSessionPersistence(supa, memory);
    } catch (error) {
      console.warn("💬 Supabase session persistence unavailable, using in-memory persistence", error instanceof Error ? error.message : error);
      return new InMemorySessionPersistence();
    }
  }

  console.warn("💬 SUPABASE_* env não configurado. Usando InMemorySessionPersistence.");
  return new InMemorySessionPersistence();
}

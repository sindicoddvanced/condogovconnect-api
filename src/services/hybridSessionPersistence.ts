import type { ChatMessage, ChatSession } from "../types/ai.js";
import type { SessionPersistence } from "./sessionPersistence.js";

export class HybridSessionPersistence implements SessionPersistence {
  private primary: SessionPersistence;
  private fallback: SessionPersistence;
  private degraded = false;

  constructor(primary: SessionPersistence, fallback: SessionPersistence) {
    this.primary = primary;
    this.fallback = fallback;
  }

  private isConnectivityError(err: unknown): boolean {
    const anyErr: any = err as any;
    const msg = (anyErr?.message ? String(anyErr.message) : String(err)).toLowerCase();
    const code = String(anyErr?.code || "").toLowerCase();
    return (
      code === "connectionrefused" ||
      msg.includes("connectionrefused") ||
      msg.includes("unable to connect") ||
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("dns")
    );
  }

  private async try<T>(op: () => Promise<T>, fb: () => Promise<T>): Promise<T> {
    if (this.degraded) return fb();
    try {
      return await op();
    } catch (e) {
      console.warn("💬 Session persistence falling back to in-memory:", e);
      this.degraded = true;
      return fb();
    }
  }

  async saveSession(session: ChatSession): Promise<void> {
    return this.try(
      () => this.primary.saveSession(session),
      () => this.fallback.saveSession(session)
    );
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.try(
      () => this.primary.getSession(sessionId),
      () => this.fallback.getSession(sessionId)
    );
  }

  async getUserSessions(userId: string, companyId: string): Promise<ChatSession[]> {
    return this.try(
      () => this.primary.getUserSessions(userId, companyId),
      () => this.fallback.getUserSessions(userId, companyId)
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.try(
      () => this.primary.deleteSession(sessionId),
      () => this.fallback.deleteSession(sessionId)
    );
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    return this.try(
      () => this.primary.updateSession(sessionId, updates),
      () => this.fallback.updateSession(sessionId, updates)
    );
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    return this.try(
      async () => {
        // Tentar adicionar mensagem no primary (Supabase)
        await this.primary.addMessage(sessionId, message);
      },
      async () => {
        // Fallback: buscar sessão do primary primeiro e adicionar ao fallback
        const session = await this.primary.getSession(sessionId).catch(() => null);
        if (session) {
          // Sincronizar sessão para fallback antes de adicionar mensagem
          await this.fallback.saveSession(session);
        }
        await this.fallback.addMessage(sessionId, message);
      }
    );
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.try(
      () => this.primary.getMessages(sessionId),
      () => this.fallback.getMessages(sessionId)
    );
  }

  async updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage | null> {
    return this.try(
      () => this.primary.updateMessage(sessionId, messageId, updates),
      () => this.fallback.updateMessage(sessionId, messageId, updates)
    );
  }

  async clearMessages(sessionId: string): Promise<void> {
    return this.try(
      () => this.primary.clearMessages(sessionId),
      () => this.fallback.clearMessages(sessionId)
    );
  }

  async searchSessions(userId: string, companyId: string, query: string): Promise<ChatSession[]> {
    return this.try(
      () => this.primary.searchSessions(userId, companyId, query),
      () => this.fallback.searchSessions(userId, companyId, query)
    );
  }

  async getSessionStats(sessionId: string): Promise<{ messageCount: number; totalTokens: number; duration: number } | null> {
    return this.try(
      () => this.primary.getSessionStats(sessionId),
      () => this.fallback.getSessionStats(sessionId)
    );
  }
}



import type { ChatSession, ChatMessage } from "../types/ai.js";
import type { SessionPersistence } from "./sessionPersistence.js";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";

export class SupabaseSessionPersistence implements SessionPersistence {
  private supabase = getSupabaseServiceClient();

  async saveSession(session: ChatSession): Promise<void> {
    const payload = {
      id: session.id,
      company_id: session.companyId,
      user_id: session.userId,
      model: session.model,
      context_mode: session.contextMode,
      sector: session.sector ?? null,
      title: session.title,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
    };

    const { error } = await this.supabase
      .from("chat_sessions")
      .upsert(payload, { onConflict: "id" });

    if (error) throw error;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const [sessionRes, messagesRes] = await Promise.all([
      this.supabase.from("chat_sessions").select("*").eq("id", sessionId).maybeSingle(),
      this.supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("timestamp", { ascending: true }),
    ]);

    if (sessionRes.error) throw sessionRes.error;
    if (!sessionRes.data) return null;

    const row = sessionRes.data as any;
    const messages = (messagesRes.data || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      model: m.model ?? undefined,
      tokens: m.tokens ?? undefined,
      favorite: m.favorite ?? undefined,
    }));

    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      model: row.model,
      contextMode: row.context_mode,
      sector: row.sector ?? undefined,
      title: row.title,
      messages,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async getUserSessions(userId: string, companyId: string): Promise<ChatSession[]> {
    const { data, error } = await this.supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      model: row.model,
      contextMode: row.context_mode,
      sector: row.sector ?? undefined,
      title: row.title,
      messages: [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) throw error;
    return true;
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.title) payload.title = updates.title;
    if (updates.sector !== undefined) payload.sector = updates.sector;
    if (updates.contextMode) payload.context_mode = updates.contextMode;
    if (updates.model) payload.model = updates.model;

    const { data, error } = await this.supabase
      .from("chat_sessions")
      .update(payload)
      .eq("id", sessionId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      companyId: data.company_id,
      userId: data.user_id,
      model: data.model,
      contextMode: data.context_mode,
      sector: data.sector ?? undefined,
      title: data.title,
      messages: [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const payload = {
      id: message.id,
      session_id: sessionId,
      role: message.role,
      content: message.content,
      model: message.model ?? null,
      favorite: message.favorite ?? false,
      tokens: message.tokens ?? 0,
      timestamp: message.timestamp.toISOString(),
    };

    const { error } = await this.supabase
      .from("chat_messages")
      .insert(payload);

    if (error) throw error;
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true });

    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      model: m.model ?? undefined,
      tokens: m.tokens ?? undefined,
      favorite: m.favorite ?? undefined,
    }));
  }

  async updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage | null> {
    const payload: any = {};
    if (updates.favorite !== undefined) payload.favorite = updates.favorite;
    if (updates.tokens !== undefined) payload.tokens = updates.tokens;

    const { data, error } = await this.supabase
      .from("chat_messages")
      .update(payload)
      .eq("id", messageId)
      .eq("session_id", sessionId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      role: data.role,
      content: data.content,
      timestamp: new Date(data.timestamp),
      model: data.model ?? undefined,
      tokens: data.tokens ?? undefined,
      favorite: data.favorite ?? undefined,
    };
  }

  async clearMessages(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from("chat_messages")
      .delete()
      .eq("session_id", sessionId);
    if (error) throw error;

    const { error: sessionErr } = await this.supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (sessionErr) throw sessionErr;
  }

  async searchSessions(userId: string, companyId: string, query: string): Promise<ChatSession[]> {
    // Busca básica por título; extensão para conteúdo via RPC/FTS pode ser feita depois
    const { data, error } = await this.supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .ilike("title", `%${query}%`)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      model: row.model,
      contextMode: row.context_mode,
      sector: row.sector ?? undefined,
      title: row.title,
      messages: [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async getSessionStats(sessionId: string): Promise<{ messageCount: number; totalTokens: number; duration: number } | null> {
    const [{ data: session, error: sErr }, { data: messages, error: mErr }] = await Promise.all([
      this.supabase.from("chat_sessions").select("created_at,updated_at").eq("id", sessionId).maybeSingle(),
      this.supabase.from("chat_messages").select("tokens").eq("session_id", sessionId),
    ]);

    if (sErr) throw sErr;
    if (mErr) throw mErr;
    if (!session) return null;

    const totalTokens = (messages || []).reduce((sum: number, m: any) => sum + (m.tokens || 0), 0);
    const created = new Date((session as any).created_at);
    const updated = new Date((session as any).updated_at);
    const duration = updated.getTime() - created.getTime();

    return { messageCount: (messages || []).length, totalTokens, duration };
  }
}

export function createSupabaseSessionPersistence(): SessionPersistence {
  return new SupabaseSessionPersistence();
}






import type { ChatSession, ChatMessage, QuickSuggestion } from "../types/ai.js";
import { createSessionPersistence, type SessionPersistence } from "./sessionPersistence.js";

export class ChatService {
  private persistence: SessionPersistence;
  private quickSuggestions: QuickSuggestion[] = [
    {
      id: "perf_1",
      category: "performance",
      title: "Análise de Performance de Projetos",
      prompt:
        "Analise a performance dos projetos em andamento e identifique possíveis atrasos ou problemas.",
      icon: "📊",
    },
    {
      id: "fin_1",
      category: "financial",
      title: "Previsão Financeira Mensal",
      prompt:
        "Faça uma previsão financeira para os próximos 3 meses baseada nos dados atuais de receitas e despesas.",
      icon: "💰",
    },
    {
      id: "fin_2",
      category: "financial",
      title: "Análise de Inadimplência",
      prompt:
        "Analise os índices de inadimplência e sugira estratégias para redução.",
      icon: "📈",
    },
    {
      id: "maint_1",
      category: "maintenance",
      title: "Plano de Manutenção Preventiva",
      prompt:
        "Crie um plano de manutenção preventiva baseado no histórico de problemas e idade dos equipamentos.",
      icon: "🔧",
    },
    {
      id: "maint_2",
      category: "maintenance",
      title: "Priorização de Reparos",
      prompt:
        "Priorize os reparos pendentes por urgência, custo e impacto na qualidade de vida dos moradores.",
      icon: "⚡",
    },
    {
      id: "legal_1",
      category: "legal",
      title: "Revisão de Convenção",
      prompt:
        "Identifique pontos da convenção que precisam ser atualizados conforme a legislação atual.",
      icon: "⚖️",
    },
    {
      id: "legal_2",
      category: "legal",
      title: "Análise de Multas e Penalidades",
      prompt:
        "Revise as multas aplicadas e verifique se estão de acordo com a convenção e legislação.",
      icon: "📋",
    },
    {
      id: "res_1",
      category: "resident",
      title: "Análise de Satisfação",
      prompt:
        "Analise o nível de satisfação dos moradores e sugira melhorias nos serviços.",
      icon: "😊",
    },
    {
      id: "res_2",
      category: "resident",
      title: "Comunicação com Moradores",
      prompt:
        "Sugira estratégias para melhorar a comunicação e engajamento dos moradores.",
      icon: "📢",
    },
  ];

  constructor() {
    this.persistence = createSessionPersistence();
  }

  async createSession(userId: string, model: string): Promise<ChatSession> {
    return this.createSessionWithContext(userId, model, "general");
  }

  async createSessionWithContext(
    userId: string,
    model: string,
    contextMode: "general" | "sector" = "general",
    sector?: string,
    companyId?: string
  ): Promise<ChatSession> {
    const sessionId = this.generateSessionId();
    const session: ChatSession = {
      id: sessionId,
      title: "Nova Conversa",
      messages: [],
      model,
      contextMode,
      sector,
      companyId: companyId || "default",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId,
    };
    console.log("[ChatService] saving session", sessionId);
    await this.persistence.saveSession(session);
    console.log("[ChatService] saved session", sessionId);
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.persistence.getSession(sessionId);
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    return this.persistence.updateSession(sessionId, updates);
  }

  async getUserSessions(userId: string, companyId: string): Promise<ChatSession[]> {
    return this.persistence.getUserSessions(userId, companyId);
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<ChatSession | null> {
    await this.persistence.addMessage(sessionId, message);
    return this.persistence.getSession(sessionId);
  }

  async updateMessage(
    sessionId: string,
    messageId: string,
    updates: { favorite?: boolean; tokens?: number }
  ): Promise<ChatMessage | null> {
    return this.persistence.updateMessage(sessionId, messageId, updates);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.persistence.deleteSession(sessionId);
  }

  async clearSession(sessionId: string): Promise<ChatSession | null> {
    await this.persistence.clearMessages(sessionId);
    return this.persistence.getSession(sessionId);
  }

  getQuickSuggestions(): QuickSuggestion[] {
    return this.quickSuggestions;
  }

  getQuickSuggestionsByCategory(category: string): QuickSuggestion[] {
    return this.quickSuggestions.filter(
      (suggestion) => suggestion.category === category
    );
  }

  async exportSession(sessionId: string): Promise<string | null> {
    const session = await this.persistence.getSession(sessionId);
    if (!session) {
      return null;
    }

    const exportData = {
      session: {
        id: session.id,
        title: session.title,
        model: session.model,
        contextMode: session.contextMode,
        sector: session.sector,
        companyId: session.companyId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      messages: session.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        model: msg.model,
        tokens: msg.tokens,
        favorite: msg.favorite,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  async getSessionStats(
    sessionId: string
  ): Promise<{ messageCount: number; totalTokens: number; duration: number } | null> {
    return this.persistence.getSessionStats(sessionId);
  }

  async searchSessions(userId: string, companyId: string, query: string): Promise<ChatSession[]> {
    return this.persistence.searchSessions(userId, companyId, query);
  }

  private generateSessionId(): string {
    // Usar crypto.randomUUID() para gerar UUID válido (compatível com banco de dados)
    // Fallback para formato antigo se crypto não estiver disponível (não deve acontecer em Bun/Node moderno)
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

  private generateSessionTitle(firstMessage: string): string {
    // Gerar título baseado na primeira mensagem (limitado a 50 caracteres)
    const title =
      firstMessage.length > 50
        ? firstMessage.substring(0, 47) + "..."
        : firstMessage;

    return title || "Nova Conversa";
  }
}

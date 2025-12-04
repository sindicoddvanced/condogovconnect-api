import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";
import { SUPABASE_PROJECT_ID, mcp_supabase_execute_sql } from "../mcp-functions.js";

type PushExtraData = Record<string, unknown>;

export type SendPushResult = {
  success: boolean;
  message?: string;
  metrics: {
    totalTokensFound: number;
    validExpoTokens: number;
    ticketsSent: number;
  };
  details?: {
    invalidTokens?: string[];
    usedTokens?: string[];
  };
};

const expo = new Expo();

export class PushNotificationService {
  /**
   * Busca tokens na tabela push_tokens usando MCP (com fallback Supabase client).
   * Espera coluna employee_id e push_token; device_id e platform são opcionais.
   */
  private async fetchEmployeeTokens(employeeId: string, companyId?: string): Promise<string[]> {
    const employee = employeeId.replace(/'/g, "''");
    const company = companyId ? companyId.replace(/'/g, "''") : null;
    const where = company
      ? `WHERE employee_id = '${employee}' AND company_id = '${company}'`
      : `WHERE employee_id = '${employee}'`;
    const query = `
      SELECT push_token
      FROM push_tokens
      ${where}
      AND push_token IS NOT NULL
      AND length(trim(push_token)) > 0
    `;

    // 1) Tentar via MCP
    try {
      const rows = await mcp_supabase_execute_sql({
        project_id: SUPABASE_PROJECT_ID,
        query,
      });
      if (Array.isArray(rows) && rows.length) {
        return rows
          .map((r: any) => String(r.push_token || "").trim())
          .filter(Boolean);
      }
    } catch (e) {
      // segue para fallback
    }

    // 2) Fallback via Supabase client
    try {
      const supabase = getSupabaseServiceClient();
      let sel = supabase.from("push_tokens").select("push_token").eq("employee_id", employeeId);
      if (companyId) sel = sel.eq("company_id", companyId);
      const { data, error } = await sel;
      if (error) throw error;
      return (data || [])
        .map((r: any) => String(r.push_token || "").trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Envia push notifications para um employee_id.
   */
  async sendToEmployee(
    employeeId: string,
    title: string,
    body: string,
    data?: PushExtraData,
    companyId?: string
  ): Promise<SendPushResult> {
    const tokens = await this.fetchEmployeeTokens(employeeId, companyId);
    const totalTokensFound = tokens.length;

    if (totalTokensFound === 0) {
      return {
        success: false,
        message: "Nenhum token encontrado para este funcionário",
        metrics: { totalTokensFound, validExpoTokens: 0, ticketsSent: 0 },
      };
    }

    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) {
      return {
        success: false,
        message: "Nenhum token Expo válido encontrado",
        metrics: { totalTokensFound, validExpoTokens: 0, ticketsSent: 0 },
        details: { invalidTokens: tokens.filter((t) => !Expo.isExpoPushToken(t)) },
      };
    }

    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data: data || {},
    }));

    const chunks = expo.chunkPushNotifications(messages);
    let sent = 0;

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        sent += tickets.length;
      } catch {
        // continuar com os demais chunks
      }
    }

    return {
      success: sent > 0,
      message: sent > 0 ? "Notificações enviadas" : "Falha ao enviar notificações",
      metrics: {
        totalTokensFound,
        validExpoTokens: validTokens.length,
        ticketsSent: sent,
      },
      details: { usedTokens: validTokens },
    };
  }
}



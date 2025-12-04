import { Hono } from "hono";
import { z } from "zod";
import { PushNotificationService } from "../services/pushNotificationService.js";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";

const notifications = new Hono();
const service = new PushNotificationService();

const SendSchema = z.object({
  employeeId: z.string().min(1, "employeeId é obrigatório"),
  title: z.string().min(1, "title é obrigatório"),
  body: z.string().min(1, "body é obrigatório"),
  data: z.record(z.any()).optional(),
});

const RegisterSchema = z.object({
  employeeId: z.string().min(1, "employeeId é obrigatório"),
  pushToken: z.string().min(1, "pushToken é obrigatório"),
  deviceId: z.string().optional(),
  platform: z.enum(["ios","android","unknown"]).default("unknown").optional(),
});

// POST /notifications/send - envia push para um employee_id usando tokens em push_tokens
notifications.post("/send", async (c) => {
  try {
    const body = await c.req.json();
    const validation = SendSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { success: false, error: "Dados inválidos", details: validation.error.issues },
        400
      );
    }

    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");
    if (!companyId || !userId) {
      return c.json(
        { success: false, error: "Headers x-company-id e x-user-id são obrigatórios" },
        400
      );
    }

    const { employeeId, title, body: message, data } = validation.data;
    const result = await service.sendToEmployee(employeeId, title, message, data, companyId);

    return c.json({ success: result.success, data: result });
  } catch (error) {
    console.error("Error in /notifications/send:", error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});

// POST /notifications/register-token - registra/atualiza token para employee_id na tabela push_tokens
notifications.post("/register-token", async (c) => {
  try {
    const body = await c.req.json();
    const validation = RegisterSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { success: false, error: "Dados inválidos", details: validation.error.issues },
        400
      );
    }

    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");
    if (!companyId || !userId) {
      return c.json(
        { success: false, error: "Headers x-company-id e x-user-id são obrigatórios" },
        400
      );
    }

    const { employeeId, pushToken, deviceId, platform = "unknown" } = validation.data;

    const supabase = getSupabaseServiceClient();
    // upsert por (employee_id, push_token)
    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        [
          {
            employee_id: employeeId,
            company_id: companyId,
            push_token: pushToken,
            device_id: deviceId || null,
            platform,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "employee_id,push_token", ignoreDuplicates: false }
      );

    if (error) {
      return c.json({ success: false, error: error.message || String(error) }, 500);
    }

    return c.json({ success: true, data: { employeeId, pushToken, platform, deviceId } });
  } catch (error) {
    console.error("Error in /notifications/register-token:", error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});

export { notifications };



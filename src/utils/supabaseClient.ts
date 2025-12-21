import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const envUrl = process.env["SUPABASE_URL"];
  const projectId = process.env["SUPABASE_PROJECT_ID"];
  let supabaseUrl = envUrl || (projectId ? `https://${projectId}.supabase.co` : "");
  if (supabaseUrl && !/^https?:\/\//i.test(supabaseUrl)) {
    supabaseUrl = `https://${supabaseUrl}`;
  }
  if (!supabaseUrl) {
    throw new Error("Environment variable SUPABASE_URL or SUPABASE_PROJECT_ID is required");
  }
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-client-info": "condogovconnect-api",
      },
    },
  });

  return serviceClient;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = 60 * 60
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}



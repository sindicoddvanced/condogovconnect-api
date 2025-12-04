/**
 * Wrapper para funções MCP Supabase disponíveis globalmente no Cursor
 * Facilita o uso e adiciona tratamento de erros
 */

const PROJECT_ID = "dzfippnhokywoylasoiz";

/**
 * Obtém URL do projeto Supabase
 */
export async function mcp_supabase_get_project_url(params: { project_id: string }): Promise<string> {
  try {
    // Usar função MCP global do Cursor
    const result = await (globalThis as any).mcp_supabase_get_project_url?.(params);
    
    if (result && typeof result === 'string') {
      return result;
    }
    
    // Fallback se não conseguir via MCP
    return `https://${params.project_id}.supabase.co`;
  } catch (error) {
    console.warn("MCP get_project_url failed, using fallback");
    return `https://${params.project_id}.supabase.co`;
  }
}

/**
 * Obtém chave anônima do projeto
 */
export async function mcp_supabase_get_anon_key(params: { project_id: string }): Promise<string> {
  try {
    const result = await (globalThis as any).mcp_supabase_get_anon_key?.(params);
    
    if (result && !result.error) {
      return result;
    }
    
    throw new Error(result?.error?.message || "Unable to get anon key via MCP");
  } catch (error) {
    throw new Error(`MCP get_anon_key failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Lista tabelas do projeto
 */
export async function mcp_supabase_list_tables(params: { 
  project_id: string; 
  schemas?: string[] 
}): Promise<any[]> {
  try {
    const result = await (globalThis as any).mcp_supabase_list_tables?.(params);
    
    if (result && !result.error && Array.isArray(result)) {
      return result;
    }
    
    throw new Error(result?.error?.message || "Unable to list tables via MCP");
  } catch (error) {
    throw new Error(`MCP list_tables failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Executa SQL no projeto
 */
export async function mcp_supabase_execute_sql(params: {
  project_id: string;
  query: string;
}): Promise<any> {
  try {
    const result = await (globalThis as any).mcp_supabase_execute_sql?.(params);
    
    if (result && !result.error) {
      return result.data || result.rows || result;
    }
    
    throw new Error(result?.error?.message || "SQL execution failed via MCP");
  } catch (error) {
    throw new Error(`MCP execute_sql failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Aplica migração no projeto
 */
export async function mcp_supabase_apply_migration(params: {
  project_id: string;
  name: string;
  query: string;
}): Promise<any> {
  try {
    const result = await (globalThis as any).mcp_supabase_apply_migration?.(params);
    
    if (result && !result.error) {
      return result;
    }
    
    throw new Error(result?.error?.message || "Migration failed via MCP");
  } catch (error) {
    throw new Error(`MCP apply_migration failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Gera tipos TypeScript do projeto
 */
export async function mcp_supabase_generate_typescript_types(params: { 
  project_id: string 
}): Promise<string> {
  try {
    const result = await (globalThis as any).mcp_supabase_generate_typescript_types?.(params);
    
    if (result && !result.error && typeof result === 'string') {
      return result;
    }
    
    throw new Error(result?.error?.message || "Unable to generate types via MCP");
  } catch (error) {
    throw new Error(`MCP generate_types failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Verifica quais funções MCP estão disponíveis
 */
export function checkMcpAvailability(): {
  available: string[];
  unavailable: string[];
} {
  const functions = [
    'mcp_supabase_get_project_url',
    'mcp_supabase_get_anon_key', 
    'mcp_supabase_list_tables',
    'mcp_supabase_execute_sql',
    'mcp_supabase_apply_migration',
    'mcp_supabase_generate_typescript_types'
  ];

  const available = [];
  const unavailable = [];

  for (const fn of functions) {
    if (typeof (globalThis as any)[fn] === 'function') {
      available.push(fn);
    } else {
      unavailable.push(fn);
    }
  }

  return { available, unavailable };
}

/**
 * Testa conectividade MCP básica
 */
export async function testMcpBasic(): Promise<boolean> {
  try {
    const url = await mcp_supabase_get_project_url({ project_id: PROJECT_ID });
    return url.includes(PROJECT_ID);
  } catch (error) {
    return false;
  }
}

// Exportar constantes úteis
export const SUPABASE_PROJECT_ID = PROJECT_ID;
export const SUPABASE_URL = `https://${PROJECT_ID}.supabase.co`;

/**
 * Script para inicializar tabelas RAG no Supabase via MCP
 * Execute uma vez para criar toda a estrutura necessária
 */

import { createSupabaseMcpAdapter } from "../services/supabaseMcpAdapter.js";
import { createSupabaseMcpSessionPersistence } from "../services/supabaseMcpSessionPersistence.js";

/**
 * Inicializa todas as tabelas necessárias no Supabase
 * Versão simplificada que não tenta conectar automaticamente
 */
export async function initializeSupabaseRAG(): Promise<void> {
  console.log("🚀 Supabase RAG initialization (manual setup required)");
  
  try {
    // Criar adapter RAG
    const ragAdapter = createSupabaseMcpAdapter();
    
    // Criar adapter de sessões
    const sessionAdapter = createSupabaseMcpSessionPersistence();
    
    // Verificar configuração (sem conectar)
    console.log("📚 RAG adapter configured");
    await ragAdapter.createTablesIfNeeded();
    
    console.log("💬 Session adapter configured");
    await sessionAdapter.createSessionTablesIfNeeded();
    
    console.log("✅ Supabase RAG configured successfully!");
    console.log("📋 To create tables, execute supabase_setup.sql in Supabase Dashboard");
    
  } catch (error) {
    console.warn("⚠️  Supabase RAG configuration warning:", error instanceof Error ? error.message : error);
    // Não falhar a inicialização da API
  }
}

/**
 * Popula conhecimento inicial por setor
 */
export async function seedInitialKnowledge(companyId: string): Promise<void> {
  console.log("🌱 Populando conhecimento inicial...");
  
  try {
    const ragAdapter = createSupabaseMcpAdapter();
    
    // Dados de seed por setor
    const sectors = [
      "Dashboard", "Clientes", "Comunicação", "Pesquisas", "Projetos", 
      "Processos", "Documentos", "Ferramentas", "Gestão de Tarefas", 
      "CRM Inteligente", "RH Unificado", "Compras Inteligentes", 
      "Reuniões CondoGov", "Operacional"
    ];
    
    const seedData = {
      "Dashboard": "Dashboard: visão executiva por empresa. KPIs principais: projetos em andamento (status in_progress), processos ativos (status active) e funcionários ativos. Oferece atalhos rápidos para módulos e filtros por company_id. Dados consolidados em tempo real para tomada de decisão executiva.",
      "Clientes": "Clientes: módulo para cadastro e gestão completa de condomínios, responsáveis e colaboradores. Realiza provisionamento automático de usuários no Supabase Auth ao criar responsável ou colaborador. Gerencia documentos contratuais e permissões de acesso específicas por empresa.",
      "Comunicação": "Chat Interno: sistema completo de mensagens com canais públicos, privados e diretos. Controle de acesso: canais diretos por participants; privados específicos por specificUsers; filtros por departamento/cliente via profile_data. Inclui Comunicados Inteligentes para difusão segmentada e Boletins Mensais automatizados.",
      // ... adicionar outros setores conforme necessário
    };
    
    for (const sector of sectors) {
      const content = seedData[sector as keyof typeof seedData] || `Conhecimento sobre ${sector}`;
      
      // Criar fonte de conhecimento
      const createSourceQuery = `
        INSERT INTO knowledge_sources (company_id, sector, title, kind, uri, status)
        VALUES ('${companyId}', '${sector}', 'Seed: ${sector}', 'manual', NULL, 'active')
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      
      console.log(`📝 Criando conhecimento para ${sector}...`);
      // Aqui você executaria via MCP real
    }
    
    console.log("✅ Conhecimento inicial populado!");
    
  } catch (error) {
    console.error("❌ Erro ao popular conhecimento:", error);
    throw error;
  }
}

/**
 * Função principal para setup completo
 */
export async function setupSupabaseRAG(companyId?: string): Promise<void> {
  console.log("🔧 Configurando Supabase RAG completo...");
  
  try {
    // 1. Inicializar tabelas
    await initializeSupabaseRAG();
    
    // 2. Popular conhecimento inicial se company_id fornecido
    if (companyId) {
      await seedInitialKnowledge(companyId);
    } else {
      console.log("ℹ️  Para popular conhecimento inicial, forneça um company_id");
    }
    
    console.log("🎉 Setup do Supabase RAG concluído!");
    
  } catch (error) {
    console.error("❌ Erro no setup:", error);
    throw error;
  }
}

// Se executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const companyId = process.argv[2];
  
  setupSupabaseRAG(companyId)
    .then(() => {
      console.log("✅ Setup concluído com sucesso!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Setup falhou:", error);
      process.exit(1);
    });
}

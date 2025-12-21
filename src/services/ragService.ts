import type {
  KnowledgeChunk,
  KnowledgeCitation,
  UserMemory,
  RequestContext,
  RAGConfig,
} from "../types/ai.js";
import { EmbeddingService } from "./embeddingService.js";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";

/**
 * Interface para database adapter (permite trocar de Postgres para outros BDs)
 */
export interface DatabaseAdapter {
  searchKnowledgeChunks(
    companyId: string,
    queryEmbedding: number[],
    sector?: string,
    limit?: number,
    threshold?: number
  ): Promise<KnowledgeCitation[]>;
  
  searchUserMemories(
    companyId: string,
    userId: string,
    queryEmbedding: number[],
    limit?: number
  ): Promise<UserMemory[]>;
  
  updateMemoryUsage(memoryId: string): Promise<void>;
  
  saveUserMemory(memory: Omit<UserMemory, "id" | "createdAt">): Promise<UserMemory>;
}

/**
 * Serviço RAG (Retrieval-Augmented Generation)
 * Combina busca semântica com memória do usuário para respostas contextualizadas
 */
export class RAGService {
  private embeddingService: EmbeddingService;
  private db: DatabaseAdapter;
  private defaultConfig: RAGConfig = {
    maxChunks: 8,
    similarityThreshold: 0.7,
    useMemory: true,
    memoryWeight: 0.3,
  };

  constructor(databaseAdapter: DatabaseAdapter) {
    this.embeddingService = new EmbeddingService();
    this.db = databaseAdapter;
  }

  /**
   * Busca conhecimento relevante baseado na query do usuário
   */
  async retrieveKnowledge(
    query: string,
    context: RequestContext,
    config: Partial<RAGConfig> = {}
  ): Promise<{
    citations: KnowledgeCitation[];
    memories: UserMemory[];
    queryEmbedding: number[];
  }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Gerar embedding da query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Buscar chunks de conhecimento
      let citations = await this.db.searchKnowledgeChunks(
        context.companyId,
        queryEmbedding,
        context.contextMode === "sector" ? context.sector : undefined,
        finalConfig.maxChunks,
        finalConfig.similarityThreshold
      );

      // Se vazio (pode ser por falta de embedding no chunk), tente uma busca "aberta" reduzida
      if (!citations || citations.length === 0) {
        citations = [];
      }

      // Buscar dados reais das tabelas do banco baseado no setor E na pergunta
      // Busca dados mesmo se o setor não corresponder diretamente à pergunta
      // SEMPRE buscar dados reais, independente do contextMode
      try {
        console.log(`[RAG] Buscando dados reais para setor: ${context.sector || 'geral'}, query: "${query.substring(0, 50)}..."`);
        const realDataCitations = await this.retrieveRealDataFromTables(
          query,
          context
        );
        // Combinar com citações de knowledge_chunks
        citations = [...citations, ...realDataCitations];
        console.log(`[RAG] Encontrados ${realDataCitations.length} registros reais do banco`);
      } catch (error) {
        console.warn("[RAG] Erro ao buscar dados reais das tabelas:", error instanceof Error ? error.message : error);
        // Continuar mesmo se falhar
      }

      // Buscar memórias do usuário (se habilitado)
      let memories: UserMemory[] = [];
      if (finalConfig.useMemory) {
        memories = await this.db.searchUserMemories(
          context.companyId,
          context.userId,
          queryEmbedding,
          Math.ceil(finalConfig.maxChunks * finalConfig.memoryWeight)
        );

        // Atualizar contadores de uso das memórias
        for (const memory of memories) {
          await this.db.updateMemoryUsage(memory.id);
        }
      }

      return {
        citations,
        memories,
        queryEmbedding,
      };
    } catch (error) {
      console.error("Error in RAG retrieval:", error);
      throw new Error(
        `Failed to retrieve knowledge: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Busca dados reais das tabelas do banco baseado no setor e na pergunta
   * Usa Supabase client ao invés de SQL direto
   */
  private async retrieveRealDataFromTables(
    query: string,
    context: RequestContext
  ): Promise<KnowledgeCitation[]> {
    const supabase = getSupabaseServiceClient();
    const sector = context.sector?.toLowerCase() || "";
    const queryLower = query.toLowerCase();
    const citations: KnowledgeCitation[] = [];

    try {
      // Detectar se a pergunta é sobre CRM
      const isAboutCRM = 
        queryLower.includes("crm") || 
        queryLower.includes("cliente") || 
        queryLower.includes("lead") ||
        queryLower.includes("negócio") ||
        queryLower.includes("negocio") ||
        queryLower.includes("deal") ||
        queryLower.includes("proposta") ||
        queryLower.includes("venda");

      // Buscar dados de CRM se a pergunta for sobre CRM
      if (isAboutCRM) {
        console.log(`[RAG] Buscando dados de CRM para query: "${query.substring(0, 50)}..."`);
        const crmCitations = await this.retrieveCRMData(supabase, queryLower);
        citations.push(...crmCitations);
        console.log(`[RAG] Encontrados ${crmCitations.length} registros de CRM`);
      }

      // Buscar dados por setor/pergunta
      const sectorData = await this.retrieveSectorData(supabase, sector, queryLower, query);
      citations.push(...sectorData);
      console.log(`[RAG] Encontrados ${sectorData.length} registros do setor ${sector || 'geral'}`);

    } catch (error) {
      console.error("[RAG] Erro geral ao buscar dados reais:", error);
    }

    return citations;
  }

  /**
   * Busca dados de CRM usando Supabase client
   */
  private async retrieveCRMData(supabase: any, queryLower: string): Promise<KnowledgeCitation[]> {
    const citations: KnowledgeCitation[] = [];

    try {
      // Buscar clientes/condomínios
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, status, type, email, phone, score, last_interaction_at, next_action, notes, monthly_value")
        .limit(20);

      if (!clientsError && clients && clients.length > 0) {
        const clientCitations = clients.map((client: any, index: number) => ({
          chunkId: `crm_client_${index}_${Date.now()}`,
          sourceId: `crm_clients`,
          sector: "CRM",
          content: `Cliente: ${client.name} | Status: ${client.status} | Tipo: ${client.type} | Score: ${client.score || 0} | Última interação: ${client.last_interaction_at || 'N/A'} | Próxima ação: ${client.next_action || 'N/A'} | Valor mensal: ${client.monthly_value || 0}`,
          score: 0.9,
          tags: ["crm", "cliente", client.status, client.type],
        }));
        citations.push(...clientCitations);
      }

      // Buscar deals/negócios
      const { data: deals, error: dealsError } = await supabase
        .from("crm_deals")
        .select("id, title, company_name, total_value, status, probability, expected_close_date, cycle_days")
        .limit(20);

      if (!dealsError && deals && deals.length > 0) {
        const dealCitations = deals.map((deal: any, index: number) => ({
          chunkId: `crm_deal_${index}_${Date.now()}`,
          sourceId: `crm_deals`,
          sector: "CRM",
          content: `Negócio: ${deal.title} | Empresa: ${deal.company_name} | Valor: ${deal.total_value || 0} | Status: ${deal.status} | Probabilidade: ${deal.probability || 0}% | Fechamento esperado: ${deal.expected_close_date || 'N/A'} | Ciclo: ${deal.cycle_days || 0} dias`,
          score: 0.9,
          tags: ["crm", "deal", "negócio", deal.status],
        }));
        citations.push(...dealCitations);
      }

      // Buscar propostas
      const { data: proposals, error: proposalsError } = await supabase
        .from("proposals")
        .select("id, condo_name, status, priority, score, monthly_budget, num_units, last_contact_date, follow_up_date")
        .limit(20);

      if (!proposalsError && proposals && proposals.length > 0) {
        const proposalCitations = proposals.map((proposal: any, index: number) => ({
          chunkId: `crm_proposal_${index}_${Date.now()}`,
          sourceId: `crm_proposals`,
          sector: "CRM",
          content: `Proposta: ${proposal.condo_name} | Status: ${proposal.status} | Prioridade: ${proposal.priority} | Score: ${proposal.score || 0} | Orçamento mensal: ${proposal.monthly_budget || 'N/A'} | Unidades: ${proposal.num_units || 0} | Último contato: ${proposal.last_contact_date || 'N/A'}`,
          score: 0.9,
          tags: ["crm", "proposta", proposal.status, proposal.priority],
        }));
        citations.push(...proposalCitations);
      }

      // Buscar oportunidades de cross-sell
      const { data: opportunities, error: opportunitiesError } = await supabase
        .from("crm_cross_sell_opportunities")
        .select("id, client_name, current_product, opportunity_description, revenue_potential, ai_score, status, priority")
        .limit(20);

      if (!opportunitiesError && opportunities && opportunities.length > 0) {
        const oppCitations = opportunities.map((opp: any, index: number) => ({
          chunkId: `crm_opportunity_${index}_${Date.now()}`,
          sourceId: `crm_opportunities`,
          sector: "CRM",
          content: `Oportunidade: ${opp.client_name} | Produto atual: ${opp.current_product} | Descrição: ${opp.opportunity_description} | Potencial de receita: ${opp.revenue_potential || 0} | Score IA: ${opp.ai_score || 0} | Status: ${opp.status} | Prioridade: ${opp.priority}`,
          score: 0.9,
          tags: ["crm", "oportunidade", "cross-sell", opp.status],
        }));
        citations.push(...oppCitations);
      }

      // Buscar metas do CRM
      const { data: goals, error: goalsError } = await supabase
        .from("crm_goals")
        .select("id, title, type, target_value, current_value, unit, period, category, is_active")
        .eq("is_active", true)
        .limit(10);

      if (!goalsError && goals && goals.length > 0) {
        const goalCitations = goals.map((goal: any, index: number) => ({
          chunkId: `crm_goal_${index}_${Date.now()}`,
          sourceId: `crm_goals`,
          sector: "CRM",
          content: `Meta: ${goal.title} | Tipo: ${goal.type} | Meta: ${goal.target_value} ${goal.unit} | Atual: ${goal.current_value || 0} ${goal.unit} | Período: ${goal.period} | Categoria: ${goal.category}`,
          score: 0.85,
          tags: ["crm", "meta", goal.type, goal.category],
        }));
        citations.push(...goalCitations);
      }

      // Buscar funcionários do CRM
      const { data: employees, error: employeesError } = await supabase
        .from("crm_employees")
        .select("id, name, role, department, revenue_current, revenue_target, deals_closed, deals_target")
        .eq("is_active", true)
        .limit(10);

      if (!employeesError && employees && employees.length > 0) {
        const empCitations = employees.map((emp: any, index: number) => ({
          chunkId: `crm_employee_${index}_${Date.now()}`,
          sourceId: `crm_employees`,
          sector: "CRM",
          content: `Funcionário: ${emp.name} | Cargo: ${emp.role} | Departamento: ${emp.department} | Receita atual: ${emp.revenue_current || 0} | Meta receita: ${emp.revenue_target || 0} | Deals fechados: ${emp.deals_closed || 0} | Meta deals: ${emp.deals_target || 0}`,
          score: 0.85,
          tags: ["crm", "funcionário", emp.role, emp.department],
        }));
        citations.push(...empCitations);
      }

    } catch (error) {
      console.warn("[RAG] Erro ao buscar dados de CRM:", error instanceof Error ? error.message : error);
    }

    return citations;
  }

  /**
   * Busca dados por setor usando Supabase client
   */
  private async retrieveSectorData(
    supabase: any,
    sector: string,
    queryLower: string,
    originalQuery: string
  ): Promise<KnowledgeCitation[]> {
    const citations: KnowledgeCitation[] = [];

    try {
      // Detectar se a pergunta é sobre manutenção
      const isAboutMaintenance = 
        queryLower.includes("manutenção") || 
        queryLower.includes("manutencao") || 
        queryLower.includes("manuten") ||
        (queryLower.includes("condomínio") || queryLower.includes("condominio")) && 
          (queryLower.includes("precisa") || queryLower.includes("urgente") || queryLower.includes("urgent")) ||
        originalQuery.toLowerCase().includes("manutenção") ||
        originalQuery.toLowerCase().includes("manutencao");

      // Manutenção
      if (isAboutMaintenance || sector.includes("manutenção") || sector.includes("manutencao")) {
        // Ordens de manutenção urgentes
        const { data: maintenanceOrders, error: moError } = await supabase
          .from("condominium_maintenance_orders")
          .select(`
            id, title, description, priority, status, request_date, scheduled_date,
            clients(name)
          `)
          .in("priority", ["urgent", "high"])
          .in("status", ["open", "scheduled"])
          .order("priority", { ascending: false })
          .order("request_date", { ascending: false })
          .limit(20);

        if (!moError && maintenanceOrders && maintenanceOrders.length > 0) {
          const moCitations = maintenanceOrders.map((order: any, index: number) => ({
            chunkId: `maintenance_order_${index}_${Date.now()}`,
            sourceId: `maintenance_orders`,
            sector: "Manutenção",
            content: `Condomínio: ${order.clients?.name || 'N/A'} | Ordem: ${order.title} | Descrição: ${order.description} | Prioridade: ${order.priority} | Status: ${order.status} | Data solicitação: ${order.request_date || 'N/A'} | Data agendada: ${order.scheduled_date || 'N/A'}`,
            score: 0.9,
            tags: ["manutenção", "ordem", order.priority, order.status],
          }));
          citations.push(...moCitations);
        }

        // Equipamentos com problemas
        if (queryLower.includes("equipamento") || queryLower.includes("equipment") || queryLower.includes("quebrado")) {
          const { data: equipments, error: eqError } = await supabase
            .from("equipments")
            .select(`
              id, name, type, status, location, last_maintenance, next_maintenance,
              clients(name)
            `)
            .in("status", ["broken", "maintenance"])
            .limit(20);

          if (!eqError && equipments && equipments.length > 0) {
            const eqCitations = equipments.map((eq: any, index: number) => ({
              chunkId: `equipment_${index}_${Date.now()}`,
              sourceId: `equipments`,
              sector: "Manutenção",
              content: `Condomínio: ${eq.clients?.name || 'N/A'} | Equipamento: ${eq.name} | Tipo: ${eq.type} | Status: ${eq.status} | Localização: ${eq.location || 'N/A'} | Última manutenção: ${eq.last_maintenance || 'N/A'} | Próxima manutenção: ${eq.next_maintenance || 'N/A'}`,
              score: 0.9,
              tags: ["manutenção", "equipamento", eq.status],
            }));
            citations.push(...eqCitations);
          }
        }
      }

      // Comunicação
      if (sector.includes("comunicação") || sector.includes("comunicacao") || queryLower.includes("comunicado") || queryLower.includes("mensagem") || queryLower.includes("anúncio")) {
        const { data: comunicados, error: comError } = await supabase
          .from("comunicados")
          .select(`
            id, titulo, conteudo, status, prioridade, enviado_em, categoria,
            clients(name)
          `)
          .in("status", ["enviado", "published"])
          .order("enviado_em", { ascending: false })
          .limit(20);

        if (!comError && comunicados && comunicados.length > 0) {
          const comCitations = comunicados.map((com: any, index: number) => ({
            chunkId: `comunicado_${index}_${Date.now()}`,
            sourceId: `comunicados`,
            sector: "Comunicação",
            content: `Condomínio: ${com.clients?.name || 'N/A'} | Título: ${com.titulo} | Conteúdo: ${com.conteudo?.substring(0, 200) || ''} | Status: ${com.status} | Prioridade: ${com.prioridade || 'normal'} | Enviado em: ${com.enviado_em || 'N/A'} | Categoria: ${com.categoria || 'N/A'}`,
            score: 0.9,
            tags: ["comunicação", "comunicado", com.status, com.categoria],
          }));
          citations.push(...comCitations);
        }
      }

      // Financeiro
      if (sector.includes("financeiro") || queryLower.includes("pendente") || queryLower.includes("vencido") || queryLower.includes("pagamento") || queryLower.includes("financeiro")) {
        const { data: financialRecords, error: frError } = await supabase
          .from("condominium_financial_records")
          .select(`
            id, type, category, description, amount, status, due_date, payment_date,
            clients(name)
          `)
          .in("status", ["pending", "overdue"])
          .order("due_date", { ascending: true })
          .limit(20);

        if (!frError && financialRecords && financialRecords.length > 0) {
          const frCitations = financialRecords.map((fr: any, index: number) => ({
            chunkId: `financial_record_${index}_${Date.now()}`,
            sourceId: `financial_records`,
            sector: "Financeiro",
            content: `Condomínio: ${fr.clients?.name || 'N/A'} | Tipo: ${fr.type} | Categoria: ${fr.category} | Descrição: ${fr.description} | Valor: ${fr.amount || 0} | Status: ${fr.status} | Vencimento: ${fr.due_date || 'N/A'} | Pagamento: ${fr.payment_date || 'Pendente'}`,
            score: 0.9,
            tags: ["financeiro", fr.type, fr.status],
          }));
          citations.push(...frCitations);
        }
      }

      // Projetos
      if (sector.includes("projeto") || sector.includes("projetos") || queryLower.includes("andamento") || queryLower.includes("atrasado") || queryLower.includes("status") || queryLower.includes("projeto")) {
        const { data: projects, error: projError } = await supabase
          .from("projects")
          .select(`
            id, title, description, status, progress, priority, start_date, end_date, actual_end_date,
            clients(name)
          `)
          .in("status", ["in_progress", "not_started"])
          .order("priority", { ascending: false })
          .order("end_date", { ascending: true })
          .limit(20);

        if (!projError && projects && projects.length > 0) {
          const projCitations = projects.map((proj: any, index: number) => ({
            chunkId: `project_${index}_${Date.now()}`,
            sourceId: `projects`,
            sector: "Projetos",
            content: `Cliente: ${proj.clients?.name || proj.client_name || 'N/A'} | Projeto: ${proj.title} | Descrição: ${proj.description?.substring(0, 200) || ''} | Status: ${proj.status} | Progresso: ${proj.progress || 0}% | Prioridade: ${proj.priority} | Início: ${proj.start_date || 'N/A'} | Fim: ${proj.end_date || 'N/A'}`,
            score: 0.9,
            tags: ["projeto", proj.status, proj.priority],
          }));
          citations.push(...projCitations);
        }
      }

      // Tarefas
      if (sector.includes("tarefa") || sector.includes("tarefas") || sector.includes("task") || queryLower.includes("pendente") || queryLower.includes("urgente") || queryLower.includes("atrasada") || queryLower.includes("tarefa")) {
        const { data: tasks, error: taskError } = await supabase
          .from("tasks")
          .select("id, title, description, status, priority, due_date, progress, project_id")
          .in("status", ["todo", "not_started", "in_progress"])
          .order("priority", { ascending: false })
          .order("due_date", { ascending: true })
          .limit(20);

        if (!taskError && tasks && tasks.length > 0) {
          // Buscar informações dos projetos para as tarefas que têm project_id
          const projectIds = tasks.filter((t: any) => t.project_id).map((t: any) => t.project_id);
          let projectsMap: Record<string, any> = {};
          
          if (projectIds.length > 0) {
            const { data: projects } = await supabase
              .from("projects")
              .select("id, title, client_id, clients(name)")
              .in("id", projectIds);
            
            if (projects) {
              projectsMap = projects.reduce((acc: any, p: any) => {
                acc[p.id] = p;
                return acc;
              }, {});
            }
          }

          const taskCitations = tasks.map((task: any, index: number) => {
            const project = task.project_id ? projectsMap[task.project_id] : null;
            return {
              chunkId: `task_${index}_${Date.now()}`,
              sourceId: `tasks`,
              sector: "Tarefas",
              content: `Cliente: ${project?.clients?.name || 'N/A'} | Tarefa: ${task.title} | Descrição: ${task.description?.substring(0, 200) || ''} | Status: ${task.status} | Prioridade: ${task.priority} | Vencimento: ${task.due_date || 'N/A'} | Progresso: ${task.progress || 0}%`,
              score: 0.9,
              tags: ["tarefa", task.status, task.priority],
            };
          });
          citations.push(...taskCitations);
        }
      }

      // Busca genérica de condomínios se a query mencionar "condomínio"
      if (queryLower.includes("condomínio") || queryLower.includes("condominio") || originalQuery.toLowerCase().includes("condomínio") || originalQuery.toLowerCase().includes("condominio")) {
        const { data: condominios, error: condError } = await supabase
          .from("clients")
          .select("id, name, status, type, address")
          .limit(20);

        if (!condError && condominios && condominios.length > 0) {
          const condCitations = condominios.map((cond: any, index: number) => ({
            chunkId: `condominio_${index}_${Date.now()}`,
            sourceId: `clients`,
            sector: "Geral",
            content: `Condomínio: ${cond.name} | Status: ${cond.status} | Tipo: ${cond.type} | Endereço: ${typeof cond.address === 'object' ? JSON.stringify(cond.address) : cond.address || 'N/A'}`,
            score: 0.85,
            tags: ["condomínio", cond.status, cond.type],
          }));
          citations.push(...condCitations);
        }
      }

    } catch (error) {
      console.warn("[RAG] Erro ao buscar dados do setor:", error instanceof Error ? error.message : error);
    }

    return citations;
  }

  /**
   * DEPRECATED: Este método não é mais usado
   * As queries agora são feitas diretamente via Supabase client em retrieveSectorData
   * Mantido apenas para referência/compatibilidade
   */
  private getSectorQueries(
    sector: string,
    query: string,
    companyId: string,
    originalQuery: string
  ): string[] {
    const queries: string[] = [];

    // Detectar se a pergunta é sobre manutenção (independente do setor atual)
    const queryWords = query.split(/\s+/);
    const isAboutMaintenance = 
      query.includes("manutenção") || 
      query.includes("manutencao") || 
      query.includes("manuten") ||
      (query.includes("condomínio") || query.includes("condominio")) && 
        (query.includes("precisa") || query.includes("urgente") || query.includes("urgent")) ||
      originalQuery.toLowerCase().includes("manutenção") ||
      originalQuery.toLowerCase().includes("manutencao");

    // Manutenção - buscar se a pergunta for sobre manutenção OU se o setor for manutenção
    // OU se a pergunta menciona "condomínios" + "urgente/precisa"
    if (isAboutMaintenance || sector.includes("manutenção") || sector.includes("manutencao") ||
        ((query.includes("condomínio") || query.includes("condominio")) && 
         (query.includes("urgent") || query.includes("urgente") || query.includes("precisa")))) {
      // Ordens de manutenção urgentes
      // REMOVIDO filtro company_id - busca em todas as tabelas
      queries.push(`
        SELECT 
          c.name as condominio,
          cmo.title,
          cmo.description,
          cmo.priority,
          cmo.status,
          cmo.request_date,
          cmo.scheduled_date,
          cu.block,
          cu.number as unit_number
        FROM condominium_maintenance_orders cmo
        JOIN clients c ON c.id = cmo.client_id
        LEFT JOIN condominium_units cu ON cu.id = cmo.unit_id
        WHERE (cmo.priority = 'urgent' OR cmo.status = 'open' OR cmo.priority = 'high')
        ORDER BY 
          CASE cmo.priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            ELSE 3 
          END,
          cmo.request_date DESC
        LIMIT 20
      `);

      // Equipamentos com problemas
      if (query.includes("equipamento") || query.includes("equipment") || query.includes("quebrado")) {
        queries.push(`
          SELECT 
            c.name as condominio,
            e.name as equipamento,
            e.type,
            e.status,
            e.location,
            e.last_maintenance,
            e.next_maintenance
          FROM equipments e
          JOIN clients c ON c.id = e.client_id
          WHERE (e.status = 'broken' OR e.status = 'maintenance')
          LIMIT 20
        `);
      }

      // Previsões de manutenção
      if (query.includes("previsão") || query.includes("previsao") || query.includes("predição")) {
        queries.push(`
          SELECT 
            c.name as condominio,
            e.name as equipamento,
            pm.probabilidade_falha,
            pm.severidade_risco,
            pm.dias_estimados,
            pm.recomendacoes_ia
          FROM predicao_manutencao pm
          JOIN equipments e ON e.id = pm.equipamento_id
          JOIN clients c ON c.id = e.client_id
          WHERE pm.status_predicao = 'ativa'
            AND (pm.severidade_risco = 'alto' OR pm.severidade_risco = 'critico')
          ORDER BY pm.probabilidade_falha DESC
          LIMIT 20
        `);
      }
    }

    // Comunicação
    if (sector.includes("comunicação") || sector.includes("comunicacao") || query.includes("comunicado") || query.includes("mensagem") || query.includes("anúncio")) {
      // Comunicados recentes
      queries.push(`
        SELECT 
          c.name as condominio,
          com.titulo,
          com.conteudo,
          com.status,
          com.prioridade,
          com.enviado_em,
          com.categoria
        FROM comunicados com
        LEFT JOIN clients c ON c.id = com.client_id
        WHERE com.status IN ('enviado', 'published')
        ORDER BY com.enviado_em DESC
        LIMIT 20
      `);
    }

    // Financeiro
    if (sector.includes("financeiro") || query.includes("pendente") || query.includes("vencido") || query.includes("pagamento") || query.includes("financeiro")) {
      // Registros financeiros pendentes/vencidos
      queries.push(`
        SELECT 
          c.name as condominio,
          cfr.type,
          cfr.category,
          cfr.description,
          cfr.amount,
          cfr.status,
          cfr.due_date,
          cfr.payment_date
        FROM condominium_financial_records cfr
        JOIN clients c ON c.id = cfr.client_id
        WHERE (cfr.status = 'pending' OR cfr.status = 'overdue')
        ORDER BY cfr.due_date ASC
        LIMIT 20
      `);
    }

    // Projetos
    if (sector.includes("projeto") || sector.includes("projetos") || query.includes("andamento") || query.includes("atrasado") || query.includes("status") || query.includes("projeto")) {
      // Projetos em andamento ou atrasados
      queries.push(`
        SELECT 
          p.title,
          p.description,
          p.status,
          p.progress,
          p.priority,
          p.start_date,
          p.end_date,
          p.actual_end_date,
          c.name as client_name
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.status IN ('in_progress', 'not_started')
        ORDER BY 
          CASE p.priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            ELSE 3 
          END,
          p.end_date ASC
        LIMIT 20
      `);
    }

    // Tarefas
    if (sector.includes("tarefa") || sector.includes("tarefas") || sector.includes("task") || query.includes("pendente") || query.includes("urgente") || query.includes("atrasada") || query.includes("tarefa")) {
      // Tarefas pendentes ou urgentes
      queries.push(`
        SELECT 
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_date,
          t.progress,
          c.name as client_name
        FROM tasks t
        LEFT JOIN clients c ON c.id = (SELECT client_id FROM projects WHERE id = t.project_id LIMIT 1)
        WHERE t.status IN ('todo', 'not_started', 'in_progress')
        ORDER BY 
          CASE t.priority 
            WHEN 'urgent' THEN 1 
            WHEN 'critical' THEN 2 
            WHEN 'high' THEN 3 
            ELSE 4 
          END,
          t.due_date ASC
        LIMIT 20
      `);
    }

    // Se não encontrou queries específicas, fazer busca genérica
    // Buscar condomínios/clientes (sem filtro de company_id)
    if (queries.length === 0) {
      queries.push(`
        SELECT 
          c.name,
          c.status,
          c.type,
          COUNT(DISTINCT cu.id) as total_units,
          COUNT(DISTINCT cr.id) as total_residents
        FROM clients c
        LEFT JOIN condominium_units cu ON cu.client_id = c.id
        LEFT JOIN condominium_residents cr ON cr.client_id = c.id
        GROUP BY c.id, c.name, c.status, c.type
        LIMIT 10
      `);
    }
    
    // SEMPRE adicionar busca genérica de condomínios se a query mencionar "condomínio"
    if (query.includes("condomínio") || query.includes("condominio") || originalQuery.toLowerCase().includes("condomínio") || originalQuery.toLowerCase().includes("condominio")) {
      queries.push(`
        SELECT 
          c.id,
          c.name as condominio,
          c.status,
          c.type,
          c.address,
          COUNT(DISTINCT cu.id) as total_units,
          COUNT(DISTINCT cr.id) as total_residents
        FROM clients c
        LEFT JOIN condominium_units cu ON cu.client_id = c.id
        LEFT JOIN condominium_residents cr ON cr.client_id = c.id
        GROUP BY c.id, c.name, c.status, c.type, c.address
        LIMIT 20
      `);
    }

    return queries;
  }

  /**
   * Formata resultados de tabelas como citações
   */
  private formatTableResultsAsCitations(
    results: any[],
    sector: string,
    sqlQuery: string
  ): KnowledgeCitation[] {
    return results.map((row, index) => {
      // Criar conteúdo descritivo do registro
      const contentParts: string[] = [];
      
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined) {
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          contentParts.push(`${formattedKey}: ${value}`);
        }
      }

      const content = contentParts.join(' | ');

      return {
        chunkId: `table_${sector}_${index}_${Date.now()}`,
        sourceId: `table_${sector}`,
        sector: sector,
        content: content,
        score: 0.9, // Alta relevância pois são dados reais
        tags: [sector, 'database', 'real_data'],
      };
    });
  }

  /**
   * Monta prompt enriquecido com contexto RAG
   */
  buildEnrichedPrompt(
    originalQuery: string,
    citations: KnowledgeCitation[],
    memories: UserMemory[],
    context: RequestContext
  ): string {
    let enrichedPrompt = "";

    // Contexto da empresa e setor (sem mencionar IDs técnicos)
    enrichedPrompt += `CONTEXTO DA CONSULTA:\n`;
    enrichedPrompt += `- Usuário: ${context.userId}\n`;
    enrichedPrompt += `- Modo: ${context.contextMode}${
      context.sector ? ` (Setor: ${context.sector})` : ""
    }\n\n`;

    // Memórias do usuário (personalizações)
    if (memories.length > 0) {
      enrichedPrompt += `MEMÓRIAS DO USUÁRIO (use para personalizar a resposta):\n`;
      memories.forEach((memory, index) => {
        enrichedPrompt += `${index + 1}. [${memory.memoryType.toUpperCase()}] ${memory.content}\n`;
      });
      enrichedPrompt += `\n`;
    }

    // Conhecimento da base (RAG)
    if (citations.length > 0) {
      enrichedPrompt += `CONHECIMENTO RELEVANTE:\n`;
      citations.forEach((citation, index) => {
        enrichedPrompt += `${index + 1}. [${citation.sector}] ${citation.content}\n`;
        if (citation.tags && citation.tags.length > 0) {
          enrichedPrompt += `   Tags: ${citation.tags.join(", ")}\n`;
        }
      });
      enrichedPrompt += `\n`;
    } else {
      enrichedPrompt += `CONHECIMENTO RELEVANTE: (nenhum conteúdo indexado encontrado)\n\n`;
    }

    // Query original do usuário
    enrichedPrompt += `PERGUNTA DO USUÁRIO:\n${originalQuery}\n\n`;

    // Instruções para a IA
    enrichedPrompt += `INSTRUÇÕES:\n`;
    enrichedPrompt += `- Use o conhecimento relevante acima para responder com precisão\n`;
    enrichedPrompt += `- Considere as memórias do usuário para personalizar a resposta\n`;
    enrichedPrompt += `- Se não houver informação suficiente, seja claro sobre as limitações\n`;
    enrichedPrompt += `- Cite as fontes quando apropriado\n`;
    enrichedPrompt += `- NUNCA mencione IDs técnicos de empresa, usuário ou sistema nas respostas\n`;
    enrichedPrompt += `- Mantenha o foco no contexto ${
      context.contextMode === "sector" ? `do setor ${context.sector}` : "geral da empresa"
    }\n`;

    return enrichedPrompt;
  }

  /**
   * Extrai possíveis memórias da conversa para salvar
   */
  async extractMemories(
    userMessage: string,
    assistantResponse: string,
    context: RequestContext
  ): Promise<void> {
    try {
      // Lógica simples de extração de memórias
      // Em produção, você pode usar um modelo menor ou regras mais sofisticadas
      
      const memoryPatterns = [
        // Preferências explícitas
        /eu prefiro|gosto de|não gosto|sempre|nunca|costumo/i,
        // Contexto específico da empresa
        /nosso condomínio|nossa empresa|nosso setor/i,
        // Regras e políticas
        /nossa política|nossa regra|procedimento|protocolo/i,
      ];

      for (const pattern of memoryPatterns) {
        if (pattern.test(userMessage)) {
          const memoryContent = this.extractRelevantSentence(userMessage, pattern);
          if (memoryContent) {
            await this.saveMemory({
              companyId: context.companyId,
              userId: context.userId,
              memoryType: this.classifyMemoryType(memoryContent),
              content: memoryContent,
              confidence: 0.7,
              usageCount: 0,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error extracting memories:", error);
      // Não falhar a operação principal se extração de memória falhar
    }
  }

  /**
   * Salva uma nova memória do usuário
   */
  private async saveMemory(
    memory: Omit<UserMemory, "id" | "createdAt" | "embedding">
  ): Promise<void> {
    try {
      const embedding = await this.embeddingService.generateEmbedding(memory.content);
      
      await this.db.saveUserMemory({
        ...memory,
        embedding,
      });
    } catch (error) {
      console.error("Error saving memory:", error);
    }
  }

  /**
   * Classifica o tipo de memória baseado no conteúdo
   */
  private classifyMemoryType(content: string): "preference" | "context" | "rule" | "fact" {
    if (/prefiro|gosto|não gosto/i.test(content)) return "preference";
    if (/política|regra|procedimento|protocolo/i.test(content)) return "rule";
    if (/nosso|nossa|empresa|condomínio/i.test(content)) return "context";
    return "fact";
  }

  /**
   * Extrai sentença relevante baseada no padrão encontrado
   */
  private extractRelevantSentence(text: string, pattern: RegExp): string | null {
    const sentences = text.split(/[.!?]+/);
    const relevantSentence = sentences.find(sentence => pattern.test(sentence));
    return relevantSentence?.trim() || null;
  }

  /**
   * Retorna estatísticas do serviço RAG
   */
  getStats() {
    return {
      embeddingModel: this.embeddingService.getModelInfo(),
      defaultConfig: this.defaultConfig,
      version: "1.0.0",
    };
  }
}

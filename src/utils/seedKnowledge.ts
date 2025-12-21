import { getSupabaseServiceClient } from "../utils/supabaseClient.js";
import { EmbeddingService } from "../services/embeddingService.js";

type SeedItem = {
  sector: string;
  title: string;
  content: string;
  tags: string[];
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

export async function seedKnowledge(companyId: string, options?: { clear?: boolean }) {
  const doClear = !!options?.clear;

  const supabase = getSupabaseServiceClient();
  const embed = new EmbeddingService();

  const seeds: SeedItem[] = [
    // Projetos
    {
      sector: "Projetos",
      title: "Política de Atrasos de Projetos",
      content:
        "Projetos são considerados atrasados quando a data de término prevista é ultrapassada e o percentual concluído é inferior a 100%. Projetos com avanço abaixo de 80% a 15 dias do prazo são classificados como em risco.",
      tags: ["projetos", "atrasos", "gestao"],
    },
    {
      sector: "Projetos",
      title: "Regras de Priorização",
      content:
        "Em situações de atraso, priorizar projetos por impacto financeiro, criticidade de segurança e dependências entre frentes. Relatórios semanais devem sinalizar risco antes de 15 dias do prazo final.",
      tags: ["projetos", "priorizacao", "riscos"],
    },
    // Financeiro
    {
      sector: "Financeiro",
      title: "Política de Inadimplência",
      content:
        "Inadimplência é caracterizada por atraso superior a 30 dias no pagamento. Ações: notificação automática em 5 dias, acordo em até 60 dias, e encaminhamento jurídico a partir de 90 dias.",
      tags: ["financeiro", "inadimplencia", "cobranca"],
    },
    {
      sector: "Financeiro",
      title: "Critérios de Previsão Orçamentária",
      content:
        "A previsão orçamentária anual deve considerar média histórica de despesas, calendário de sazonalidades (água/energia), provisões para manutenção corretiva e taxa de inadimplência esperada.",
      tags: ["financeiro", "orcamento", "previsao"],
    },
    // Manutenção
    {
      sector: "Manutenção",
      title: "Plano de Manutenção Preventiva",
      content:
        "Equipamentos críticos (elevadores, bombas, geradores) devem ter manutenção preventiva mensal ou trimestral conforme manual do fabricante. Registros devem ser arquivados e auditáveis.",
      tags: ["manutencao", "preventiva", "equipamentos"],
    },
    {
      sector: "Manutenção",
      title: "SLA de Atendimento de Chamados",
      content:
        "Chamados críticos (segurança, riscos de danos) devem ser atendidos em até 4 horas. Não críticos: até 48 horas. Itens planejados seguem janela semanal previamente acordada.",
      tags: ["manutencao", "sla", "chamados"],
    },
    // Comunicação
    {
      sector: "Comunicação",
      title: "Boas Práticas de Comunicação com Moradores",
      content:
        "Usar canais oficiais (aplicativo, e-mail validado e murais). Responder dúvidas em até 48h úteis. Evitar informações sensíveis em grupos informais.",
      tags: ["comunicacao", "moradores", "boas-praticas"],
    },
    {
      sector: "Comunicação",
      title: "Padronização de Comunicados",
      content:
        "Todo comunicado deve conter: assunto, contexto, ação requerida, prazos, canal de suporte e responsável. Padrão de linguagem clara e objetiva.",
      tags: ["comunicacao", "comunicados", "padrao"],
    },
    // Financeiro extra
    {
      sector: "Financeiro",
      title: "Previsão de Caixa",
      content:
        "A previsão de caixa deve considerar receitas recorrentes, inadimplência média, despesas fixas e sazonais, e reservas técnicas para manutenção.",
      tags: ["financeiro", "caixa", "previsao"],
    },
    // Manutenção extra
    {
      sector: "Manutenção",
      title: "Rotina de Inspeção Mensal",
      content:
        "Realizar inspeção mensal das áreas comuns (iluminação, extintores, corrimãos, pisos), registrando achados e prazos de correção em checklist padronizado.",
      tags: ["manutencao", "inspecao", "checklist"],
    },
  ];

  if (doClear) {
    console.log(`Limpando conhecimento da empresa ${companyId}...`);
    // Apagar chunks primeiro, depois sources
    const { error: chErr } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("company_id", companyId);
    if (chErr) console.warn("Aviso ao limpar chunks:", chErr.message || chErr);
    const { error: srcErr } = await supabase
      .from("knowledge_sources")
      .delete()
      .eq("company_id", companyId);
    if (srcErr) console.warn("Aviso ao limpar sources:", srcErr.message || srcErr);
  }

  let ok = 0, fail = 0;
  for (const item of seeds) {
    try {
      console.log(`→ Ingerindo: [${item.sector}] ${item.title}`);
      const embedding = await embed.generateEmbedding(item.content);

      // Upsert source
      let sourceId: string | undefined;
      const { data: srcFind } = await supabase
        .from("knowledge_sources")
        .select("id")
        .eq("company_id", companyId)
        .eq("sector", item.sector)
        .eq("title", item.title)
        .maybeSingle();
      if (srcFind?.id) {
        sourceId = srcFind.id as string;
      } else {
        const { data: srcIns, error: srcErr } = await supabase
          .from("knowledge_sources")
          .insert({
            company_id: companyId,
            sector: item.sector,
            title: item.title,
            kind: "manual",
            status: "active",
          })
          .select("id")
          .maybeSingle();
        if (srcErr) throw srcErr;
        sourceId = srcIns?.id as string;
      }

      // Insert chunk
      const { data: chunkIns, error: chunkErr } = await supabase
        .from("knowledge_chunks")
        .insert({
          company_id: companyId,
          sector: item.sector,
          source_id: sourceId,
          chunk_index: 0,
          content: item.content,
          tags: item.tags,
        })
        .select("id")
        .maybeSingle();
      if (chunkErr) throw chunkErr;
      const chunkId = chunkIns?.id as string;

      // Try update embedding directly with numeric array
      const { error: upErr } = await supabase
        .from("knowledge_chunks")
        .update({ embedding })
        .eq("id", chunkId);
      if (upErr) console.warn("! embedding update falhou:", upErr.message || upErr);
      ok++;
    } catch (e) {
      console.error("x falha ao ingerir:", e instanceof Error ? e.message : e);
      fail++;
    }
  }

  console.log(`Seed concluído. Sucesso: ${ok}, Falhas: ${fail}`);
  return { ok, fail };
}

async function main() {
  const companyId = getArg("--company") || process.env.COMPANY_ID;
  const doClear = process.argv.includes("--clear");
  if (!companyId) {
    console.error("Usage: bun run src/utils/seedKnowledge.ts --company <UUID> [--clear]");
    process.exit(1);
  }
  try {
    const r = await seedKnowledge(companyId, { clear: doClear });
    process.exit(r.fail > 0 ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

// Executa apenas via CLI
if (process.argv[1]?.includes("seedKnowledge.ts")) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main();
}



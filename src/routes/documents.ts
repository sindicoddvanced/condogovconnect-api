import { Hono } from "hono";
import { z } from "zod";
import { DocumentService } from "../services/documentService.js";
import type { RequestContext } from "../types/ai.js";
import { EmbeddingService } from "../services/embeddingService.js";
import { getSupabaseServiceClient } from "../utils/supabaseClient.js";
import { seedKnowledge as runSeedKnowledge } from "../utils/seedKnowledge.js";
import OpenAI from "openai";
import * as XLSX from "xlsx";
import Papa from "papaparse";
// pdf-parse has no ESM default in some bundlers; require fallback
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

const documents = new Hono();
const documentService = new DocumentService();
const embeddingService = new EmbeddingService();
const supabase = getSupabaseServiceClient();

// Helper para extrair contexto dos headers
function extractRequestContext(c: any, body: any): RequestContext {
  const companyId = c.req.header("x-company-id");
  const userId = c.req.header("x-user-id") || body.userId;
  
  if (!companyId) {
    throw new Error("Header x-company-id é obrigatório");
  }
  
  if (!userId) {
    throw new Error("Header x-user-id é obrigatório");
  }

  return {
    companyId,
    userId,
    contextMode: body.contextMode || "general",
    sector: body.sector,
  };
}

// Schemas de validação
const GenerateDocumentSchema = z.object({
  prompt: z.string().min(10, "Prompt deve ter pelo menos 10 caracteres"),
  documentType: z.enum(["pdf", "docx"]),
  templateId: z.string().optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
  metadata: z.object({
    sector: z.string().min(1, "Setor é obrigatório"),
    category: z.string().min(1, "Categoria é obrigatória"),
    tags: z.array(z.string()),
  }),
});

const TranscribeAudioSchema = z.object({
  audioUrl: z.string().url().optional(),
  companyId: z.string().min(1, "Company ID é obrigatório"),
  meetingId: z.string().optional(),
  options: z.object({
    language: z.enum(["pt-BR", "en-US", "es-ES"]).default("pt-BR"),
    speakerIdentification: z.boolean().default(false),
    actionItemExtraction: z.boolean().default(true),
    agendaGeneration: z.boolean().default(true),
    keyPointsExtraction: z.boolean().default(true),
    sentimentAnalysis: z.boolean().default(false),
    autoTranslation: z.boolean().default(false),
    targetLanguage: z.string().optional(),
  }),
});

const SummarizeMinuteSchema = z.object({
  minuteId: z.string().min(1, "ID da ata é obrigatório"),
  minuteContent: z.string().optional(),
  summaryType: z.enum(["executive", "detailed", "action_items", "decisions"]),
  companyId: z.string().min(1, "Company ID é obrigatório"),
});

// POST /documents/generate - Gerar documento com IA
documents.post("/generate", async (c) => {
  try {
    const body = await c.req.json();
    const validation = GenerateDocumentSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    const context = extractRequestContext(c, validation.data);
    const result = await documentService.generateDocument(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /documents/generate:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /documents/extract/schema-from-table?table=public_table&mode=withUnitNumber|direct
// Gera um schema dinâmico a partir da tabela do banco, adequado ao endpoint /extract
documents.get("/extract/schema-from-table", async (c) => {
  try {
    const table = c.req.query("table");
    const mode = c.req.query("mode") || "direct"; // especial p/ residents: direct (unit_id) | withUnitNumber
    if (!table) {
      return c.json({ success: false, error: "Parâmetro 'table' é obrigatório" }, 400);
    }

    // Buscar colunas em information_schema
    // Alguns ambientes não expõem information_schema via PostgREST.
    // Fallback: tentar pg_catalog via RPC inexistente -> capturamos erro e instruímos o cliente.
    let cols: any[] | null = null;
    try {
      const tryCols = await supabase
        .from("information_schema.columns")
        .select("column_name,data_type,is_nullable,ordinal_position")
        .eq("table_schema", "public")
        .eq("table_name", table)
        .order("ordinal_position", { ascending: true });
      if (tryCols.error) throw tryCols.error;
      cols = tryCols.data || [];
    } catch (e) {
      return c.json({
        success: false,
        error: "information_schema.columns não acessível via PostgREST com a role atual"
      }, 500);
    }

    // Mapear tipos
    function mapType(dt: string): "string" | "number" | "boolean" | "date" {
      const t = dt.toLowerCase();
      if (t.includes("boolean")) return "boolean";
      if (t.includes("int") || t.includes("numeric") || t.includes("double") || t.includes("real") || t.includes("decimal")) return "number";
      if (t.includes("timestamp") || t.includes("date")) return "date";
      return "string";
    }

    // Excluir campos gerenciados pelo servidor/BD
    const exclude = new Set([
      "id",
      "company_id",
      "client_id",
      "created_at",
      "updated_at",
      "embedding", // em knowledge_chunks
    ]);

    // Campos finais (por padrão, todos os não-excluídos)
    let fields = (cols || [])
      .filter((c: any) => !exclude.has(String(c.column_name)))
      .map((c: any) => ({
        name: c.column_name as string,
        type: mapType(String(c.data_type)),
        required: String(c.is_nullable).toLowerCase() === "no" ? true : undefined,
      }));

    // Regras especiais para condominium_residents
    if (table === "condominium_residents" && mode === "withUnitNumber") {
      // Substituir unit_id por unitNumber + block
      fields = fields.filter(f => f.name !== "unit_id");
      fields.unshift({ name: "unitNumber", type: "string", required: true });
      fields.unshift({ name: "block", type: "string" });
    }

    // output config padrão por tabela
    function getOutputForTable(tbl: string) {
      if (tbl === "condominium_units") {
        return {
          type: "array",
          itemName: "unit",
          dedupeBy: ["number", "block"],
          target: { table: "condominium_units", upsertKeys: ["company_id", "number", "block"] },
        };
      }
      if (tbl === "condominium_residents") {
        return {
          type: "array",
          itemName: "resident",
          dedupeBy: mode === "withUnitNumber" ? ["unitNumber", "name"] : ["unit_id", "name"],
          target: { table: "condominium_residents", upsertKeys: ["company_id", "unit_id", "name"] },
        };
      }
      // fallback genérico
      return {
        type: "array",
        itemName: "item",
        target: { table: tbl },
      };
    }

    const schema = {
      entity: table.replace(/^.+?_/, ""), // heurística simples
      description: `Schema dinâmico para importar dados na tabela ${table}`,
      fields,
      output: getOutputForTable(table),
      locale: "pt-BR",
      documentType: table,
    };

    return c.json({ success: true, data: schema });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});
// POST /documents/transcribe-audio - Transcrever áudio com Gemini 2.5 Pro
documents.post("/transcribe-audio", async (c) => {
  try {
    // Verificar se é multipart (arquivo) ou JSON (URL)
    const contentType = c.req.header("content-type") || "";
    
    let body: any;
    let audioBuffer: Buffer | null = null;
    let fileName = "";

    if (contentType.includes("multipart/form-data")) {
      // Processar upload de arquivo
      const formData = await c.req.formData();
      const audioFile = formData.get("audioFile") as File;
      const options = JSON.parse((formData.get("options") as string) || "{}");
      const companyId = formData.get("companyId") as string;
      const meetingId = formData.get("meetingId") as string;

      if (!audioFile) {
        throw new Error("Arquivo de áudio é obrigatório");
      }

      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      fileName = audioFile.name;
      
      body = {
        companyId,
        meetingId,
        options: {
          language: "pt-BR",
          speakerIdentification: false,
          actionItemExtraction: true,
          agendaGeneration: true,
          keyPointsExtraction: true,
          sentimentAnalysis: false,
          autoTranslation: false,
          ...options,
        },
      };
    } else {
      // Processar JSON com URL
      body = await c.req.json();
    }

    const validation = TranscribeAudioSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    const context = extractRequestContext(c, validation.data);

    // Se não tem buffer, é URL
    if (!audioBuffer && validation.data.audioUrl) {
      // Simular download do URL
      audioBuffer = Buffer.from("mock audio from url");
      fileName = `audio-${Date.now()}.wav`;
    }

    if (!audioBuffer) {
      throw new Error("Áudio não fornecido (arquivo ou URL)");
    }

    const result = await documentService.transcribeAudio(
      validation.data,
      audioBuffer,
      fileName,
      context
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /documents/transcribe-audio:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// POST /documents/summarize-minute - Resumir ata inteligentemente
documents.post("/summarize-minute", async (c) => {
  try {
    const body = await c.req.json();
    const validation = SummarizeMinuteSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: "Dados inválidos",
          details: validation.error.issues,
        },
        400
      );
    }

    const context = extractRequestContext(c, validation.data);
    const result = await documentService.summarizeMinute(validation.data, context);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in /documents/summarize-minute:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

// GET /documents/processing/:processingId - Status do processamento de áudio
documents.get("/processing/:processingId", async (c) => {
  try {
    const processingId = c.req.param("processingId");
    const companyId = c.req.header("x-company-id");

    if (!companyId) {
      return c.json(
        {
          success: false,
          error: "Header x-company-id é obrigatório",
        },
        400
      );
    }

    // Simular busca de status
    const processing = {
      id: processingId,
      status: "completed",
      progress: 100,
      result: {
        transcription: "Transcrição completa...",
        analysis: "Análise completa...",
      },
    };

    return c.json({
      success: true,
      data: processing,
    });
  } catch (error) {
    console.error("Error in /documents/processing:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500
    );
  }
});

export { documents };
// Ingestão de conhecimento (admin)
const IngestKnowledgeSchema = z.object({
  companyId: z.string().uuid(),
  sector: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(20),
  tags: z.array(z.string()).optional()
});

documents.post("/ingest-knowledge", async (c) => {
  try {
    const body = await c.req.json();
    const validation = IngestKnowledgeSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ success: false, error: "Dados inválidos", details: validation.error.issues }, 400);
    }
    const { companyId, sector, title, content, tags } = validation.data;

    // Gerar embedding via OpenRouter (ou OpenAI fallback)
    const embedding = await embeddingService.generateEmbedding(content);
    const embeddingText = `[${embedding.join(',')}]`;

    // Tenta RPC insert_knowledge_chunk; se indisponível, faz insert direto
    let chunkId: string | null = null;
    try {
      const { data, error } = await supabase.rpc('insert_knowledge_chunk', {
        p_company_id: companyId,
        p_sector: sector,
        p_source_title: title,
        p_content: content,
        p_embedding: embeddingText,
        p_tags: tags || null,
      });
      if (error) throw error;
      chunkId = Array.isArray(data) ? data[0] : (data as any);
    } catch (e) {
      // Fallback: cria source (upsert simples) e insere chunk sem embedding
      const { data: srcFind } = await supabase
        .from('knowledge_sources')
        .select('id')
        .eq('company_id', companyId)
        .eq('sector', sector)
        .eq('title', title)
        .maybeSingle();
      let sourceId = srcFind?.id as string | undefined;
      if (!sourceId) {
        const { data: srcIns, error: srcErr } = await supabase
          .from('knowledge_sources')
          .insert({ company_id: companyId, sector, title, kind: 'manual', status: 'active' })
          .select('id')
          .maybeSingle();
        if (srcErr) throw srcErr;
        sourceId = srcIns?.id as string;
      }
      const { data: chunkIns, error: chunkErr } = await supabase
        .from('knowledge_chunks')
        .insert({ company_id: companyId, sector, source_id: sourceId, chunk_index: 0, content, tags: tags || [] })
        .select('id')
        .maybeSingle();
      if (chunkErr) throw chunkErr;
      chunkId = chunkIns?.id as string;

      // Tentar atualizar embedding diretamente com array numérico (pgvector aceita JSON array via PostgREST em versões recentes)
      try {
        const { error: upErr } = await supabase
          .from('knowledge_chunks')
          .update({ embedding })
          .eq('id', chunkId as string);
        if (upErr) {
          console.warn('Embedding update failed:', upErr.message || upErr);
        }
      } catch (upEx) {
        console.warn('Embedding update threw:', upEx instanceof Error ? upEx.message : upEx);
      }
    }

    return c.json({ success: true, data: { chunkId } });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});

// Admin: reseed knowledge (clear + seed padrão)
const ReseedSchema = z.object({
  companyId: z.string().uuid(),
  clear: z.boolean().optional()
});

documents.post("/reseed-knowledge", async (c) => {
  try {
    const body = await c.req.json();
    const validation = ReseedSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ success: false, error: "Dados inválidos", details: validation.error.issues }, 400);
    }
    const { companyId, clear = true } = validation.data;

    const result = await runSeedKnowledge(companyId, { clear });

    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});

// ============================================
// POST /documents/extract
// Extrai dados estruturados de PDF/XLSX/CSV conforme schema e salva (ou dryRun)
// ============================================
const ExtractSchema = z.object({
  documentUrl: z.string().url().optional(),
  schema: z.object({
    entity: z.string().min(1),
    description: z.string().optional(),
    fields: z.array(z.object({
      name: z.string().min(1),
      type: z.enum(["string","number","date","boolean"]).default("string"),
      required: z.boolean().optional(),
      pattern: z.string().optional(),
      description: z.string().optional(),
    })),
    output: z.object({
      type: z.enum(["array"]).default("array"),
      itemName: z.string().default("item"),
      dedupeBy: z.array(z.string()).optional(),
      target: z.object({
        table: z.string(),
        upsertKeys: z.array(z.string()).optional(),
      }).optional()
    }),
    locale: z.string().optional(),
    documentType: z.string().optional(),
  }),
  options: z.object({
    extractionMode: z.enum(["hybrid","llm-only","regex-first"]).default("hybrid").optional(),
    model: z.string().default("openai/gpt-5-chat").optional(),
    dryRun: z.boolean().optional(),
    clientId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    companyName: z.string().optional()
  }).optional()
});

documents.post("/extract", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    const supabase = getSupabaseServiceClient();
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is required");
    const openai = new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "CondoGov AdminAssistant",
      },
    });

    // Extrair contexto do tenant
    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");
    if (!companyId || !userId) {
      return c.json({ success: false, error: "Headers x-company-id e x-user-id são obrigatórios" }, 400);
    }

    // Ler entrada (multipart ou JSON)
    let fileBuffer: Buffer | null = null;
    let fileName = "";
    let body: any;
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file") as File;
      if (file) {
        fileBuffer = Buffer.from(await file.arrayBuffer());
        fileName = file.name || "upload";
      }
      const schemaStr = (form.get("schema") as string) || "{}";
      const optionsStr = (form.get("options") as string) || "{}";
      body = {
        schema: JSON.parse(schemaStr),
        options: JSON.parse(optionsStr || "{}")
      };
    } else {
      body = await c.req.json();
    }

    // Validar schema/opções
    const parsed = ExtractSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Dados inválidos", details: parsed.error.issues }, 400);
    }
    const { documentUrl, schema, options } = parsed.data;
    const dryRun = options?.dryRun === true;
    let effectiveCompanyId = options?.companyId || companyId;
    let effectiveClientId = options?.clientId || null;

    // Resolver client_id/company_id por nome (companyName), se informado
    if (options?.companyName) {
      try {
        const { data: cli } = await supabase
          .from("clients")
          .select("id,name")
          .ilike("name", `${options.companyName}%`)
          .limit(2);
        if (cli && cli.length === 1) {
          effectiveClientId = cli[0].id;
        }
      } catch {}
      try {
        const { data: comps } = await supabase
          .from("companies")
          .select("id,name")
          .ilike("name", `${options.companyName}%`)
          .limit(2);
        if (comps && comps.length === 1) {
          effectiveCompanyId = comps[0].id;
        }
      } catch {}
    }

    // Obter arquivo se vier por URL
    if (!fileBuffer && documentUrl) {
      const res = await fetch(documentUrl);
      if (!res.ok) throw new Error(`Falha ao baixar documento: ${res.status}`);
      const ab = await res.arrayBuffer();
      fileBuffer = Buffer.from(ab);
      fileName = documentUrl.split("/").pop() || "remote-file";
    }
    if (!fileBuffer) {
      return c.json({ success: false, error: "Arquivo não fornecido (file ou documentUrl)" }, 400);
    }

    // Detectar tipo por extensão
    const lower = fileName.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const isCsv = lower.endsWith(".csv");
    const isPdf = lower.endsWith(".pdf");

    // Resultado final
    let items: any[] = [];
    let errors: any[] = [];
    let rawText: string | null = null;

    // Helper: normalização simples
    function normalizeValue(type: string, v: any): any {
      if (v === null || v === undefined) return v;
      switch (type) {
        case "number": {
          const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(",", "."));
          return isNaN(num) ? null : num;
        }
        case "boolean": {
          const s = String(v).toLowerCase().trim();
          return ["true","1","sim","yes","y"].includes(s) ? true : ["false","0","não","nao","no","n"].includes(s) ? false : null;
        }
        case "date": {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
        }
        default:
          return String(v).trim();
      }
    }

    // 1) XLSX/CSV parsing local
    if (isXlsx) {
      const wb = XLSX.read(fileBuffer, { type: "buffer" });
      const sheet = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet], { defval: "" });
      // Tentar mapeamento direto por header->field.name
      const headers = rows.length ? Object.keys(rows[0]) : [];
      const mapped = rows.map((r, idx) => {
        const obj: any = {};
        for (const field of schema.fields) {
          // busca header igual ao name (case-insensitive) senão mantém vazio
          const h = headers.find(hh => hh.toLowerCase() === field.name.toLowerCase());
          const val = h ? r[h] : r[field.name] ?? "";
          obj[field.name] = normalizeValue(field.type, val);
        }
        return obj;
      });
      items = mapped;
    } else if (isCsv) {
      const csvStr = fileBuffer.toString("utf-8");
      const parsedCsv = Papa.parse(csvStr, { header: true, skipEmptyLines: true });
      if (parsedCsv.errors?.length) {
        errors.push(...parsedCsv.errors);
      }
      const headers = parsedCsv.meta?.fields || [];
      const mapped = (parsedCsv.data as any[]).map((r, idx) => {
        const obj: any = {};
        for (const field of schema.fields) {
          const h = headers.find(hh => hh.toLowerCase() === field.name.toLowerCase());
          const val = h ? r[h] : r[field.name] ?? "";
          obj[field.name] = normalizeValue(field.type, val);
        }
        return obj;
      });
      items = mapped;
    } else if (isPdf) {
      // 2) PDF: extrair texto e pedir ao LLM para materializar o schema
      const pdfData = await pdfParse(fileBuffer);
      rawText = pdfData.text || "";
      const prompt = `
Você vai extrair dados de um documento para preencher um JSON com o seguinte schema.
Schema:
${JSON.stringify(schema, null, 2)}

Documento (texto extraído):
\"\"\"\n${rawText.slice(0, 15000)}\n\"\"\"  <!-- texto truncado para segurança -->

Instruções:
- Responda APENAS com JSON no formato:
{ "items": [ { <campos conforme schema.fields> } ], "errors": [ { "row": number, "field": string, "message": string } ] }
- Não inclua texto extra, comentários ou explicações.`;

      const completion = await openai.chat.completions.create({
        model: options?.model || "openai/gpt-5-chat",
        messages: [
          { role: "system", content: "Você extrai dados de documentos e retorna JSON válido conforme schema." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });
      const content = completion.choices[0]?.message?.content || "{}";
      const parsedOut = JSON.parse(content);
      items = Array.isArray(parsedOut.items) ? parsedOut.items : [];
      errors = Array.isArray(parsedOut.errors) ? parsedOut.errors : [];
      // Normalizar tipos
      items = items.map((it: any) => {
        const obj: any = {};
        for (const f of schema.fields) {
          obj[f.name] = normalizeValue(f.type, it[f.name]);
        }
        return obj;
      });
    } else {
      return c.json({ success: false, error: "Tipo de arquivo não suportado. Use PDF/XLSX/CSV." }, 400);
    }

    // Validação required/pattern
    const validated: any[] = [];
    const failed: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let ok = true;
      for (const f of schema.fields) {
        const v = it[f.name];
        if (f.required && (v === null || v === undefined || v === "")) {
          ok = false;
          errors.push({ row: i + 1, field: f.name, message: "Campo obrigatório ausente" });
        }
        if (f.pattern && v) {
          const re = new RegExp(f.pattern);
          if (!re.test(String(v))) {
            ok = false;
            errors.push({ row: i + 1, field: f.name, message: "Padrão inválido" });
          }
        }
      }
      if (ok) validated.push(it); else failed.push(it);
    }

    // Dedupe opcional
    if (schema.output?.dedupeBy?.length) {
      const keySet = new Set<string>();
      const unique: any[] = [];
      for (const it of validated) {
        const key = schema.output.dedupeBy.map(k => String(it[k] ?? "")).join("|");
        if (!keySet.has(key)) { keySet.add(key); unique.push(it); }
      }
      items = unique;
    } else {
      items = validated;
    }

    // Resolver FK de residents se necessário (melhor esforço com batch para performance)
    if (schema.output?.target?.table === "condominium_residents") {
      const needsLookup = items.some(it => !it.unit_id && (it.unitNumber || it.block));
      if (needsLookup) {
        // Coletar números e blocos
        const numbers = Array.from(new Set(items.map(it => (it.unitNumber || it.number || "").toString().trim()).filter(Boolean)));
        if (numbers.length > 0) {
          // Buscar todas as unidades do conjunto de números para a empresa (batch)
          let qb = supabase
            .from("condominium_units")
            .select("id, number, block")
            .eq("company_id", companyId)
            .in("number", numbers);
          const { data: units, error: unitErr } = await qb;
          if (unitErr) {
            errors.push({ row: 0, field: "unit_id", message: `Falha ao buscar unidades: ${unitErr.message || unitErr}` });
          } else {
            // Construir mapas por (block|number) e por number
            const byKey = new Map<string, any[]>();
            const byNumber = new Map<string, any[]>();
            const keyOf = (block: any, number: any) => `${String(block || "").toLowerCase()}|${String(number || "").toLowerCase()}`;
            for (const u of units || []) {
              const k = keyOf(u.block, u.number);
              const arr = byKey.get(k) || [];
              arr.push(u);
              byKey.set(k, arr);
              const n = String(u.number || "").toLowerCase();
              const arr2 = byNumber.get(n) || [];
              arr2.push(u);
              byNumber.set(n, arr2);
            }
            // Resolver cada item
            const resolved: any[] = [];
            const failedResidents: any[] = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              if (it.unit_id) { resolved.push(it); continue; }
              const number = (it.unitNumber || it.number || "").toString().trim().toLowerCase();
              const block = (it.block || "").toString().trim().toLowerCase();
              if (!number) {
                errors.push({ row: i + 1, field: "unitNumber", message: "unitNumber ausente para residentes" });
                failedResidents.push(it);
                continue;
              }
              let choice: any | null = null;
              if (block) {
                const candidates = byKey.get(`${block}|${number}`) || [];
                if (candidates.length === 1) choice = candidates[0];
                else if (candidates.length === 0) {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade não encontrada (block='${it.block}', number='${it.unitNumber || it.number}')` });
                } else {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade ambígua para (block='${it.block}', number='${it.unitNumber || it.number}')` });
                }
              } else {
                const candidates = byNumber.get(number) || [];
                if (candidates.length === 1) choice = candidates[0];
                else if (candidates.length === 0) {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade não encontrada (number='${it.unitNumber || it.number}')` });
                } else {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade ambígua: informe o bloco para (number='${it.unitNumber || it.number}')` });
                }
              }
              if (choice && choice.id) {
                const copy = { ...it, unit_id: choice.id };
                // remover unitNumber para não conflitar com colunas inexistentes
                delete copy.unitNumber;
                resolved.push(copy);
              } else {
                failedResidents.push(it);
              }
            }
            items = resolved;
          }
        }
      }
    }

    // Salvar (se não dryRun e se target definido)
    let saved = { inserted: 0, updated: 0 };
    if (!dryRun && schema.output?.target?.table) {
      const table = schema.output.target.table;
      const upsertKeys = schema.output.target.upsertKeys?.join(",") || undefined;
      // Anexar company_id e client_id (quando exigido pelo schema do banco)
      const toSave = items.map(it => ({ ...it, company_id: effectiveCompanyId, client_id: effectiveClientId ?? undefined }));
      const { data: upserted, error: upErr } = await supabase
        .from(table)
        .upsert(toSave, { onConflict: upsertKeys, ignoreDuplicates: false })
        .select("id");
      if (upErr) throw upErr;
      saved.inserted = upserted?.length || 0;
    }

    return c.json({
      success: true,
      data: {
        items: dryRun ? items : undefined,
        errors,
        stats: {
          totalRows: (isXlsx || isCsv) ? (items.length + failed.length) : undefined,
          parsed: items.length,
          failed: failed.length
        },
        saved,
        fileMeta: { name: fileName },
        rawText: null
      }
    });
  } catch (error) {
    console.error("Error in /documents/extract:", error);
    return c.json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
// GET /documents/knowledge/stats?companyId=UUID
documents.get("/knowledge/stats", async (c) => {
  try {
    const companyId = c.req.query("companyId") || c.req.header("x-company-id");
    if (!companyId) {
      return c.json({ success: false, error: "companyId é obrigatório (query ou header)" }, 400);
    }

    // Distinct setores
    const { data: sectorsData, error: sectorsErr } = await supabase
      .from('knowledge_chunks')
      .select('sector')
      .eq('company_id', companyId);
    if (sectorsErr) throw sectorsErr;

    const sectors = Array.from(new Set((sectorsData || []).map((r: any) => r.sector).filter(Boolean)));

    // Contagem total
    const { count: totalCount, error: totalErr } = await supabase
      .from('knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    if (totalErr) throw totalErr;

    // Contagem por setor (múltiplas chamadas, pequeno volume)
    const bySector: Array<{ sector: string; count: number }> = [];
    for (const sector of sectors) {
      const { count, error } = await supabase
        .from('knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('sector', sector);
      if (error) throw error;
      bySector.push({ sector, count: count || 0 });
    }

    return c.json({ success: true, data: { companyId, total: totalCount || 0, bySector } });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});

// ============================================
// POST /documents/extract/base64
// Variante JSON: { fileName, fileBase64, schema, options }
// ============================================
const ExtractBase64Schema = z.object({
  fileName: z.string().min(1),
  fileBase64: z.string().min(10),
  schema: ExtractSchema.shape.schema,
  options: ExtractSchema.shape.options.optional()
});

documents.post("/extract/base64", async (c) => {
  try {
    const supabase = getSupabaseServiceClient();
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is required");
    const openai = new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "CondoGov AdminAssistant",
      },
    });

    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");
    if (!companyId || !userId) {
      return c.json({ success: false, error: "Headers x-company-id e x-user-id são obrigatórios" }, 400);
    }

    const body = await c.req.json();
    const parsed = ExtractBase64Schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Dados inválidos", details: parsed.error.issues }, 400);
    }
    const { fileName, fileBase64, schema, options } = parsed.data;
    const dryRun = options?.dryRun === true;
    // IDs efetivos (podem vir por options ou ser resolvidos por nome)
    let effectiveCompanyId = (options?.companyId as string) || companyId;
    let effectiveClientId = (options?.clientId as string) || null;
    if (options?.companyName) {
      try {
        const { data: cli } = await supabase
          .from("clients")
          .select("id,name")
          .ilike("name", `${options.companyName}%`)
          .limit(2);
        if (cli && cli.length === 1) {
          effectiveClientId = cli[0].id as string;
        }
      } catch {}
      try {
        const { data: comps } = await supabase
          .from("companies")
          .select("id,name")
          .ilike("name", `${options.companyName}%`)
          .limit(2);
        if (comps && comps.length === 1) {
          effectiveCompanyId = comps[0].id as string;
        }
      } catch {}
    }

    // Decode base64
    let fileBuffer: Buffer | null = null;
    try {
      fileBuffer = Buffer.from(fileBase64, "base64");
    } catch {
      return c.json({ success: false, error: "fileBase64 inválido" }, 400);
    }
    if (!fileBuffer?.length) {
      return c.json({ success: false, error: "Arquivo vazio" }, 400);
    }

    // Detect type
    const lower = fileName.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const isCsv = lower.endsWith(".csv");
    const isPdf = lower.endsWith(".pdf");

    // Helpers
    function normalizeValue(type: string, v: any): any {
      if (v === null || v === undefined) return v;
      switch (type) {
        case "number": {
          const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(",", "."));
          return isNaN(num) ? null : num;
        }
        case "boolean": {
          const s = String(v).toLowerCase().trim();
          return ["true","1","sim","yes","y"].includes(s) ? true : ["false","0","não","nao","no","n"].includes(s) ? false : null;
        }
        case "date": {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
        }
        default:
          return String(v).trim();
      }
    }

    let items: any[] = [];
    let errors: any[] = [];
    let rawText: string | null = null;

    if (isXlsx) {
      const wb = XLSX.read(fileBuffer, { type: "buffer" });
      const sheet = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet], { defval: "" });
      const headers = rows.length ? Object.keys(rows[0]) : [];
      items = rows.map(r => {
        const obj: any = {};
        for (const f of schema.fields) {
          const h = headers.find(hh => hh.toLowerCase() === f.name.toLowerCase());
          const val = h ? r[h] : r[f.name] ?? "";
          obj[f.name] = normalizeValue(f.type, val);
        }
        return obj;
      });
    } else if (isCsv) {
      const csvStr = fileBuffer.toString("utf-8");
      const parsedCsv = Papa.parse(csvStr, { header: true, skipEmptyLines: true });
      if (parsedCsv.errors?.length) errors.push(...parsedCsv.errors);
      const headers = parsedCsv.meta?.fields || [];
      items = (parsedCsv.data as any[]).map(r => {
        const obj: any = {};
        for (const f of schema.fields) {
          const h = headers.find(hh => hh.toLowerCase() === f.name.toLowerCase());
          const val = h ? r[h] : r[f.name] ?? "";
          obj[f.name] = normalizeValue(f.type, val);
        }
        return obj;
      });
    } else if (isPdf) {
      const pdfData = await pdfParse(fileBuffer);
      rawText = pdfData.text || "";
      const prompt = `
Você vai extrair dados de um documento para preencher um JSON com o seguinte schema.
Schema:
${JSON.stringify(schema, null, 2)}

Documento (texto extraído):
\"\"\"\n${rawText.slice(0, 15000)}\n\"\"\"\n
Instruções:
- Responda APENAS com JSON no formato:
{ "items": [ { <campos conforme schema.fields> } ], "errors": [ { "row": number, "field": string, "message": string } ] }
- Não inclua texto extra, comentários ou explicações.`;

      const completion = await openai.chat.completions.create({
        model: options?.model || "openai/gpt-5-chat",
        messages: [
          { role: "system", content: "Você extrai dados de documentos e retorna JSON válido conforme schema." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });
      const content = completion.choices[0]?.message?.content || "{}";
      const parsedOut = JSON.parse(content);
      items = Array.isArray(parsedOut.items) ? parsedOut.items : [];
      errors = Array.isArray(parsedOut.errors) ? parsedOut.errors : [];
      items = items.map((it: any) => {
        const obj: any = {};
        for (const f of schema.fields) {
          obj[f.name] = normalizeValue(f.type, it[f.name]);
        }
        return obj;
      });
    } else {
      return c.json({ success: false, error: "Tipo de arquivo não suportado. Use PDF/XLSX/CSV." }, 400);
    }

    // Validação required/pattern
    const validated: any[] = [];
    const failed: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let ok = true;
      for (const f of schema.fields) {
        const v = it[f.name];
        if (f.required && (v === null || v === undefined || v === "")) {
          ok = false;
          errors.push({ row: i + 1, field: f.name, message: "Campo obrigatório ausente" });
        }
        if (f.pattern && v) {
          const re = new RegExp(f.pattern);
          if (!re.test(String(v))) {
            ok = false;
            errors.push({ row: i + 1, field: f.name, message: "Padrão inválido" });
          }
        }
      }
      if (ok) validated.push(it); else failed.push(it);
    }

    // Dedupe
    if (schema.output?.dedupeBy?.length) {
      const keySet = new Set<string>();
      const unique: any[] = [];
      for (const it of validated) {
        const key = schema.output.dedupeBy.map(k => String(it[k] ?? "")).join("|");
        if (!keySet.has(key)) { keySet.add(key); unique.push(it); }
      }
      items = unique;
    } else {
      items = validated;
    }

    // Resolver FK (residents) como no endpoint principal
    if (schema.output?.target?.table === "condominium_residents") {
      const needsLookup = items.some(it => !it.unit_id && (it.unitNumber || it.block));
      if (needsLookup) {
        const numbers = Array.from(new Set(items.map(it => (it.unitNumber || it.number || "").toString().trim()).filter(Boolean)));
        if (numbers.length > 0) {
          const { data: units, error: unitErr } = await supabase
            .from("condominium_units")
            .select("id, number, block")
            .eq("company_id", companyId)
            .in("number", numbers);
          if (unitErr) {
            errors.push({ row: 0, field: "unit_id", message: `Falha ao buscar unidades: ${unitErr.message || unitErr}` });
          } else {
            const byKey = new Map<string, any[]>();
            const byNumber = new Map<string, any[]>();
            const keyOf = (block: any, number: any) => `${String(block || "").toLowerCase()}|${String(number || "").toLowerCase()}`;
            for (const u of units || []) {
              const k = keyOf(u.block, u.number);
              const arr = byKey.get(k) || [];
              arr.push(u);
              byKey.set(k, arr);
              const n = String(u.number || "").toLowerCase();
              const arr2 = byNumber.get(n) || [];
              arr2.push(u);
              byNumber.set(n, arr2);
            }
            const resolved: any[] = [];
            const failedResidents: any[] = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              if (it.unit_id) { resolved.push(it); continue; }
              const number = (it.unitNumber || it.number || "").toString().trim().toLowerCase();
              const block = (it.block || "").toString().trim().toLowerCase();
              if (!number) {
                errors.push({ row: i + 1, field: "unitNumber", message: "unitNumber ausente para residentes" });
                failedResidents.push(it);
                continue;
              }
              let choice: any | null = null;
              if (block) {
                const candidates = byKey.get(`${block}|${number}`) || [];
                if (candidates.length === 1) choice = candidates[0];
                else if (candidates.length === 0) {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade não encontrada (block='${it.block}', number='${it.unitNumber || it.number}')` });
                } else {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade ambígua para (block='${it.block}', number='${it.unitNumber || it.number}')` });
                }
              } else {
                const candidates = byNumber.get(number) || [];
                if (candidates.length === 1) choice = candidates[0];
                else if (candidates.length === 0) {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade não encontrada (number='${it.unitNumber || it.number}')` });
                } else {
                  errors.push({ row: i + 1, field: "unitNumber", message: `Unidade ambígua: informe o bloco para (number='${it.unitNumber || it.number}')` });
                }
              }
              if (choice && choice.id) {
                const copy = { ...it, unit_id: choice.id };
                delete (copy as any).unitNumber;
                delete (copy as any).block;
                resolved.push(copy);
              } else {
                failedResidents.push(it);
              }
            }
            items = resolved;
          }
        }
      }
    }

    // Salvar
    let saved = { inserted: 0, updated: 0 };
    if (!dryRun && schema.output?.target?.table) {
      const table = schema.output.target.table;
      const upsertKeys = schema.output.target.upsertKeys?.join(",") || undefined;
      const resolvedClientId = effectiveClientId || effectiveCompanyId;
      // Sanitizar campos transitórios para residents
      const cleanItems = table === "condominium_residents"
        ? items.map((it) => {
            const x: any = { ...it };
            delete x.unitNumber;
            delete x.block;
            return x;
          })
        : items;
      const toSave = cleanItems.map(it => {
        const base: any = { ...it, company_id: effectiveCompanyId, client_id: resolvedClientId };
        if (table === "condominium_units") {
          // Valores permitidos pelo CHECK (exatos no banco):
          // occupancy_status: vacant | occupied | reserved | maintenance
          // type: apartment | house | commercial | garage | storage
          const occ = (base.occupancy_status || "").toString().toLowerCase().trim();
          const occMap: Record<string,string> = {
            "ocupada": "occupied",
            "alugada": "occupied",
            "desocupada": "vacant",
            "vazia": "vacant",
            "reservada": "reserved",
            "manutencao": "maintenance",
            "manutenção": "maintenance"
          };
          const occNorm = occMap[occ] ?? occ;
          base.occupancy_status = ["vacant","occupied","reserved","maintenance"].includes(occNorm) ? occNorm : null;
          // Tipo
          const t = (base.type || "").toString().toLowerCase().trim();
          const typeMap: Record<string,string> = {
            "apartamento": "apartment",
            "apto": "apartment",
            "casa": "house",
            "comercial": "commercial",
            "sala comercial": "commercial",
            "garagem": "garage",
            "vaga": "garage",
            "depósito": "storage",
            "deposito": "storage",
            "box": "storage",
            "armazem": "storage",
            "armazém": "storage",
            // fallback comuns
            "studio": "apartment",
            "duplex": "apartment",
            "loft": "apartment"
          };
          const typeNorm = (typeMap[t] ?? t) || "apartment";
          base.type = ["apartment","house","commercial","garage","storage"].includes(typeNorm) ? typeNorm : "apartment";
        } else if (table === "condominium_residents") {
          const rel = (base.relationship || "").toString().toLowerCase().trim();
          const relMap: Record<string,string> = {
            "proprietario": "owner",
            "proprietário": "owner",
            "dono": "owner",
            "inquilino": "tenant",
            "locatario": "tenant",
            "locatário": "tenant",
            "morador": "family",
            "residente": "family",
            "familia": "family",
            "família": "family",
            "conjuge": "family",
            "cônjuge": "family",
            "filho": "family",
            "filha": "family",
            "funcionario": "employee",
            "funcionário": "employee",
            "empregado": "employee"
          };
          const relNorm = relMap[rel] ?? rel;
          base.relationship = ["owner","tenant","family","employee"].includes(relNorm) ? relNorm : null;
        }
        return base;
      });
      if (table === "condominium_units") {
        // Merge manual por (company_id, number) para compatibilidade com ausência de unique constraint
        const numbers = Array.from(new Set(toSave.map(r => String(r.number || "").trim()).filter(Boolean)));
        const { data: existing, error: existErr } = await supabase
          .from("condominium_units")
          .select("id, number")
          .eq("company_id", effectiveCompanyId)
          .in("number", numbers);
        if (existErr) throw existErr;
        const byNumber = new Map<string, any>();
        for (const e of existing || []) byNumber.set(String(e.number), e);
        const updates = toSave
          .filter(r => byNumber.has(String(r.number)))
          .map(r => ({ ...r, id: byNumber.get(String(r.number)).id }));
        const inserts = toSave.filter(r => !byNumber.has(String(r.number)));
        if (updates.length) {
          const { error: upErr2 } = await supabase
            .from("condominium_units")
            .upsert(updates, { onConflict: "id", ignoreDuplicates: false });
          if (upErr2) throw upErr2;
          saved.updated = updates.length;
        }
        if (inserts.length) {
          const { data: insData, error: insErr } = await supabase
            .from("condominium_units")
            .insert(inserts)
            .select("id");
          if (insErr) throw insErr;
          saved.inserted = (insData?.length || 0);
        }
      } else if (table === "condominium_residents") {
        // Filtrar itens inválidos por integridade (relationship obrigatório e válido)
        const allowedRelationships = ["owner","tenant","family","employee"];
        const invalids = toSave.filter((r: any) => {
          const rel = (r.relationship || "").toString().toLowerCase().trim();
          return !allowedRelationships.includes(rel);
        });
        for (const inv of invalids) {
          errors.push({ row: 0, field: "relationship", message: "Valor ausente ou inválido para relationship" });
        }
        const toSaveValid = toSave.filter((r: any) => {
          const rel = (r.relationship || "").toString().toLowerCase().trim();
          return allowedRelationships.includes(rel);
        });
        // Merge manual por (company_id, unit_id, name)
        const unitIds = Array.from(new Set(toSaveValid.map((r: any) => String(r.unit_id || "").trim()).filter(Boolean)));
        const { data: existing, error: existErr } = await supabase
          .from("condominium_residents")
          .select("id, unit_id, name")
          .eq("company_id", effectiveCompanyId)
          .in("unit_id", unitIds);
        if (existErr) throw existErr;
        const byKey = new Map<string, any>();
        for (const e of existing || []) {
          const k = `${e.unit_id}|${(e.name || "").toString().toLowerCase().trim()}`;
          byKey.set(k, e);
        }
        const updates = [];
        const inserts = [];
        for (const r of toSaveValid) {
          const k = `${r.unit_id}|${(r.name || "").toString().toLowerCase().trim()}`;
          const match = byKey.get(k);
          if (match?.id) {
            updates.push({ ...r, id: match.id });
          } else {
            inserts.push(r);
          }
        }
        if (updates.length) {
          const { error: upErr2 } = await supabase
            .from("condominium_residents")
            .upsert(updates, { onConflict: "id", ignoreDuplicates: false });
          if (upErr2) throw upErr2;
          saved.updated = updates.length;
        }
        if (inserts.length) {
          const { data: insData, error: insErr } = await supabase
            .from("condominium_residents")
            .insert(inserts)
            .select("id");
          if (insErr) throw insErr;
          saved.inserted = (insData?.length || 0);
        }
      } else {
        const { data: upserted, error: upErr } = await supabase
          .from(table)
          .upsert(toSave, { onConflict: upsertKeys, ignoreDuplicates: false })
          .select("id");
        if (upErr) throw upErr;
        saved.inserted = upserted?.length || 0;
      }
    }

    return c.json({
      success: true,
      data: {
        items: dryRun ? items : undefined,
        errors,
        stats: {
          totalRows: (isXlsx || isCsv) ? items.length : undefined,
          parsed: items.length,
          failed: errors.filter((e: any) => e?.row && e.row > 0).length
        },
        saved,
        fileMeta: { name: fileName },
        rawText: null
      }
    });
  } catch (error) {
    console.error("Error in /documents/extract/base64:", error);
    return c.json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
// Templates prontos de schema para importação (unidades e moradores)
documents.get("/extract/schemas", async (c) => {
  try {
    const unitSchema = {
      entity: "unit",
      description: "Importar unidades do condomínio (salva em condominium_units)",
      fields: [
        { name: "block", type: "string" },
        { name: "floor", type: "number" },
        { name: "number", type: "string", required: true },
        { name: "type", type: "string" },
        { name: "area", type: "number" },
        { name: "bedrooms", type: "number" },
        { name: "bathrooms", type: "number" },
        { name: "parking_spaces", type: "number" },
        { name: "occupancy_status", type: "string" },
        { name: "owner_name", type: "string" },
        { name: "owner_document", type: "string" },
        { name: "owner_phone", type: "string" },
        { name: "owner_email", type: "string" },
        { name: "monthly_fee", type: "number" },
        { name: "special_notes", type: "string" }
      ],
      output: {
        type: "array",
        itemName: "unit",
        dedupeBy: ["number","block"],
        target: { table: "condominium_units", upsertKeys: ["company_id","number","block"] }
      },
      locale: "pt-BR",
      documentType: "unit_roster"
    };

    const residentSchemaWithUnitId = {
      entity: "resident",
      description: "Importar moradores (melhor opção: usar unit_id resolvido)",
      fields: [
        { name: "unit_id", type: "string", required: true },
        { name: "name", type: "string", required: true },
        { name: "document", type: "string" },
        { name: "phone", type: "string" },
        { name: "email", type: "string" },
        { name: "relationship", type: "string" },
        { name: "is_primary", type: "boolean" },
        { name: "status", type: "string" },
        { name: "type", type: "string" },
        { name: "special_notes", type: "string" }
      ],
      output: {
        type: "array",
        itemName: "resident",
        dedupeBy: ["unit_id","name"],
        target: { table: "condominium_residents", upsertKeys: ["company_id","unit_id","name"] }
      },
      locale: "pt-BR",
      documentType: "resident_roster"
    };

    const residentSchemaWithUnitNumber = {
      entity: "resident",
      description: "Importar moradores (fallback: usar unitNumber e opcional block; backend resolve unit_id)",
      fields: [
        { name: "unitNumber", type: "string", required: true },
        { name: "block", type: "string" },
        { name: "name", type: "string", required: true },
        { name: "document", type: "string" },
        { name: "phone", type: "string" },
        { name: "email", type: "string" },
        { name: "relationship", type: "string" },
        { name: "is_primary", type: "boolean" },
        { name: "status", type: "string" },
        { name: "type", type: "string" },
        { name: "special_notes", type: "string" }
      ],
      output: {
        type: "array",
        itemName: "resident",
        dedupeBy: ["unitNumber","name"],
        target: { table: "condominium_residents", upsertKeys: ["company_id","unit_id","name"] }
      },
      locale: "pt-BR",
      documentType: "resident_roster"
    };

    return c.json({
      success: true,
      data: {
        bestPractice: {
          residents: "residentSchemaWithUnitId",
          reason: "melhor performance e segurança; evita lookups e ambiguidades",
        },
        templates: {
          unitSchema,
          residentSchemaWithUnitId,
          residentSchemaWithUnitNumber
        }
      }
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});

// ============================================
// POST /documents/ingest-auto
// Entrada mínima: { fileName, fileBase64, subject: "moradores"|"unidades"|"auto", options }
// Estratégia: classifica entidade, gera schema (registry) e reusa /extract/base64
// ============================================
const IngestAutoSchema = z.object({
  fileName: z.string().min(1),
  fileBase64: z.string().min(10),
  subject: z.enum(["moradores","unidades","auto"]),
  options: z.object({
    dryRun: z.boolean().optional(),
    companyName: z.string().optional(),
  }).optional()
});

// Registry mínimo (v1) para gerar schemas automaticamente
function getUnitAutoSchema() {
  return {
    entity: "unit",
    description: "Auto: condominium_units",
    fields: [
      { name: "block", type: "string" },
      { name: "floor", type: "number" },
      { name: "number", type: "string", required: true },
      { name: "type", type: "string" },
      { name: "area", type: "number" },
      { name: "bedrooms", type: "number" },
      { name: "bathrooms", type: "number" },
      { name: "parking_spaces", type: "number" },
      { name: "occupancy_status", type: "string" },
      { name: "owner_name", type: "string" },
      { name: "owner_document", type: "string" },
      { name: "owner_phone", type: "string" },
      { name: "owner_email", type: "string" },
      { name: "monthly_fee", type: "number" },
      { name: "special_notes", type: "string" }
    ],
    output: {
      type: "array",
      itemName: "unit",
      dedupeBy: ["number","block"],
      target: { table: "condominium_units", upsertKeys: ["company_id","number","block"] }
    },
    locale: "pt-BR",
    documentType: "unit_roster"
  };
}

function getResidentAutoSchemaWithUnitNumber() {
  return {
    entity: "resident",
    description: "Auto: condominium_residents (unitNumber → unit_id)",
    fields: [
      { name: "unitNumber", type: "string", required: true },
      { name: "block", type: "string" },
      { name: "name", type: "string", required: true },
      { name: "document", type: "string" },
      { name: "phone", type: "string" },
      { name: "email", type: "string" },
      { name: "relationship", type: "string" },
      { name: "is_primary", type: "boolean" },
      { name: "status", type: "string" },
      { name: "type", type: "string" },
      { name: "special_notes", type: "string" }
    ],
    output: {
      type: "array",
      itemName: "resident",
      dedupeBy: ["unitNumber","name"],
      target: { table: "condominium_residents", upsertKeys: ["company_id","unit_id","name"] }
    },
    locale: "pt-BR",
    documentType: "resident_roster"
  };
}

documents.post("/ingest-auto", async (c) => {
  try {
    const companyId = c.req.header("x-company-id");
    const userId = c.req.header("x-user-id");
    if (!companyId || !userId) {
      return c.json({ success: false, error: "Headers x-company-id e x-user-id são obrigatórios" }, 400);
    }

    const body = await c.req.json();
    const parsed = IngestAutoSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Dados inválidos", details: parsed.error.issues }, 400);
    }
    const { fileName, fileBase64, subject, options } = parsed.data;

    // Detectar tipo básico (por extensão)
    const lower = fileName.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const isCsv = lower.endsWith(".csv");
    const isPdf = lower.endsWith(".pdf");

    // Classificação simples (v1):
    // - se subject = moradores|unidades, usa direto
    // - se auto e CSV/XLSX: heurística por headers
    // - se auto e PDF: fallback para moradores (ou IA futura)
    let targets: Array<{ table: "condominium_units"|"condominium_residents"; schema: any }> = [];

    if (subject === "unidades") {
      targets.push({ table: "condominium_units", schema: getUnitAutoSchema() });
    } else if (subject === "moradores") {
      targets.push({ table: "condominium_residents", schema: getResidentAutoSchemaWithUnitNumber() });
    } else {
      // auto
      if (isCsv || isXlsx) {
        // Inspecionar primeiras linhas/headers
        const buffer = Buffer.from(fileBase64, "base64");
        let headers: string[] = [];
        if (isCsv) {
          const csvStr = buffer.toString("utf-8");
          const parsedCsv = Papa.parse(csvStr, { header: true, skipEmptyLines: true });
          headers = parsedCsv.meta?.fields || [];
        } else {
          const wb = XLSX.read(buffer, { type: "buffer" });
          const sheet = wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet], { defval: "" });
          headers = rows.length ? Object.keys(rows[0]) : [];
        }
        const hset = new Set(headers.map(h => h.toLowerCase()));
        const looksResidents = hset.has("unitnumber") || hset.has("relationship") || hset.has("name");
        const looksUnits = hset.has("number") || hset.has("occupancy_status") || hset.has("monthly_fee");
        if (looksUnits) targets.push({ table: "condominium_units", schema: getUnitAutoSchema() });
        if (looksResidents) targets.push({ table: "condominium_residents", schema: getResidentAutoSchemaWithUnitNumber() });
        if (!targets.length) {
          // default suave
          targets.push({ table: "condominium_residents", schema: getResidentAutoSchemaWithUnitNumber() });
        }
      } else if (isPdf) {
        // v1: default para moradores (IA classificadora futura)
        targets.push({ table: "condominium_residents", schema: getResidentAutoSchemaWithUnitNumber() });
      } else {
        return c.json({ success: false, error: "Tipo de arquivo não suportado" }, 400);
      }
    }

    // Reutilizar o motor existente chamando /extract/base64 localmente
    const results: Record<string, { inserted: number; updated: number; errors: any[]; stats?: any }> = {};
    for (const t of targets) {
      const res = await fetch("http://localhost:3000/api/documents/extract/base64", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          fileName,
          fileBase64,
          schema: t.schema,
          options: { ...(options || {}), dryRun: options?.dryRun === true ? true : false }
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        results[t.table] = { inserted: 0, updated: 0, errors: [{ message: json?.error || "Falha ao importar" }] };
      } else {
        results[t.table] = {
          inserted: json.data?.saved?.inserted || 0,
          updated: json.data?.saved?.updated || 0,
          errors: json.data?.errors || [],
          stats: json.data?.stats
        };
      }
    }

    return c.json({ success: true, entities: results });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});
// GET /documents/verify-import?companyId=UUID
// Retorna contagens e uma amostra de unidades e moradores para validação rápida
documents.get("/verify-import", async (c) => {
  try {
    const companyId = c.req.query("companyId") || c.req.header("x-company-id");
    if (!companyId) {
      return c.json({ success: false, error: "companyId é obrigatório (query ou header)" }, 400);
    }

    const { count: unitsCount, error: unitsCountErr } = await supabase
      .from("condominium_units")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (unitsCountErr) throw unitsCountErr;

    const { data: unitsSample, error: unitsSampleErr } = await supabase
      .from("condominium_units")
      .select("id, number, block, occupancy_status, type, monthly_fee")
      .eq("company_id", companyId)
      .order("number", { ascending: true })
      .limit(5);
    if (unitsSampleErr) throw unitsSampleErr;

    const { count: residentsCount, error: resCountErr } = await supabase
      .from("condominium_residents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (resCountErr) throw resCountErr;

    const { data: residentsSample, error: resSampleErr } = await supabase
      .from("condominium_residents")
      .select("id, unit_id, name, relationship, email, phone, is_primary, status")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(5);
    if (resSampleErr) throw resSampleErr;

    return c.json({
      success: true,
      data: {
        companyId,
        units: { count: unitsCount || 0, sample: unitsSample || [] },
        residents: { count: residentsCount || 0, sample: residentsSample || [] },
      },
    });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});
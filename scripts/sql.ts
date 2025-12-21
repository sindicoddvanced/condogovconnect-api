import { getSupabaseServiceClient } from "../src/utils/supabaseClient.js";

export async function sql(query: string) {
  const supabase = getSupabaseServiceClient();
  // WARNING: PostgREST não aceita SQL direto; usamos RPC auxiliar se existir.
  // Aqui, para nosso uso, tentamos endpoints diretos (não suportado). Em vez disso,
  // implementamos utilitários por tabelas abaixo.
  throw new Error("Direct SQL not supported here");
}

export async function getUnitIdByNumber(companyId: string, number: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("condominium_units")
    .select("id")
    .eq("company_id", companyId)
    .eq("number", number)
    .maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

export async function updateUnitOccupancy(unitId: string, occupancy: "vacant"|"occupied"|"reserved"|"maintenance") {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("condominium_units")
    .update({ occupancy_status: occupancy })
    .eq("id", unitId);
  if (error) throw error;
}

export async function insertResident(params: {
  unitId: string; companyId: string; clientId: string;
  name: string; relationship: "owner"|"tenant"|"family"|"employee";
  document?: string; phone?: string; email?: string; isPrimary?: boolean; status?: string; type?: string; special_notes?: string;
}) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("condominium_residents")
    .insert({
      unit_id: params.unitId,
      company_id: params.companyId,
      client_id: params.clientId,
      name: params.name,
      relationship: params.relationship,
      document: params.document || null,
      phone: params.phone || null,
      email: params.email || null,
      is_primary: params.isPrimary ?? true,
      status: params.status || "active",
      type: params.type || "resident",
      special_notes: params.special_notes || null
    });
  if (error) throw error;
}

async function main() {
  const [action, ...rest] = process.argv.slice(2);
  if (action === "seed-resident-c301") {
    const companyId = rest[0];
    const clientId = rest[1];
    const unitNumber = "C-301";
    const unitId = await getUnitIdByNumber(companyId, unitNumber);
    if (!unitId) {
      console.log(JSON.stringify({ ok: false, error: "unit_not_found", unitNumber, companyId }));
      process.exit(1);
    }
    await updateUnitOccupancy(unitId, "occupied");
    await insertResident({
      unitId,
      companyId,
      clientId,
      name: "Responsável C-301",
      relationship: "family",
      email: "responsavel.c301@encantos.com",
      phone: "(11) 90000-0000",
      document: null as any,
      isPrimary: true,
      status: "active",
      type: "resident",
      special_notes: "Inserido via rotina MCP/seed para C-301"
    });
    console.log(JSON.stringify({ ok: true, unitId, resident: "Responsável C-301" }));
    return;
  }
  console.log(JSON.stringify({ error: "usage", example: "bun run scripts/sql.ts seed-resident-c301 <companyId> <clientId>" }));
  process.exit(1);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  });
}



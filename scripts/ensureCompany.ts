import { getSupabaseServiceClient } from "../src/utils/supabaseClient.js";

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error(JSON.stringify({ error: "usage: bun run scripts/ensureCompany.ts <companyName>" }));
    process.exit(1);
  }
  const supabase = getSupabaseServiceClient();
  const out: any = { name };
  try {
    const { data: existing, error: selErr } = await supabase
      .from("companies")
      .select("id,name")
      .eq("name", name)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing?.id) {
      out.companyId = existing.id;
      out.status = "exists";
      console.log(JSON.stringify(out));
      return;
    }
    const { data: ins, error: insErr } = await supabase
      .from("companies")
      .insert({ name, type: "condominium" })
      .select("id")
      .maybeSingle();
    if (insErr) throw insErr;
    out.companyId = ins?.id;
    out.status = "created";
    console.log(JSON.stringify(out));
  } catch (e) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}

main();


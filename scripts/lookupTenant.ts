import { getSupabaseServiceClient } from "../src/utils/supabaseClient.js";

async function main() {
  const q = process.argv.slice(2).join(" ").trim() || "Encantos do Norte";
  const supabase = getSupabaseServiceClient();
  const result: any = { query: q, clients: [], companies: [] };
  try {
    const { data: clients, error: cErr } = await supabase
      .from("clients")
      .select("id,name")
      .ilike("name", `${q}%`)
      .limit(10);
    if (cErr) throw cErr;
    result.clients = clients || [];
  } catch (e) {
    result.clientsError = e instanceof Error ? e.message : String(e);
  }
  try {
    const { data: companies, error: coErr } = await supabase
      .from("companies")
      .select("id,name")
      .ilike("name", `${q}%`)
      .limit(10);
    if (coErr) throw coErr;
    result.companies = companies || [];
  } catch (e) {
    result.companiesError = e instanceof Error ? e.message : String(e);
  }
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});



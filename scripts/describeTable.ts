import { getSupabaseServiceClient } from "../src/utils/supabaseClient.js";

async function main() {
  const table = process.argv[2] || "companies";
  const supabase = getSupabaseServiceClient();
  const out: any = { table };
  try {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      out.error = error.message || String(error);
    } else {
      out.sample = data;
      out.columns = data && data.length > 0 ? Object.keys(data[0]) : [];
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  console.log(JSON.stringify(out));
}

main();



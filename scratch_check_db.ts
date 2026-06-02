import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDb() {
  const users = ["4d2f3e3c-b834-43fc-852a-c3cdbb535b68", "043eff80-871a-4b89-a3fa-b65dbe8717bb"];
  
  for (const uid of users) {
    const { data: profile, error: pErr } = await supabase.from("user_profiles").select("*").eq("user_id", uid);
    console.log(`\nProfile for ${uid}:`);
    console.log(profile || pErr);
  }
}
checkDb();

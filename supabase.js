import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kdoaxcocookckfwocscu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SuKFXgynnXBw0cBJ8JFrCw_D7K9GnI0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

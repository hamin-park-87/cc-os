import { createClient } from "@supabase/supabase-js";

// 서버 전용: service_role 키. 절대 브라우저로 나가면 안 됨 (NEXT_PUBLIC_ 아님).
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

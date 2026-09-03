"use client";
import { getSupabase } from "@/lib/supabase/client";
import type { Session } from "./session";
import type { Role } from "@/lib/types";

// 매직링크 발송
export async function sendMagicLink(email: string) {
  const sb = getSupabase();
  return sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
  });
}

// 비밀번호 로그인 (이메일 발송 불필요 · 대시보드에서 유저 생성 후)
export async function signInPassword(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email: email.trim(), password });
}

export async function supabaseSignOut() {
  try { await getSupabase().auth.signOut(); } catch { /* ignore */ }
}

// 본인 비밀번호 변경 (로그인 상태에서)
export async function changePassword(newPassword: string) {
  return getSupabase().auth.updateUser({ password: newPassword });
}

// 현재 Supabase 세션 → 앱 세션(role·scope) 매핑
export async function currentSupabaseSession(): Promise<Session | null> {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const email = user.email ?? "";
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (prof?.role ?? "creator") as Role;
  let scope = "81degree";
  if (role === "brand") {
    const { data } = await sb.from("brand_members").select("brands(name)").eq("user_id", user.id).limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope = (data?.[0] as any)?.brands?.name ?? "—";
  } else if (role === "creator") {
    const { data } = await sb.from("creators").select("name").eq("user_id", user.id).limit(1);
    scope = data?.[0]?.name ?? "—";
  }
  return { email, role, scope };
}

// 세션 변화 구독
export function onAuthChange(cb: () => void) {
  const { data } = getSupabase().auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
}

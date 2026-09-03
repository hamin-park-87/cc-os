"use client";
import { useEffect, useState } from "react";
import { Login } from "@/components/Login";
import { AppShell } from "@/components/AppShell";
import { loadSession, clearSession, findAccount, type Session } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/supabase/client";
import { currentSupabaseSession, supabaseSignOut, onAuthChange } from "@/lib/auth/supabaseAuth";

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [viaSupabase, setViaSupabase] = useState(false);

  useEffect(() => {
    let unsub = () => { };
    (async () => {
      // 1) 실제 Supabase 세션 (프로덕션) — 데모 폴백 없음(사칭 방지)
      if (supabaseConfigured()) {
        const s = await currentSupabaseSession();
        if (s) { setSession(s); setViaSupabase(true); }
        unsub = onAuthChange(async () => {
          const ns = await currentSupabaseSession();
          if (ns) { setSession(ns); setViaSupabase(true); }
        });
        setReady(true);
        return; // Supabase 설정 시 localStorage 데모 세션은 사용하지 않음
      }
      // 2) 데모 세션 (Supabase 미설정 로컬 개발 전용)
      const d = loadSession();
      if (d && findAccount(d.email)) setSession(d);
      setReady(true);
    })();
    return () => unsub();
  }, []);

  function logout() {
    if (viaSupabase) supabaseSignOut();
    clearSession();
    setSession(null); setViaSupabase(false);
  }

  if (!ready) return null;
  if (!session) return <Login onDemoLogin={setSession} />;
  return <AppShell session={session} onLogout={logout} />;
}

"use client";
import type { Account } from "@/lib/types";
import { seed } from "@/lib/data";

// Phase 0: 클라이언트 세션(localStorage). 실서비스는 Supabase Auth 매직링크로 교체.
const KEY = "creatoros.session";

export type Session = Pick<Account, "email" | "role" | "scope">;

export function findAccount(email: string): Account | undefined {
  return seed.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
}
export function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function saveSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

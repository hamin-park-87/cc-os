import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendSlack } from "@/lib/notify";

export const maxDuration = 60;

// 관리자 트리거: 특정 월의 크리에이터 '이번 달 할일' 진행 상황을 Slack으로 리마인드
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { data: { user } } = await createClient(url, anonKey).auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ error: "service role 미설정" }, { status: 500 }); }
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return NextResponse.json({ error: "관리자만 가능" }, { status: 403 });

  let body: { month?: string } = {};
  try { body = await req.json(); } catch { /* optional */ }
  const month = (body.month || new Date().toISOString().slice(0, 7)).slice(0, 7);

  const [{ data: creators }, { data: assignments }, { data: contents }] = await Promise.all([
    admin.from("creators").select("id, name, code"),
    admin.from("assignments").select("creator_id, quota, year_month").eq("year_month", month),
    admin.from("contents").select("creator_id, status, kind, year_month, published_at, sched").eq("kind", "pr"),
  ]);
  const cById = new Map((creators ?? []).map((c) => [c.id, c]));

  // 콘텐츠 귀속 월 판정 (업로드=게시월, 예정=업로드예정월, 없으면 year_month)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cMonth = (c: any): string | null => c.status === "uploaded"
    ? (c.published_at ? String(c.published_at).slice(0, 7) : null)
    : (c.sched?.upload ? String(c.sched.upload).slice(0, 7) : (c.year_month ?? null));

  const rows: { name: string; code: string; q: number; done: number; created: number }[] = [];
  const byCreator = new Map<string, number>();
  for (const a of assignments ?? []) byCreator.set(a.creator_id, (byCreator.get(a.creator_id) ?? 0) + a.quota);
  for (const [cid, q] of byCreator) {
    const c = cById.get(cid); if (!c) continue;
    const mineThis = (contents ?? []).filter((x) => x.creator_id === cid && x.status !== "canceled" && cMonth(x) === month);
    const done = mineThis.filter((x) => x.status === "uploaded").length;
    rows.push({ name: c.name, code: c.code ?? "", q, done, created: mineThis.length });
  }
  rows.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));

  if (!rows.length) return NextResponse.json({ ok: true, creators: 0, slackSent: false, note: "해당 월 배정 없음" });

  const mark = (r: { q: number; done: number; created: number }) =>
    r.done >= r.q ? "✅" : r.created < r.q ? "⚠️미착수" : "🟡진행중";
  const lines = rows.map((r) => {
    const miss = Math.max(0, r.q - r.created);
    const extra = miss > 0 ? ` · 미생성 ${miss}` : "";
    return `${mark(r)} *${r.code ? r.code + " " : ""}${r.name}* — 배정 ${r.q} · 완료 ${r.done} · 미완료 ${Math.max(0, r.q - r.done)}${extra}`;
  });
  const behind = rows.filter((r) => r.done < r.q).length;
  const header = `📋 *이번 달 할일 진행 리마인드* (${month})\n대상 ${rows.length}명 · 미완료 크리에이터 ${behind}명\n`;
  const slackSent = await sendSlack(header + "\n" + lines.join("\n"));

  return NextResponse.json({ ok: true, creators: rows.length, behind, slackSent });
}

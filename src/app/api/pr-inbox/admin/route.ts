import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// PR Inbox 어드민 API — 로그인 세션 Bearer → role=admin 만 허용.
// GET: 제안 목록(또는 ?msg=<id> 로 원문 1건). PATCH: 상태/담당자 변경.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function auth(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "로그인 필요", status: 401 as const };
  const { data: { user } } = await createClient(url, anonKey).auth.getUser(token);
  if (!user) return { error: "인증 실패", status: 401 as const };
  const admin = getAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return { error: "권한 없음", status: 403 as const };
  return { admin };
}

const STATUSES = ["new", "reviewing", "negotiating", "won", "rejected", "archived"];

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin } = a;

  // 원문 1건 조회 모드
  const msgId = req.nextUrl.searchParams.get("msg");
  if (msgId) {
    const { data, error } = await admin
      .from("pr_inbox_messages")
      .select("text_original, sender_handle, received_at, attachments")
      .eq("id", msgId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ message: data }, { headers: { "Cache-Control": "no-store" } });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("pr_inbox_proposals")
      .select(
        "id, pr_id, message_id, extracted_at, category, proposal_type, brand_name, org_type, contact_email, brand_country, industry, deliverables, product_offer, budget_mentioned, budget_amount, schedule, ko_summary, missing, score, grade, status, assignee, replied_at"
      )
      .order("extracted_at", { ascending: false })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ proposals: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin } = a;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.status != null) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "잘못된 상태" }, { status: 400 });
    patch.status = b.status;
  }
  if (b.assignee !== undefined) patch.assignee = String(b.assignee || "").slice(0, 100) || null;

  const { error } = await admin.from("pr_inbox_proposals").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

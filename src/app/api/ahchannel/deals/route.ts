import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ah!channel 에디터 전용 PR 안건 API. type="ahchannel" 안건만 조회/등록.
// 인증: 로그인 세션 Bearer → 역할 ahchannel/admin 만 허용. 내부 데이터 미노출.
async function auth(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "로그인 필요", status: 401 as const };
  const { data: { user } } = await createClient(url, anonKey).auth.getUser(token);
  if (!user) return { error: "인증 실패", status: 401 as const };
  const admin = getAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "ahchannel" && prof?.role !== "admin") return { error: "권한 없음", status: 403 as const };
  return { admin, role: prof.role as string };
}

const BASE = "https://cc-os.81degree.com/pr/";

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin } = a;
  const { data, error } = await admin.from("deals")
    .select("id, pr_seq, title, client, step, fee, tax, due_date, upload_date, received_date, created_at, brief, share_token, invoice_url, paid_on, payment_confirmed")
    .eq("type", "ahchannel").order("pr_seq", { ascending: false }).range(0, 999);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deals = (data || []).map((d: any) => ({
    id: d.id, prNo: d.pr_seq ? "PR-" + String(d.pr_seq).padStart(3, "0") : null,
    title: d.title, client: d.client, step: d.step ?? 0,
    fee: d.fee != null ? Number(d.fee) : null, tax: d.tax != null ? Number(d.tax) : null,
    dueDate: d.due_date, uploadDate: d.upload_date, receivedDate: d.received_date, createdAt: d.created_at,
    brief: d.brief, shareUrl: d.share_token ? BASE + d.share_token : null,
    invoiced: !!d.invoice_url, paidOn: d.paid_on, paymentConfirmed: !!d.payment_confirmed,
  }));
  return NextResponse.json({ deals }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin } = a;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const title = String(b.title || "").slice(0, 200).trim();
  const client = String(b.client || "").slice(0, 200).trim();
  const brief = String(b.brief || "").slice(0, 8000).trim();
  const fee = b.fee != null && b.fee !== "" ? Math.round(Number(b.fee)) : null;
  const dueDate = String(b.dueDate || "").slice(0, 10) || null;
  if (!title) return NextResponse.json({ error: "안건명을 입력해주세요" }, { status: 400 });

  // 영구 PR 번호(pr_seq) = 현재 최대 + 1
  const { data: mx } = await admin.from("deals").select("pr_seq").order("pr_seq", { ascending: false }).limit(1).maybeSingle();
  const prSeq = (mx?.pr_seq ?? 0) + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = ((globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "");
  const today = new Date().toISOString().slice(0, 10);

  const { data: row, error } = await admin.from("deals").insert({
    title, client: client || null, brief: brief || null, fee, due_date: dueDate,
    type: "ahchannel", source: "company_email", step: 0, manager: b.manager || null,
    pr_seq: prSeq, share_token: token, received_date: today, registered_by: "ah!channel 에디터",
  }).select("id, pr_seq, share_token").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: row.id, prNo: "PR-" + String(row.pr_seq).padStart(3, "0"), shareUrl: BASE + row.share_token });
}

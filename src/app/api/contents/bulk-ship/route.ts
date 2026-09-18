import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// REQ-015: 브랜드사·관리자 배송정보(택배사·송장번호) 일괄 등록.
// 브랜드는 contents 쓰기 권한(RLS)이 없으므로 서버에서 소유권 검증 후 service_role로 갱신.
// 입력: { rows: [{ contentId, courier?, tracking? }] }
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const rows: { contentId?: string; courier?: string; tracking?: string }[] = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "rows 필요" }, { status: 400 });

  const admin = getAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = prof?.role === "admin";
  // 브랜드 소유 범위(브랜드 계정인 경우) — 자신의 브랜드 콘텐츠만 갱신 허용
  let allowedBrandIds: Set<string> | null = null;
  if (!isAdmin) {
    const { data: bm } = await admin.from("brand_members").select("brand_id").eq("user_id", user.id);
    allowedBrandIds = new Set((bm ?? []).map((r) => r.brand_id as string));
    if (!allowedBrandIds.size) return NextResponse.json({ error: "권한 없음(관리자·브랜드 전용)" }, { status: 403 });
  }

  const ids = rows.map((r) => String(r.contentId || "")).filter(Boolean);
  const { data: existing } = await admin.from("contents").select("id, brand_id").in("id", ids);
  const brandById = new Map((existing ?? []).map((c) => [c.id, c.brand_id as string | null]));

  let updated = 0; const skipped: string[] = [];
  for (const r of rows) {
    const id = String(r.contentId || ""); if (!id || !brandById.has(id)) { if (id) skipped.push(id); continue; }
    if (!isAdmin && !(allowedBrandIds!.has(brandById.get(id) as string))) { skipped.push(id); continue; }
    const courier = (r.courier ?? "").toString().trim();
    const tracking = (r.tracking ?? "").toString().trim();
    if (!courier && !tracking) { skipped.push(id); continue; }
    const patch: Record<string, unknown> = { sample_received: true };
    if (courier) patch.sample_courier = courier;
    if (tracking) patch.sample_tracking = tracking;
    const { error } = await admin.from("contents").update(patch).eq("id", id);
    if (error) skipped.push(id); else updated++;
  }
  return NextResponse.json({ ok: true, updated, skipped: skipped.length });
}

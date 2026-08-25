import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncCreatorData } from "@/lib/ig/sync";

export const maxDuration = 120;

// 관리자 트리거 동기화: 크리에이터 인스타 데이터 → 스냅샷/콘텐츠 반영.
// POST body: { creatorId }
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { creatorId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const { creatorId } = body;
  if (!creatorId) return NextResponse.json({ error: "creatorId 필요" }, { status: 400 });

  // 1) 관리자 검증
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자만 동기화할 수 있습니다" }, { status: 403 });

  // 2) 동기화 (수동: 최근 50건 지표)
  try {
    const r = await syncCreatorData(admin, creatorId, { maxMetrics: 50 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// 관리자가 계정(들)을 삭제. 호출자 admin 검증 후 service_role로 auth 유저 삭제(프로필 cascade).
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { ids?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const ids = (body.ids ?? []).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "삭제할 계정 없음" }, { status: 400 });

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자만 삭제할 수 있습니다" }, { status: 403 });

  let ok = 0; const errors: string[] = [];
  for (const id of ids) {
    if (id === user.id) { errors.push("본인 계정은 삭제할 수 없습니다"); continue; }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) errors.push(error.message); else ok++;
  }
  return NextResponse.json({ ok, failed: ids.length - ok, errors });
}

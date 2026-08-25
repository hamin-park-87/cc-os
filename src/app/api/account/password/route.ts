import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { isMaster } from "@/lib/roles";

// 관리자가 계정 비밀번호 변경. 관리자 대상 변경은 마스터만.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { id?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const { id, password } = body;
  if (!id || !password || password.length < 6) return NextResponse.json({ error: "비밀번호는 6자 이상" }, { status: 400 });

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자 전용" }, { status: 403 });

  const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (target?.role === "admin" && !isMaster(user.email)) return NextResponse.json({ error: "관리자 비밀번호는 마스터 관리자만 변경할 수 있습니다" }, { status: 403 });

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

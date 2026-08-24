import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { isMaster } from "@/lib/roles";

// 관리자가 브랜드/크리에이터 계정을 초대. 호출자가 admin인지 검증 후 service_role로 처리.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { email?: string; role?: string; scope?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const { email, role, scope, password } = body;
  if (!email || !role) return NextResponse.json({ error: "email·role 필요" }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "비밀번호는 6자 이상" }, { status: 400 });

  // 1) 호출자 admin 검증 (로그인 토큰)
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

  let admin;
  try { admin = getAdminClient(); }
  catch { return NextResponse.json({ error: "서버에 SUPABASE_SERVICE_ROLE_KEY 미설정" }, { status: 500 }); }

  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자만 초대할 수 있습니다" }, { status: 403 });
  // 관리자(admin) 계정 생성은 마스터 관리자만
  if (role === "admin" && !isMaster(user.email)) return NextResponse.json({ error: "관리자 계정은 마스터 관리자만 만들 수 있습니다" }, { status: 403 });

  // 2) 계정 생성 (이메일 확인 완료 상태 + 비밀번호) — 이메일 발송 불필요
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  let uid = created?.user?.id;
  if (cErr) {
    // 이미 존재하면 기존 유저 찾아 비번·상태 갱신
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    uid = existing?.id;
    if (!uid) return NextResponse.json({ error: cErr.message }, { status: 400 });
    await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
  }

  // 3) 역할·소속 세팅
  await admin.from("profiles").upsert({ id: uid, email, role, status: "active" });
  if (role === "brand" && scope) {
    const { data: b } = await admin.from("brands").select("id").eq("name", scope).maybeSingle();
    if (b) await admin.from("brand_members").upsert({ brand_id: b.id, user_id: uid });
  } else if (role === "creator" && scope) {
    await admin.from("creators").update({ user_id: uid }).eq("name", scope);
  }
  return NextResponse.json({ ok: true });
}

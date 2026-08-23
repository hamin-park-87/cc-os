import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// 관리자가 브랜드/크리에이터 계정을 초대. 호출자가 admin인지 검증 후 service_role로 처리.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { email?: string; role?: string; scope?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const { email, role, scope } = body;
  if (!email || !role) return NextResponse.json({ error: "email·role 필요" }, { status: 400 });

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

  // 2) 초대 발송 (auth.users 생성 + 메일)
  const origin = req.headers.get("origin") ?? undefined;
  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: origin });
  let uid = inv?.user?.id;
  if (invErr) {
    // 이미 존재하는 유저면 기존 id 조회 (재초대/권한변경)
    const { data: list } = await admin.auth.admin.listUsers();
    uid = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!uid) return NextResponse.json({ error: invErr.message }, { status: 400 });
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

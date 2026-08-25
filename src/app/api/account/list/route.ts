import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// 관리자용 계정 목록: profiles(role/status) + auth(last_sign_in_at) 병합.
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자 전용" }, { status: 403 });

  const [{ data: profiles }, authRes, { data: bm }, { data: crs }] = await Promise.all([
    admin.from("profiles").select("id, email, role, status"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("brand_members").select("user_id, brands(name)"),
    admin.from("creators").select("user_id, name").not("user_id", "is", null),
  ]);
  const lastById = new Map((authRes.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brandByUser = new Map((bm ?? []).map((r: any) => [r.user_id, r.brands?.name]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorByUser = new Map((crs ?? []).map((r: any) => [r.user_id, r.name]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (profiles ?? []).map((r: any) => ({
    id: r.id, email: r.email ?? "", role: r.role,
    scope: r.role === "admin" ? "81degree" : r.role === "brand" ? (brandByUser.get(r.id) ?? "—") : r.role === "creator" ? (creatorByUser.get(r.id) ?? "—") : "—",
    status: r.status, lastLogin: lastById.get(r.id) ?? null,
  }));
  return NextResponse.json({ rows });
}

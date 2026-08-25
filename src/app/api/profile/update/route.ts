import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// 크리에이터가 본인 프로필(허용 필드)을 직접 수정. 회사 통제 항목(보수·수량·단가·상태·번호)은 제외.
const ALLOWED = new Set([
  "name_kanji", "name_en", "handle", "photo_url", "category", "tone", "intro",
  "sns", "email", "phone", "address", "address_en", "bank_account", "invoice_reg_no", "entity_type",
]);

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

  const admin = getAdminClient();
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();
  if (!creator) return NextResponse.json({ error: "연결된 크리에이터가 없습니다" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (ALLOWED.has(k)) patch[k] = v;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "수정할 항목 없음" }, { status: 400 });

  const { error } = await admin.from("creators").update(patch).eq("id", creator.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

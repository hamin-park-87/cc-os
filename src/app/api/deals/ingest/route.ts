import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// contact@81degree.com 등 공용 메일함으로 들어온 PR 안건 메일을 시스템에 자동 등록.
// Google Apps Script(또는 Zapier/Make)가 이 엔드포인트로 POST 하도록 연결.
// 인증: 헤더 x-ingest-secret 또는 본문 secret === process.env.DEALS_INGEST_SECRET
//
// 본문(JSON): { secret?, subject, from, fromName?, body?, receivedAt?, messageId?, client?, creatorHint? }
export async function POST(req: NextRequest) {
  const SECRET = process.env.DEALS_INGEST_SECRET;
  if (!SECRET) return NextResponse.json({ error: "server not configured (DEALS_INGEST_SECRET)" }, { status: 500 });

  let payload: Record<string, string> = {};
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const given = req.headers.get("x-ingest-secret") || payload.secret || "";
  if (given !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const subject = (payload.subject || "").trim();
  if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
  const from = (payload.from || "").trim();
  const fromName = (payload.fromName || "").trim();
  const body = (payload.body || "").slice(0, 4000);
  const messageId = (payload.messageId || "").trim();
  const receivedAt = (payload.receivedAt || "").slice(0, 10) || null; // YYYY-MM-DD

  // 의뢰사 추정: 명시값 > 발신자 이름 > 발신 도메인
  const domain = from.includes("@") ? from.split("@")[1]?.split(">")[0]?.trim() : "";
  const client = (payload.client || fromName || domain || from || "미상").slice(0, 120);

  const admin = getAdminClient();

  // 중복 방지: messageId(코드)로 이미 등록된 안건이면 skip
  const code = messageId ? "MAIL-" + messageId.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) : null;
  if (code) {
    const { data: existing } = await admin.from("deals").select("id").eq("code", code).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, deduped: true, id: existing.id });
  }

  // 크리에이터 추정: 이름/핸들이 제목·본문에 포함되면 매칭
  let creator_id: string | null = null;
  const hay = (subject + " " + body + " " + (payload.creatorHint || "")).toLowerCase();
  const { data: creators } = await admin.from("creators").select("id, name, handle");
  for (const c of creators ?? []) {
    const n = (c.name || "").toLowerCase(), h = (c.handle || "").replace(/^@/, "").toLowerCase();
    if ((n && n.length >= 2 && hay.includes(n)) || (h && h.length >= 2 && hay.includes(h))) { creator_id = c.id; break; }
  }

  const { data, error } = await admin.from("deals").insert({
    code, title: subject.slice(0, 200), client, creator_id,
    source: "company_email", type: "creator", step: 0, fee: 0, share_company: 0, share_creator: 0,
    brief: body || null, received_date: receivedAt,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id, matchedCreator: creator_id });
}

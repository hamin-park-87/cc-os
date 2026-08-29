import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// contact@81degree.com 등 공용 메일함으로 들어온 PR 안건을 시스템에 자동 등록.
// coocoo(AI 비서)가 메일을 판단·추출해 아래 JSON을 POST 하도록 연결.
// 인증: 헤더 x-ingest-secret 또는 본문 secret === process.env.DEALS_INGEST_SECRET
//
// 본문(JSON) — coocoo 형식:
//   { isDeal, confidence, client, brand, creator, fee, currency, dueDate,
//     deliverables, secondaryUsage, summary, subject, from, messageId, receivedAt }
//   (구형 { subject, from, body } 도 계속 허용)
export async function POST(req: NextRequest) {
  const SECRET = process.env.DEALS_INGEST_SECRET;
  if (!SECRET) return NextResponse.json({ error: "server not configured (DEALS_INGEST_SECRET)" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any = {};
  try { p = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const given = req.headers.get("x-ingest-secret") || p.secret || "";
  if (given !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const str = (v: unknown, max = 4000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
  const subject = str(p.subject, 250).trim();
  const summary = str(p.summary).trim();
  const body = str(p.body).trim();
  const title0 = subject || summary || body.slice(0, 80);
  if (!title0) return NextResponse.json({ error: "subject/summary required" }, { status: 400 });

  const from = str(p.from, 250).trim();
  const fromName = str(p.fromName, 120).trim();
  const domain = from.includes("@") ? from.split("@")[1]?.split(">")[0]?.trim() : "";
  const client = (str(p.client, 120).trim() || fromName || domain || from || "미상").slice(0, 120);

  const confidence = typeof p.confidence === "number" ? p.confidence : null;
  const isDeal = p.isDeal;
  // coocoo가 "PR 안건 아님"을 확신(>=0.6) → 등록하지 않음(노이즈 방지)
  if (isDeal === false && (confidence ?? 1) >= 0.6) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not a deal" });
  }
  // 애매하면 등록하되 '확인 필요' 표시 (오등록 방지)
  const needsReview = isDeal === false || (confidence != null && confidence < 0.65);

  const fee = Number.isFinite(+p.fee) ? Math.round(+p.fee) : 0;
  const currency = str(p.currency, 8).trim();
  const dueDate = str(p.dueDate, 10).trim() || null;
  const receivedAt = str(p.receivedAt, 10).trim() || new Date().toISOString().slice(0, 10);
  const deliverables = str(p.deliverables, 300).trim();
  const brand = str(p.brand, 120).trim();
  const creatorName = str(p.creator, 120).trim();
  const secondaryUsage = p.secondaryUsage === true || p.secondaryUsage === "true";
  const messageId = str(p.messageId, 120).trim();

  const admin = getAdminClient();

  // 중복 방지: messageId(코드)로 이미 등록된 안건이면 skip
  const code = messageId ? "MAIL-" + messageId.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) : null;
  if (code) {
    const { data: existing } = await admin.from("deals").select("id").eq("code", code).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, deduped: true, id: existing.id });
  }

  // 크리에이터 매칭: coocoo가 지목한 이름/핸들 우선, 없으면 제목·요약에서 탐색
  let creator_id: string | null = null;
  const { data: creators } = await admin.from("creators").select("id, name, handle");
  const hay = (creatorName || (subject + " " + summary + " " + body)).toLowerCase();
  for (const c of creators ?? []) {
    const n = (c.name || "").toLowerCase(), h = (c.handle || "").replace(/^@/, "").toLowerCase();
    if ((n && n.length >= 2 && hay.includes(n)) || (h && h.length >= 2 && hay.includes(h))) { creator_id = c.id; break; }
  }

  // 브리핑 구성
  const meta: string[] = [];
  if (needsReview) meta.push("⚠️ 확인 필요 — coocoo가 PR 안건 여부를 확신하지 못함");
  if (deliverables) meta.push("요청 산출물: " + deliverables);
  if (fee) meta.push("제안 금액: " + fee.toLocaleString() + (currency ? " " + currency : ""));
  if (dueDate) meta.push("납기/희망일: " + dueDate);
  if (secondaryUsage) meta.push("2차 활용: 요청됨");
  if (brand) meta.push("대상 브랜드: " + brand);
  if (creatorName) meta.push("지목 크리에이터: " + creatorName + (creator_id ? " (매칭됨)" : " (미매칭)"));
  if (confidence != null) meta.push("판단 신뢰도: " + Math.round(confidence * 100) + "%");
  if (from) meta.push("출처: " + from);
  const brief = [summary || body, meta.join("\n")].filter(Boolean).join("\n\n") || null;

  const title = (needsReview ? "🔎 " : "") + title0.slice(0, 190);

  const { data, error } = await admin.from("deals").insert({
    code, title, client, creator_id,
    source: "company_email", type: "creator", step: 0,
    fee, share_company: 0, share_creator: 0,
    due_date: dueDate, received_date: receivedAt, brief,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id, needsReview, matchedCreator: creator_id });
}

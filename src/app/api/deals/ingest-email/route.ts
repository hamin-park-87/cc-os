import { NextRequest, NextResponse } from "next/server";
import { ingestDeal, notifyDealSlack, parseEmailWithClaude } from "@/lib/deals/ingest";

export const maxDuration = 60;

// 원본 메일(subject/from/body)을 받아 Claude가 판단·추출 → PR 안건 등록 + 슬랙 스레드 알림.
// Google Apps Script(contact@)가 새 메일을 이 엔드포인트로 POST.
// 인증: 헤더 x-ingest-secret 또는 본문 secret === DEALS_INGEST_SECRET
export async function POST(req: NextRequest) {
  const SECRET = process.env.DEALS_INGEST_SECRET;
  if (!SECRET) return NextResponse.json({ error: "server not configured (DEALS_INGEST_SECRET)" }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const given = req.headers.get("x-ingest-secret") || b.secret || "";
  if (given !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const subject = String(b.subject || "").slice(0, 300);
  const from = String(b.from || "").slice(0, 300);
  const body = String(b.body || "").slice(0, 8000);
  const messageId = String(b.messageId || "");
  const receivedAt = String(b.receivedAt || "").slice(0, 10);
  if (!subject && !body) return NextResponse.json({ error: "subject/body required" }, { status: 400 });

  // Claude 파싱 (키 없으면 규칙 기반 폴백: 제목=안건명)
  const parsed = await parseEmailWithClaude({ subject, from, body });
  const p = { ...(parsed || {}), subject, from, body, messageId, receivedAt,
    fromName: (from.match(/^(.*?)</) || [, ""])[1].trim() };

  const res = await ingestDeal(p);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  if (res.skipped) return NextResponse.json({ ok: true, skipped: true, reason: "not a deal", aiUsed: !!parsed });
  if (res.deduped) return NextResponse.json({ ok: true, deduped: true, id: res.id });
  const slackSent = await notifyDealSlack(p, res);
  return NextResponse.json({ ok: true, id: res.id, needsReview: res.needsReview, slackSent, aiUsed: !!parsed });
}

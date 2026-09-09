import { NextRequest, NextResponse } from "next/server";
import { ingestDeal, notifyDealSlack } from "@/lib/deals/ingest";

// contact@ 등 공용 메일함 PR 안건을 시스템에 자동 등록 + 슬랙 알림.
// coocoo 등 AI가 구조화 JSON을 POST 하는 엔드포인트.
// 인증: 헤더 x-ingest-secret 또는 본문 secret === DEALS_INGEST_SECRET
export async function POST(req: NextRequest) {
  const SECRET = process.env.DEALS_INGEST_SECRET;
  if (!SECRET) return NextResponse.json({ error: "server not configured (DEALS_INGEST_SECRET)" }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any = {};
  try { p = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const given = req.headers.get("x-ingest-secret") || p.secret || "";
  if (given !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await ingestDeal(p);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  if (res.skipped) return NextResponse.json({ ok: true, skipped: true, reason: "not a deal" });
  if (res.deduped) return NextResponse.json({ ok: true, deduped: true, id: res.id });
  const slackSent = await notifyDealSlack(p, res);
  return NextResponse.json({ ok: true, id: res.id, needsReview: res.needsReview, slackSent });
}

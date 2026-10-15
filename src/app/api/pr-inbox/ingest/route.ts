import { NextRequest, NextResponse } from "next/server";
import { ingestDM, type DmInput } from "@/lib/ingest/prInboxIngest";

// 수동/백필 인입 — DM(또는 배열)을 받아 분류·추출·저장. PR_INBOX_SECRET 보호.
// 웹훅(Phase B) 전, 과거 DM 백필·테스트용. 예: POST /api/pr-inbox/ingest?key=xxx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.PR_INBOX_SECRET;
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("x-pr-inbox-key") || "";
  if (!secret || key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const items: DmInput[] = Array.isArray(body) ? body : [body];
  const results = [];
  for (const it of items) {
    if (!it?.text) { results.push({ error: "text 필요" }); continue; }
    try { results.push(await ingestDM({ ...it, source: it.source ?? "manual" })); }
    catch (e) { results.push({ error: (e as Error).message }); }
  }
  return NextResponse.json({ ok: true, results });
}

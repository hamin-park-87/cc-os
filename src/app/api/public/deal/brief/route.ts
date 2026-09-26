import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail
const MODEL = process.env.ORIENT_AI_MODEL || "claude-haiku-4-5-20251001";

// 의뢰사가 보낸 안건 원문을 대시보드에 인입하고, AI가 핵심을 구조화 요약해서 남긴다.
// 공개(토큰) 엔드포인트 — 로그인 불필요. 입력: { token, raw }
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || "");
  const raw = String(b.raw || "").slice(0, 20000).trim();
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });
  if (raw.length < 10) return NextResponse.json({ error: "내용이 너무 짧아요" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals")
    .select("id, pr_seq, title, client, manager, share_token, creator_id, slack_threads").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 원문 저장 + 처리중 표시
  await admin.from("deals").update({ brief_raw: raw, brief_ai_status: "processing" }).eq("id", deal.id);

  // AI 요약
  const key = process.env.ANTHROPIC_API_KEY;
  let summary: Record<string, unknown> | null = null;
  if (key) {
    try { summary = await summarizeBrief(key, raw); } catch (e) { console.warn("[brief-ai]", (e as Error).message); }
  }
  const status = summary ? "done" : "failed";
  await admin.from("deals").update({ brief_summary: summary, brief_ai_status: status, brief_ai_at: new Date().toISOString() }).eq("id", deal.id);

  // Slack 알림 — 안건 스레드에 인입 사실 + 요약 첫줄
  try {
    const prNo = deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : "";
    const url = `https://cc-os.81degree.com/pr/${deal.share_token}`;
    const line = (summary?.summaryKo as string) || raw.slice(0, 200);
    const reply = `📥 *의뢰 내용 인입* (의뢰사)\n> ${line}`;
    const rootText = `【${deal.client || ""}】${prNo}\n${deal.title}\n🔗 대시보드 / ダッシュボード: ${url}`;
    let ccChannel = "";
    if (deal.creator_id) { const { data: cr } = await admin.from("creators").select("slack_channel").eq("id", deal.creator_id).maybeSingle(); ccChannel = (cr?.slack_channel as string) || ""; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threads: Record<string, string> = (deal.slack_threads && typeof deal.slack_threads === "object") ? { ...(deal.slack_threads as any) } : {};
    const targets = [PR_CHANNEL, ...(ccChannel && ccChannel !== PR_CHANNEL ? [ccChannel] : [])];
    let changed = false;
    for (const ch of targets) {
      let ts = threads[ch];
      if (!ts) { const t2 = await slackPost(ch, rootText); if (t2) { ts = t2; threads[ch] = t2; changed = true; } }
      if (ts) await slackPost(ch, reply, ts);
    }
    if (changed) await admin.from("deals").update({ slack_threads: threads }).eq("id", deal.id);
  } catch { /* 알림 실패해도 인입은 유지 */ }

  return NextResponse.json({ ok: true, status, summary });
}

const PROMPT = `당신은 인플루언서 PR 대행사의 어시스턴트입니다. 아래는 의뢰사(클라이언트)가 보낸 안건 원문입니다(주로 일본어).
크리에이터·매니저가 한눈에 이해할 수 있도록 핵심을 구조화하세요. 크리에이터는 대부분 일본인이므로 한국어(내부용)와 일본어(크리에이터용)를 모두 작성하세요.
JSON만 출력하세요(그 외 텍스트 금지). 값이 없으면 빈 배열/빈 문자열.
{
 "summaryKo": "2~4문장 핵심 요약(한국어)",
 "summaryJa": "同じ内容の要約(日本語)",
 "client": "의뢰사/브랜드",
 "product": "상품/서비스",
 "status": "진행 상태(예: 결정 전/기용 검토 등, 원문 기준)",
 "deliverables": ["요청 산출물(한국어): 매체·투고 횟수·형식 등 3~6개"],
 "deliverablesJa": ["同(日本語)"],
 "secondary": "2차 이용 여부·기간·범위(한국어), 없으면 빈 문자열",
 "secondaryJa": "同(日本語)",
 "fee": "개런티/조건 관련 원문 요지(한국어)",
 "schedule": [{"date":"YYYY-MM-DD 또는 원문 표기","itemKo":"항목(한국어)","itemJa":"項目(日本語)"}],
 "notes": ["주의사항/조건(한국어) 3~8개"],
 "notesJa": ["同(日本語)"]
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function summarizeBrief(key: string, raw: string): Promise<Record<string, any> | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: "user", content: `${PROMPT}\n\n[안건 원문]\n${raw}` }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || "Claude 요청 실패");
  if (j?.stop_reason === "max_tokens") throw new Error("AI 응답이 잘렸어요(max_tokens)");
  const text = (j?.content?.[0]?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

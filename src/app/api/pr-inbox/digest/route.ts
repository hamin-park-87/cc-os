import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

// PR Inbox 일일 다이제스트 — 최근 24h 신규 제안 요약을 Slack에 게시.
// Vercel 크론에서 호출. CRON_SECRET 설정 시 보호. 채널은 PR_INBOX_SLACK_CHANNEL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = { ad_pr: "광고·PR", seeding: "제품시딩", event: "이벤트" };

export async function GET(req: NextRequest) {
  const sec = process.env.CRON_SECRET;
  if (sec) {
    const key = req.nextUrl.searchParams.get("key") || "";
    const auth = req.headers.get("authorization") || "";
    if (key !== sec && auth !== `Bearer ${sec}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("pr_inbox_proposals")
    .select("pr_id, brand_name, category, budget_amount, ko_summary, grade")
    .gte("extracted_at", since)
    .order("extracted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const lines = rows.map((r) => {
    const budget = r.budget_amount ? ` · ${Number(r.budget_amount).toLocaleString()}엔` : "";
    const g = r.grade ? ` [${r.grade}]` : "";
    return `• *${r.pr_id}*${g} ${r.brand_name || "(브랜드 미상)"} — ${CAT_LABEL[r.category] || r.category}${budget}\n   ${(r.ko_summary || "").slice(0, 120)}`;
  });
  const header = `🗂️ *PR Inbox 일일 다이제스트* — 최근 24h 신규 제안 ${rows.length}건`;
  const text = rows.length ? `${header}\n\n${lines.join("\n")}` : `${header}\n새 제안이 없습니다.`;

  const channel = process.env.PR_INBOX_SLACK_CHANNEL;
  if (channel) await slackPost(channel, text);
  return NextResponse.json({ ok: true, count: rows.length, posted: !!channel });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail

const ROLE_LABEL: Record<string, string> = { client: "의뢰사", creator: "CC", manager: "매니저" };
const KIND_LABEL: Record<string, string> = { note: "댓글", request: "수정요청", draft: "1차 완성본" };

// 공개 안건 대시보드 협업 — 토큰으로 코멘트/수정요청/초안 등록 (로그인 불필요) + Slack 알림
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || "");
  const role = ["client", "creator", "manager"].includes(b.role) ? b.role : "client";
  const kind = ["note", "request", "draft"].includes(b.kind) ? b.kind : "note";
  const author = String(b.author || "").slice(0, 60).trim();
  const body = String(b.body || "").slice(0, 4000).trim();
  const rawUrl = String(b.url || "").slice(0, 1000).trim();
  const urlOk = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });
  if (!body && !urlOk) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id, pr_seq, title, manager, share_token, creator_id").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  // CC별 소통 슬랙 채널(있으면 그 채널로도 알림)
  let ccChannel = "";
  if (deal.creator_id) { const { data: cr } = await admin.from("creators").select("slack_channel").eq("id", deal.creator_id).maybeSingle(); ccChannel = (cr?.slack_channel as string) || ""; }

  const { data: row, error } = await admin.from("deal_comments")
    .insert({ deal_id: deal.id, role, kind, author: author || ROLE_LABEL[role], body: body || null, url: urlOk || null })
    .select("id, role, author, kind, body, url, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Slack 알림 (매니저·팀) — 의뢰사 이메일 미보유 시 대시보드가 의뢰사 채널
  try {
    const prNo = deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : "";
    const url = `https://cc-os.81degree.com/pr/${deal.share_token}`;
    const head = `💬 [${prNo}] ${deal.title}\n${ROLE_LABEL[role]} *${author || ""}* · ${KIND_LABEL[kind]}`;
    const snippet = (body || urlOk).slice(0, 300);
    const msg = `${head}\n> ${snippet}${urlOk && body ? `\n🔗 ${urlOk}` : ""}\n\n🔗 대시보드 / ダッシュボード: ${url}`;
    await slackPost(PR_CHANNEL, msg);                     // 팀·매니저
    if (ccChannel && ccChannel !== PR_CHANNEL) await slackPost(ccChannel, msg); // 해당 CC 채널
  } catch { /* 알림 실패해도 등록은 유지 */ }

  return NextResponse.json({ ok: true, comment: { id: row.id, role: row.role, author: row.author, kind: row.kind, body: row.body, url: row.url, createdAt: row.created_at } });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail
const ROLE_LABEL: Record<string, string> = { client: "의뢰사", creator: "CC", manager: "매니저" };
const yen = (n: number) => "¥" + n.toLocaleString();

// 비용 협의 — CC/매니저 희망금액 제안(propose) / 의뢰사 합의(agree)
// 공개(토큰) 엔드포인트. 입력: { token, action, by, author, amount, note, proposalId }
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || "");
  const action = String(b.action || "propose");
  const author = String(b.author || "").slice(0, 60).trim();
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals")
    .select("id, pr_seq, title, client, share_token, creator_id, slack_threads, fee_agreed").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  let notify = "";
  if (action === "propose") {
    const by = ["creator", "manager", "client"].includes(b.by) ? b.by : "creator";
    const amount = Math.round(Number(b.amount) || 0);
    const note = String(b.note || "").slice(0, 500).trim();
    if (amount <= 0) return NextResponse.json({ error: "금액을 입력해주세요" }, { status: 400 });
    const { error } = await admin.from("fee_proposals").insert({ deal_id: deal.id, by, author: author || ROLE_LABEL[by], amount, note: note || null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // 새 제안이 들어오면 이전 합의는 해제(재협의)
    if (deal.fee_agreed) await admin.from("deals").update({ fee_agreed: false }).eq("id", deal.id);
    notify = `💰 *희망 비용 제안* (${ROLE_LABEL[by]} ${author || ""})\n> ${yen(amount)}${note ? `\n${note}` : ""}`;
  } else if (action === "agree") {
    const proposalId = String(b.proposalId || "");
    const { data: p } = await admin.from("fee_proposals").select("id, amount, by, author").eq("id", proposalId).eq("deal_id", deal.id).maybeSingle();
    if (!p) return NextResponse.json({ error: "제안을 찾을 수 없어요" }, { status: 404 });
    await admin.from("fee_proposals").update({ status: "agreed" }).eq("id", p.id);
    await admin.from("deals").update({ fee: p.amount, fee_agreed: true }).eq("id", deal.id);
    notify = `✅ *비용 합의 완료* — ${yen(Number(p.amount))} (의뢰사 ${author || ""} 승인)`;
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  // Slack 알림 — 안건 스레드에 누적
  try {
    const prNo = deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : "";
    const url = `https://cc-os.81degree.com/pr/${deal.share_token}`;
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
      if (ts) await slackPost(ch, notify, ts);
    }
    if (changed) await admin.from("deals").update({ slack_threads: threads }).eq("id", deal.id);
  } catch { /* 알림 실패해도 협의는 유지 */ }

  return NextResponse.json({ ok: true });
}

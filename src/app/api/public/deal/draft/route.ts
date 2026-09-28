import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D";

// 초안(결과물) 컨펌 사이클 — 승인(approve) / 수정요청(revise)
// 공개(토큰) 엔드포인트. 입력: { token, draftId, action, author, note }
export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || ""), draftId = String(b.draftId || "");
  const action = String(b.action || "");
  const author = String(b.author || "").slice(0, 60).trim();
  const note = String(b.note || "").slice(0, 4000).trim();
  if (!token || !draftId || !["approve", "revise"].includes(action)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id, pr_seq, title, client, share_token, creator_id, slack_threads").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: draft } = await admin.from("deal_comments").select("id, kind").eq("id", draftId).eq("deal_id", deal.id).maybeSingle();
  if (!draft || draft.kind !== "draft") return NextResponse.json({ error: "초안을 찾을 수 없어요" }, { status: 404 });

  let notify = "";
  if (action === "approve") {
    await admin.from("deal_comments").update({ status: "approved" }).eq("id", draftId);
    notify = `✅ *초안 승인* (의뢰사 ${author || ""}) — 결과물 확정`;
  } else {
    if (!note) return NextResponse.json({ error: "수정 내용을 입력해주세요" }, { status: 400 });
    await admin.from("deal_comments").update({ status: "revise" }).eq("id", draftId);
    // 수정요청 코멘트를 해당 초안 아래(대댓글)로 기록
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editKey = ((globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "");
    await admin.from("deal_comments").insert({ deal_id: deal.id, role: "client", kind: "request", author: author || "의뢰사", body: note, parent_id: draftId, edit_key: editKey });
    notify = `✏️ *수정요청* (의뢰사 ${author || ""})\n> ${note.slice(0, 300)}`;
  }

  // Slack 알림 — 안건 스레드 누적
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
  } catch { /* noop */ }

  return NextResponse.json({ ok: true });
}

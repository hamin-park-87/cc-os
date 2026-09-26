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
  const parentId = String(b.parentId || "").trim() || null;
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });
  if (!body && !urlOk) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id, pr_seq, title, client, manager, share_token, creator_id, slack_threads").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  // CC별 소통 슬랙 채널(있으면 그 채널로도 알림)
  let ccChannel = "";
  if (deal.creator_id) { const { data: cr } = await admin.from("creators").select("slack_channel").eq("id", deal.creator_id).maybeSingle(); ccChannel = (cr?.slack_channel as string) || ""; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editKey = ((globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "");
  const { data: row, error } = await admin.from("deal_comments")
    .insert({ deal_id: deal.id, role, kind, author: author || ROLE_LABEL[role], body: body || null, url: urlOk || null, edit_key: editKey, parent_id: parentId })
    .select("id, role, author, kind, body, url, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Slack 알림 — 안건별 루트 메시지(【의뢰사】PR-0XX) 아래 스레드로 누적
  try {
    const prNo = deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : "";
    const url = `https://cc-os.81degree.com/pr/${deal.share_token}`;
    const snippet = (body || urlOk).slice(0, 300);
    const reply = `${ROLE_LABEL[role]} *${author || ""}* · ${KIND_LABEL[kind]}\n> ${snippet}${urlOk && body ? `\n🔗 ${urlOk}` : ""}`;
    const rootText = `【${deal.client || ""}】${prNo}\n${deal.title}\n🔗 대시보드 / ダッシュボード: ${url}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threads: Record<string, string> = (deal.slack_threads && typeof deal.slack_threads === "object") ? { ...(deal.slack_threads as any) } : {};
    const targets = [PR_CHANNEL, ...(ccChannel && ccChannel !== PR_CHANNEL ? [ccChannel] : [])];
    let changed = false;
    for (const ch of targets) {
      let ts = threads[ch];
      if (!ts) { const t2 = await slackPost(ch, rootText); if (t2) { ts = t2; threads[ch] = t2; changed = true; } } // 루트 최초 생성
      if (ts) await slackPost(ch, reply, ts); // 스레드 답글로 누적
    }
    if (changed) await admin.from("deals").update({ slack_threads: threads }).eq("id", deal.id);
  } catch { /* 알림 실패해도 등록은 유지 */ }

  return NextResponse.json({ ok: true, editKey, comment: { id: row.id, role: row.role, author: row.author, kind: row.kind, body: row.body, url: row.url, createdAt: row.created_at } });
}

// 수정 — 작성자 본인(editKey 일치)만
export async function PATCH(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {}; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || ""), id = String(b.id || ""), editKey = String(b.editKey || "");
  const body = String(b.body || "").slice(0, 4000).trim();
  const rawUrl = String(b.url || "").slice(0, 1000).trim(); const urlOk = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
  if (!token || !id || !editKey) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!body && !urlOk) return NextResponse.json({ error: "내용을 입력해주세요" }, { status: 400 });
  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: c } = await admin.from("deal_comments").select("id, edit_key").eq("id", id).eq("deal_id", deal.id).maybeSingle();
  if (!c || c.edit_key !== editKey) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { error } = await admin.from("deal_comments").update({ body: body || null, url: urlOk || null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 삭제 — 작성자 본인(editKey 일치)만
export async function DELETE(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {}; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const token = String(b.token || ""), id = String(b.id || ""), editKey = String(b.editKey || "");
  if (!token || !id || !editKey) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: c } = await admin.from("deal_comments").select("id, edit_key").eq("id", id).eq("deal_id", deal.id).maybeSingle();
  if (!c || c.edit_key !== editKey) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { error } = await admin.from("deal_comments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

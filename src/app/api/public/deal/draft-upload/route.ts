import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D";
const MAX_BYTES = 200 * 1024 * 1024; // 200MB

// 초안(결과물)을 파일(영상/이미지)로 업로드 — 승인 전 콘텐츠를 대시보드에서만 확인.
// multipart: token, file, author, note
export async function POST(req: NextRequest) {
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "invalid form" }, { status: 400 }); }
  const token = String(fd.get("token") || "");
  const author = String(fd.get("author") || "").slice(0, 60).trim();
  const note = String(fd.get("note") || "").slice(0, 4000).trim();
  const file = fd.get("file");
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return NextResponse.json({ error: "파일이 필요해요" }, { status: 400 });
  const f = file as File;
  if (f.size > MAX_BYTES) return NextResponse.json({ error: "파일이 너무 커요(최대 200MB)" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals").select("id, pr_seq, title, client, share_token, creator_id, slack_threads").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const safe = (f.name || "draft").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `draft/${deal.id}/${Date.now()}_${safe}`;
  const buf = Buffer.from(await f.arrayBuffer());
  const { error: upErr } = await admin.storage.from("attachments").upload(path, buf, { upsert: true, contentType: f.type || "application/octet-stream" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const fileUrl = admin.storage.from("attachments").getPublicUrl(path).data.publicUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editKey = ((globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "");
  const { data: row, error } = await admin.from("deal_comments")
    .insert({ deal_id: deal.id, role: "creator", kind: "draft", author: author || "CC", body: note || f.name || null, url: fileUrl, status: "review", edit_key: editKey })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Slack 알림
  try {
    const prNo = deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : "";
    const url = `https://cc-os.81degree.com/pr/${deal.share_token}`;
    const rootText = `【${deal.client || ""}】${prNo}\n${deal.title}\n🔗 대시보드 / ダッシュボード: ${url}`;
    const notify = `🎬 *초안 업로드* (${author || "CC"}) — ${f.name}\n🔗 ${fileUrl}`;
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

  return NextResponse.json({ ok: true, id: row.id, url: fileUrl });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// 청구서/입금 — multipart. 필드:
//  kind = "invoice" (우리 청구서 업로드) | "payment" (의뢰사 입금일+송금확인증)
//  token, file(선택), paidOn(선택, YYYY-MM-DD), author(선택)
export async function POST(req: NextRequest) {
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "invalid form" }, { status: 400 }); }
  const token = String(fd.get("token") || "");
  const kind = String(fd.get("kind") || "");
  const author = String(fd.get("author") || "").slice(0, 60).trim();
  const paidOn = String(fd.get("paidOn") || "").slice(0, 10);
  const file = fd.get("file");
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });
  if (!["invoice", "payment"].includes(kind)) return NextResponse.json({ error: "kind 오류" }, { status: 400 });

  const admin = getAdminClient();
  const { data: deal } = await admin.from("deals")
    .select("id, pr_seq, title, client, share_token, creator_id, slack_threads").eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 파일 업로드(있으면)
  let fileUrl = "", fileName = "";
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > MAX_BYTES) return NextResponse.json({ error: "파일이 너무 커요(최대 15MB)" }, { status: 400 });
    const safe = (f.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${kind}/${deal.id}/${Date.now()}_${safe}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error: upErr } = await admin.storage.from("attachments").upload(path, buf, { upsert: true, contentType: f.type || "application/octet-stream" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    fileUrl = admin.storage.from("attachments").getPublicUrl(path).data.publicUrl;
    fileName = f.name || safe;
  }

  const now = new Date().toISOString();
  let notify = "";
  if (kind === "invoice") {
    if (!fileUrl) return NextResponse.json({ error: "청구서 파일이 필요해요" }, { status: 400 });
    await admin.from("deals").update({ invoice_url: fileUrl, invoice_name: fileName, invoice_at: now }).eq("id", deal.id);
    notify = `🧾 *청구서 업로드* (${author || "81degree"})\n${fileName}\n🔗 ${fileUrl}`;
  } else {
    // payment: 입금일 + 송금확인증(선택)
    if (!paidOn && !fileUrl) return NextResponse.json({ error: "입금일 또는 송금확인증을 입력해주세요" }, { status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {};
    if (paidOn) patch.paid_on = paidOn;
    if (fileUrl) { patch.remittance_url = fileUrl; patch.remittance_name = fileName; patch.remittance_at = now; }
    await admin.from("deals").update(patch).eq("id", deal.id);
    notify = `💴 *입금 확인* (의뢰사 ${author || ""})${paidOn ? `\n입금일: ${paidOn}` : ""}${fileUrl ? `\n송금확인증: ${fileName}\n🔗 ${fileUrl}` : ""}`;
  }

  // Slack 알림 — 안건 스레드
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
  } catch { /* 알림 실패해도 저장은 유지 */ }

  return NextResponse.json({ ok: true, fileUrl, fileName });
}

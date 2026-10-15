import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { ingestDM } from "@/lib/ingest/prInboxIngest";

// Instagram DM 웹훅 — ah!channel PR Inbox 실시간 수집.
// GET: Meta 구독 검증 핸드셰이크. POST: 서명검증 → DM 추출 → ingestDM.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET: 웹훅 등록 시 Meta가 보내는 검증 요청
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  const verify = process.env.IG_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && verify && token === verify) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return NextResponse.json({ error: "verify failed" }, { status: 403 });
}

// X-Hub-Signature-256 = sha256=HMAC(raw, IG_APP_SECRET)
function verifySig(raw: string, header: string | null): boolean {
  const secret = process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
  if (!secret) return true; // 미설정 시 생략(운영에선 반드시 설정)
  if (!header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySig(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  if (body.object !== "instagram") return NextResponse.json({ ok: true });

  const admin = getAdminClient();
  const tasks: Promise<unknown>[] = [];

  for (const entry of body.entry || []) {
    const recipientAcct = entry.id; // 수신 계정(우리 = ah!channel)
    for (const ev of entry.messaging || []) {
      const msg = ev.message;
      if (!msg || msg.is_echo) continue; // 우리가 보낸 메시지(에코) 무시
      const mid: string | undefined = msg.mid;
      const text: string = msg.text || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attachments = (msg.attachments || [])
        .map((a: any) => ({ type: a.type, url: a.payload?.url }))
        .filter((a: { url?: string }) => a.url);
      if (!text && !attachments.length) continue;

      tasks.push((async () => {
        try {
          // 중복(재시도) 방지 — 이미 처리한 mid면 skip
          if (mid) {
            const { data: dup } = await admin.from("pr_inbox_messages").select("id").eq("mid", mid).maybeSingle();
            if (dup) return;
          }
          await ingestDM({
            text: text || "(첨부만 있는 메시지)",
            mid,
            ig_account: String(recipientAcct ?? ""),
            sender_id: String(ev.sender?.id ?? ""),
            thread_id: String(ev.sender?.id ?? ""), // 발신자별 대화 스레드
            attachments,
            raw: ev,
            source: "webhook",
            received_at: ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : undefined,
          });
        } catch (e) {
          console.warn("[dm-webhook ingest]", (e as Error).message);
        }
      })());
    }
  }

  await Promise.allSettled(tasks);
  return NextResponse.json({ ok: true });
}

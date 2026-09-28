import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost, slackReplies } from "@/lib/notify";
import { composeReplyFromThread } from "@/lib/deals/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

// 회신 초안 트리거 이모지(관리자가 스레드에 이 반응을 달면 협의 요약→회신 이메일 초안 생성)
const TRIGGERS = new Set([process.env.SLACK_REPLY_EMOJI || "email", "email", "envelope", "incoming_envelope", "e-mail"]);

// Slack 서명 검증 (SLACK_SIGNING_SECRET 설정 시)
function verify(req: NextRequest, raw: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // 미설정이면 검증 생략(설정 강력 권장)
  const ts = req.headers.get("x-slack-request-timestamp") || "";
  const sig = req.headers.get("x-slack-signature") || "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5분 초과 거부(재생공격 방지)
  const base = `v0:${ts}:${raw}`;
  const mine = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(req, raw)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = {};
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  // 1) URL 검증 챌린지
  if (b.type === "url_verification") return NextResponse.json({ challenge: b.challenge });

  if (b.type === "event_callback" && b.event?.type === "reaction_added") {
    const ev = b.event;
    if (!TRIGGERS.has(ev.reaction)) return NextResponse.json({ ok: true });
    const eventId = String(b.event_id || `${ev.item?.channel}:${ev.item?.ts}:${ev.reaction}`);
    const admin = getAdminClient();
    // 중복 처리 방지
    const dedupe = await admin.from("slack_events").insert({ event_id: eventId }).select("event_id").maybeSingle();
    if (dedupe.error) return NextResponse.json({ ok: true }); // 이미 처리됨(유일키 충돌) → 무시

    const channel = ev.item?.channel as string; const ts = ev.item?.ts as string;
    if (!channel || !ts) return NextResponse.json({ ok: true });
    try {
      // 스레드 루트 파악 후 전체 대화 읽기
      let msgs = await slackReplies(channel, ts);
      const rootTs = (msgs[0] && (msgs[0] as { thread_ts?: string }).thread_ts) || (msgs[0]?.ts) || ts;
      if (rootTs !== ts) msgs = await slackReplies(channel, rootTs);
      if (!msgs.length) msgs = await slackReplies(channel, ts);
      const transcript = msgs.map((m) => (m.bot_id ? "[BOT] " : "[사람] ") + m.text).join("\n---\n");
      const draft = await composeReplyFromThread(transcript);
      const rt = rootTs || ts;
      if (draft) {
        await slackPost(channel, `🤖 *스레드 협의 반영 — 회신 초안 / 協議反映 返信ドラフト*\n(매니저: 검토·수정 후 contact@에서 회신 / ご確認後 contact@ より返信)\n\n${draft}`, rt);
      } else {
        await slackPost(channel, "⚠️ 회신 초안 생성 실패 (ANTHROPIC_API_KEY 확인). / 生成に失敗しました。", rt);
      }
    } catch (e) { console.warn("[slack events]", (e as Error).message); }
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

// IG 토큰 만료/무효 크리에이터의 각 슬랙 채널로 "재연동 안내" 자동 발송.
// 재발송 방지: reconnect_notified_at 기준 RENOTIFY_DAYS일 내 재발송 안 함.
// ?preview=1 → 발송하지 않고 대상·문구만 반환. CRON_SECRET 설정 시 보호.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cc-os.81degree.com";
const RENOTIFY_DAYS = 7;

function buildMsg(name: string, link: string): string {
  return [
    `📷 *Instagram連携の再設定のお願い / 인스타 재연동 요청*`,
    ``,
    `${name}さん、いつもありがとうございます！`,
    `アカウントのInstagram連携が切れており（期限切れ、またはパスワード変更などで再認証が必要な状態）、インサイトのデータが更新されていません。`,
    `お手数ですが、下記リンクからご自身のInstagramでログイン・許可して再連携をお願いします👇`,
    link,
    ``,
    `※ パスワードを変更すると連携が切れることがあります。`,
    `_（담당자 참고: ${name} 인스타 토큰 만료 → 재연동 안내 자동 발송）_`,
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const sec = process.env.CRON_SECRET;
  if (sec) {
    const key = req.nextUrl.searchParams.get("key") || "";
    const auth = req.headers.get("authorization") || "";
    if (key !== sec && auth !== `Bearer ${sec}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const admin = getAdminClient();

  const { data: accts, error } = await admin
    .from("ig_accounts")
    .select("creator_id, status, reconnect_notified_at")
    .neq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const due = (accts || []).filter((a) => {
    if (!a.reconnect_notified_at) return true;
    return now - new Date(a.reconnect_notified_at).getTime() > RENOTIFY_DAYS * 86400000;
  });

  const ids = due.map((a) => a.creator_id);
  const { data: crs } = ids.length
    ? await admin.from("creators").select("id, name, slack_channel").in("id", ids)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmap: Record<string, any> = Object.fromEntries((crs || []).map((c: any) => [c.id, c]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const a of due) {
    const c = cmap[a.creator_id];
    if (!c) { results.push({ creator_id: a.creator_id, skipped: "크리에이터 없음" }); continue; }
    if (!c.slack_channel) { results.push({ name: c.name, skipped: "slack_channel 없음" }); continue; }
    const link = `${APP_URL}/api/ig/start?creator=${a.creator_id}`;
    const text = buildMsg(c.name, link);
    if (preview) { results.push({ name: c.name, channel: c.slack_channel, text }); continue; }
    try {
      await slackPost(c.slack_channel, text);
      await admin.from("ig_accounts").update({ reconnect_notified_at: new Date().toISOString() }).eq("creator_id", a.creator_id);
      results.push({ name: c.name, channel: c.slack_channel, sent: true });
    } catch (e) {
      results.push({ name: c.name, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, preview, count: results.length, results });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendSlack, sendEmail, slackPost } from "@/lib/notify";
import { MASTER_EMAIL } from "@/lib/roles";

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail (팀)
const CREATOR_CHANNEL = process.env.CREATOR_SLACK_CHANNEL || "C0B2VEM6SAF"; // #05_cc (크리에이터 참여)

export const maxDuration = 60;

// 마감 임박/지연 리마인드: 매일 실행. Slack 요약 + 크리에이터별 이메일.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) { if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ error: "service role 미설정" }, { status: 500 }); }

  const now = new Date();
  const dU = (ds?: string | null) => ds ? Math.round((new Date(ds).getTime() - now.getTime()) / 86400000) : null;
  const tag = (du: number) => du < 0 ? `⚠️ ${-du}일 지연` : du === 0 ? "🔴 오늘 마감" : `🟡 D-${du}`;

  const [{ data: creators }, { data: deals }, { data: contents }] = await Promise.all([
    admin.from("creators").select("id, name, email"),
    admin.from("deals").select("title, client, creator_id, due_date, step, manager"),
    admin.from("contents").select("product, creator_id, status, sched, brand_id, kind"),
  ]);
  const cById = new Map((creators ?? []).map((c) => [c.id, c]));

  // 크리에이터별 위험 항목 수집 (납기 3일 이내 또는 경과)
  type Item = { label: string; du: number; title: string };
  const byCreator = new Map<string, Item[]>();
  const push = (cid: string, it: Item) => { const a = byCreator.get(cid) ?? []; a.push(it); byCreator.set(cid, a); };
  // REQ-009: 외부 PR 업로드 기일 리마인드 — 담당자(manager)별 그룹 (PR 채널 알림용)
  const dealsByMgr = new Map<string, { title: string; client: string; creator: string; du: number }[]>();
  for (const d of deals ?? []) {
    if (d.step >= 5) continue; const du = dU(d.due_date);
    if (du != null && du <= 3) {
      push(d.creator_id, { label: `PR: ${d.title} (${d.client}) 납기`, du, title: `${d.title} (${d.client})` });
      const mgr = d.manager || "미지정";
      const arr = dealsByMgr.get(mgr) ?? [];
      arr.push({ title: d.title, client: d.client, creator: cById.get(d.creator_id)?.name ?? "—", du });
      dealsByMgr.set(mgr, arr);
    }
  }
  for (const c of contents ?? []) {
    if (c.status !== "planned" || c.kind !== "pr") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up = (c.sched as any)?.upload; const du = dU(up);
    if (du != null && du <= 3) push(c.creator_id, { label: `콘텐츠: ${c.product} 업로드`, du, title: c.product });
  }

  // Slack 요약
  const lines: string[] = [];
  let creatorMails = 0;
  for (const [cid, items] of byCreator) {
    const c = cById.get(cid); if (!c) continue;
    items.sort((a, b) => a.du - b.du);
    lines.push(`*${c.name}*\n` + items.map((i) => `  • ${i.label} — ${tag(i.du)}`).join("\n"));
    // 크리에이터 이메일
    if (c.email && c.email.includes("@")) {
      const html = `<h3>업로드 일정 리마인드</h3><ul>${items.map((i) => `<li>${i.label} — ${tag(i.du)}</li>`).join("")}</ul><p>81'DEGREE creator-os</p>`;
      if (await sendEmail(c.email, "[81DEGREE] 업로드 일정 리마인드", html)) creatorMails++;
    }
  }
  let slackSent = false;
  if (lines.length) {
    const digest = `📅 *마감 임박·지연 리마인드* (${now.toISOString().slice(0, 10)})\n\n${lines.join("\n\n")}`;
    slackSent = await sendSlack(digest); // 웹훅(설정 시)
    // 봇으로도 발송(웹훅 미설정 대비) — 제작·업로드 일정 채널
    const ch = process.env.SCHEDULE_SLACK_CHANNEL || PR_CHANNEL;
    const ts = await slackPost(ch, `📅 [제작·업로드 마감 리마인드 / 制作・アップロード期日リマインド] ${now.toISOString().slice(0, 10)}`);
    if (ts) { await slackPost(ch, lines.join("\n\n"), ts); slackSent = true; }
  }

  // 크리에이터 채널(#05_cc)에 부드러운 톤으로 안내 — 지연 표기 없이 임박 중심, 일/한 병기
  let creatorSlackSent = false;
  if (byCreator.size) {
    const gtag = (du: number) => du < 0 ? "🔔 締切超過・ご確認を / 마감 경과·확인 부탁"
      : du === 0 ? "📌 本日締切 / 오늘 마감" : `⏰ あと${du}日 / D-${du}`;
    const blocks: string[] = [];
    for (const [cid, items] of byCreator) {
      const c = cById.get(cid); if (!c) continue;
      items.sort((a, b) => a.du - b.du);
      blocks.push(`*${c.name}*\n` + items.map((i) => `  • ${i.title} — ${gtag(i.du)}`).join("\n"));
    }
    const msg = `🌱 [アップロード リマインド / 업로드 리마인드] ${now.toISOString().slice(0, 10)}\n`
      + `締切が近い投稿のご案内です。よろしくお願いします🙏 / 마감 임박 콘텐츠 안내예요. 잘 부탁드려요!\n\n`
      + `${blocks.join("\n\n")}\n\n🔗 https://cc-os.81degree.com/#a-schedule`;
    creatorSlackSent = !!(await slackPost(CREATOR_CHANNEL, msg));
  }

  // REQ-009: 외부 PR 업로드 기일 리마인드 — PR 채널(#cc_pr_gmail)에 담당자별로 봇 알림
  let prReminderSent = false;
  if (dealsByMgr.size) {
    const today = now.toISOString().slice(0, 10);
    const head = `📣 [외부 PR 업로드 기일 리마인드 / 外部PRアップロード期日リマインド] ${today}`;
    const ts = await slackPost(PR_CHANNEL, head);
    if (ts) {
      const blocks: string[] = [];
      for (const [mgr, items] of dealsByMgr) {
        items.sort((a, b) => a.du - b.du);
        blocks.push(`• 담당 / 担当: *${mgr}*\n` + items.map((i) => `   - ${i.title} (${i.client} · ${i.creator}) — ${tag(i.du)}`).join("\n"));
      }
      await slackPost(PR_CHANNEL, blocks.join("\n\n"), ts);
      prReminderSent = true;
    }
  }
  // 관리자 요약 이메일
  if (lines.length) await sendEmail(MASTER_EMAIL, "[81DEGREE] 오늘의 마감 리마인드", `<pre>${lines.join("\n\n").replace(/\*/g, "")}</pre>`);

  return NextResponse.json({ creators: byCreator.size, items: [...byCreator.values()].reduce((s, a) => s + a.length, 0), slackSent, prReminderSent, creatorSlackSent, creatorMails });
}

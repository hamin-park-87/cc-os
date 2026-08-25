import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendSlack, sendEmail } from "@/lib/notify";
import { MASTER_EMAIL } from "@/lib/roles";

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
    admin.from("deals").select("title, client, creator_id, due_date, step"),
    admin.from("contents").select("product, creator_id, status, sched, brand_id, kind"),
  ]);
  const cById = new Map((creators ?? []).map((c) => [c.id, c]));

  // 크리에이터별 위험 항목 수집 (납기 3일 이내 또는 경과)
  type Item = { label: string; du: number };
  const byCreator = new Map<string, Item[]>();
  const push = (cid: string, it: Item) => { const a = byCreator.get(cid) ?? []; a.push(it); byCreator.set(cid, a); };
  for (const d of deals ?? []) {
    if (d.step >= 5) continue; const du = dU(d.due_date);
    if (du != null && du <= 3) push(d.creator_id, { label: `PR: ${d.title} (${d.client}) 납기`, du });
  }
  for (const c of contents ?? []) {
    if (c.status !== "planned" || c.kind !== "pr") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const up = (c.sched as any)?.upload; const du = dU(up);
    if (du != null && du <= 3) push(c.creator_id, { label: `콘텐츠: ${c.product} 업로드`, du });
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
  if (lines.length) slackSent = await sendSlack(`📅 *마감 임박·지연 리마인드* (${now.toISOString().slice(0, 10)})\n\n${lines.join("\n\n")}`);
  // 관리자 요약 이메일
  if (lines.length) await sendEmail(MASTER_EMAIL, "[81DEGREE] 오늘의 마감 리마인드", `<pre>${lines.join("\n\n").replace(/\*/g, "")}</pre>`);

  return NextResponse.json({ creators: byCreator.size, items: [...byCreator.values()].reduce((s, a) => s + a.length, 0), slackSent, creatorMails });
}

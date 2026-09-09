import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail
const OS_URL = "https://cc-os.81degree.com/#a-deals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedDeal = Record<string, any>;

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

// PR 안건 등록 (중복 방지 · 크리에이터 자동 매칭 · 확인필요 판정)
export async function ingestDeal(p: ParsedDeal): Promise<{ ok: boolean; id?: string; deduped?: boolean; skipped?: boolean; needsReview?: boolean; title?: string; error?: string }> {
  const subject = str(p.subject, 250).trim();
  const summary = str(p.summary).trim();
  const body = str(p.body).trim();
  const title0 = subject || summary || body.slice(0, 80);
  if (!title0) return { ok: false, error: "subject/summary required" };

  const from = str(p.from, 250).trim();
  const domain = from.includes("@") ? from.split("@")[1]?.split(">")[0]?.trim() : "";
  const client = (str(p.client, 120).trim() || str(p.fromName, 120).trim() || domain || from || "미상").slice(0, 120);
  const confidence = typeof p.confidence === "number" ? p.confidence : null;
  const isDeal = p.isDeal;
  if (isDeal === false && (confidence ?? 1) >= 0.6) return { ok: true, skipped: true };
  const needsReview = isDeal === false || (confidence != null && confidence < 0.65);

  const fee = Number.isFinite(+p.fee) ? Math.round(+p.fee) : 0;
  const currency = str(p.currency, 8).trim();
  const dueDate = str(p.dueDate, 10).trim() || null;
  const receivedAt = str(p.receivedAt, 10).trim() || new Date().toISOString().slice(0, 10);
  const deliverables = str(p.deliverables, 300).trim();
  const brand = str(p.brand, 120).trim();
  const creatorName = str(p.creator, 120).trim();
  const secondaryUsage = p.secondaryUsage === true || p.secondaryUsage === "true";
  const messageId = str(p.messageId, 120).trim();

  const admin = getAdminClient();
  const code = messageId ? "MAIL-" + messageId.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) : null;
  if (code) {
    const { data: existing } = await admin.from("deals").select("id").eq("code", code).maybeSingle();
    if (existing) return { ok: true, deduped: true, id: existing.id, title: title0 };
  }

  // 크리에이터 매칭
  let creator_id: string | null = null;
  const { data: creators } = await admin.from("creators").select("id, name, handle");
  const hay = (creatorName || (subject + " " + summary + " " + body)).toLowerCase();
  for (const c of creators ?? []) {
    const n = (c.name || "").toLowerCase(), h = (c.handle || "").replace(/^@/, "").toLowerCase();
    if ((n && n.length >= 2 && hay.includes(n)) || (h && h.length >= 2 && hay.includes(h))) { creator_id = c.id; break; }
  }

  const meta: string[] = [];
  if (needsReview) meta.push("⚠️ 확인 필요 — PR 안건 여부 불확실");
  if (deliverables) meta.push("요청 산출물: " + deliverables);
  if (fee) meta.push("제안 금액: " + fee.toLocaleString() + (currency ? " " + currency : ""));
  if (dueDate) meta.push("납기/희망일: " + dueDate);
  if (secondaryUsage) meta.push("2차 활용: 요청됨");
  if (brand) meta.push("대상 브랜드: " + brand);
  if (creatorName) meta.push("지목 크리에이터: " + creatorName + (creator_id ? " (매칭됨)" : " (미매칭)"));
  if (confidence != null) meta.push("판단 신뢰도: " + Math.round(confidence * 100) + "%");
  if (from) meta.push("출처: " + from);
  const brief = [summary || body, meta.join("\n")].filter(Boolean).join("\n\n") || null;
  const title = (needsReview ? "🔎 " : "") + title0.slice(0, 190);

  const { data, error } = await admin.from("deals").insert({
    code, title, client, creator_id, source: "company_email", type: "creator", step: 0,
    fee, share_company: 0, share_creator: 0, due_date: dueDate, received_date: receivedAt, brief,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id, needsReview, title: title0 };
}

// 슬랙 알림: [제목] 메인 + 스레드에 세부 내용
export async function notifyDealSlack(p: ParsedDeal, res: { id?: string; needsReview?: boolean; title?: string }): Promise<boolean> {
  const tk = str(p.titleKo, 120).trim(); const tj = str(p.titleJa, 120).trim();
  const titleLine = (tk && tj) ? `${tk} / ${tj}` : (tk || str(p.subject, 200).trim() || res.title || str(p.summary, 120).trim() || "PR 안건 / PR案件");
  const head = `${res.needsReview ? "🔎 [확인필요 / 要確認] " : ""}[${titleLine}]`;
  const ts = await slackPost(PR_CHANNEL, head);
  if (!ts) return false;
  const L: string[] = [];
  const client = str(p.client, 120).trim() || str(p.fromName, 120).trim();
  if (client) L.push(`• 의뢰사 / 依頼社: ${client}`);
  if (str(p.brand, 120).trim()) L.push(`• 브랜드 / ブランド: ${str(p.brand, 120).trim()}`);
  if (str(p.creator, 120).trim()) L.push(`• 크리에이터 / クリエイター: ${str(p.creator, 120).trim()}`);
  if (Number.isFinite(+p.fee) && +p.fee > 0) L.push(`• 제안 금액 / 提案金額: ${(+p.fee).toLocaleString()} ${str(p.currency, 8) || "JPY"}`);
  if (str(p.dueDate, 10).trim()) L.push(`• 납기·희망일 / 納期・希望日: ${str(p.dueDate, 10).trim()}`);
  if (str(p.deliverables, 300).trim()) L.push(`• 요청 산출물 / 依頼成果物: ${str(p.deliverables, 300).trim()}`);
  if (p.secondaryUsage === true) L.push("• 2차 활용 / 二次利用: 요청됨 あり");
  if (typeof p.confidence === "number") L.push(`• 판단 신뢰도 / 判定信頼度: ${Math.round(p.confidence * 100)}%`);
  const summary = str(p.summary).trim();
  const summaryJa = str(p.summaryJa).trim();
  const sumBlock = [summary && `📝 ${summary}`, summaryJa && `📝 ${summaryJa}`].filter(Boolean).join("\n");
  const detail = (sumBlock ? sumBlock + "\n\n" : "") + L.join("\n")
    + `\n\n🔗 OS에서 확인 / OSで確認: ${OS_URL}${str(p.from, 250) ? `\n✉️ 출처 / 送信元: ${str(p.from, 250)}` : ""}`;
  await slackPost(PR_CHANNEL, detail, ts);
  return true;
}

// Claude로 원본 메일 → 구조화 PR 안건 파싱 (ANTHROPIC_API_KEY 필요)
export async function parseEmailWithClaude(m: { subject: string; from: string; body: string }): Promise<ParsedDeal | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `아래는 회사 공용 메일함으로 들어온 이메일입니다. 크리에이터 PR/협업 의뢰인지 판단하고 핵심 정보를 추출해 JSON만 출력하세요.\n오늘 날짜: ${today}. 메일에 연도가 없는 날짜는 오늘 기준 가장 가까운 미래로 해석하세요(과거 연도로 넣지 마세요).\n\nFrom: ${m.from}\nSubject: ${m.subject}\nBody:\n${(m.body || "").slice(0, 6000)}\n\n출력 JSON 스키마(이 외 텍스트 금지). titleKo/titleJa는 20자 내외의 짧은 안건 제목(한국어/일본어), summary/summaryJa는 같은 내용의 1~2문장(한국어/일본어):\n{"isDeal":boolean,"confidence":number,"client":string|null,"brand":string|null,"creator":string|null,"fee":number|null,"currency":string|null,"dueDate":"YYYY-MM-DD"|null,"deliverables":string|null,"secondaryUsage":boolean,"titleKo":string,"titleJa":string,"summary":string,"summaryJa":string}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await res.json();
    const text = j?.content?.[0]?.text ?? "";
    const mt = text.match(/\{[\s\S]*\}/);
    return mt ? JSON.parse(mt[0]) : null;
  } catch (e) { console.warn("[parseEmailWithClaude]", (e as Error).message); return null; }
}

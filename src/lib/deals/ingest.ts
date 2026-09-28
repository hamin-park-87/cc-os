import { getAdminClient } from "@/lib/supabase/admin";
import { slackPost } from "@/lib/notify";

const PR_CHANNEL = process.env.PR_SLACK_CHANNEL || "C0BT56NHA5D"; // #cc_pr_gmail
const OS_URL = "https://cc-os.81degree.com/#a-deals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedDeal = Record<string, any>;

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);

// PR 안건 등록 (중복 방지 · 크리에이터 자동 매칭 · 확인필요 판정)
export async function ingestDeal(p: ParsedDeal): Promise<{ ok: boolean; id?: string; deduped?: boolean; skipped?: boolean; needsReview?: boolean; title?: string; prNo?: string; error?: string; creatorId?: string | null }> {
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
  let needsReview = isDeal === false || (confidence != null && confidence < 0.65);

  const fee = Number.isFinite(+p.fee) ? Math.round(+p.fee) : 0;
  const currency = str(p.currency, 8).trim();
  const dueDate = str(p.dueDate, 10).trim() || null;
  const receivedAt = str(p.receivedAt, 10).trim() || new Date().toISOString().slice(0, 10);
  const deliverables = str(p.deliverables, 300).trim();
  const brand = str(p.brand, 120).trim();
  const creatorName = str(p.creator, 120).trim();
  const secondaryUsage = p.secondaryUsage === true || p.secondaryUsage === "true";
  const messageId = str(p.messageId, 120).trim();
  const manager = str(p.manager, 60).trim() || null;

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
  // 크리에이터 미매칭 시에도 등록되도록(확인필요) — creator_id NULL 허용 필요(deals_creator_nullable.sql)
  if (!creator_id) needsReview = true;

  const meta: string[] = [];
  if (needsReview) meta.push("⚠️ 확인 필요 — PR 안건 여부 불확실");
  if (!creator_id) meta.push("⚠️ 크리에이터 미매칭 — 수동 지정 필요");
  if (deliverables) meta.push("요청 산출물: " + deliverables);
  if (fee) meta.push("제안 금액: " + fee.toLocaleString() + (currency ? " " + currency : ""));
  if (dueDate) meta.push("납기/희망일: " + dueDate);
  if (secondaryUsage) meta.push("2차 활용: 요청됨");
  if (brand) meta.push("대상 브랜드: " + brand);
  if (creatorName) meta.push("지목 크리에이터: " + creatorName + (creator_id ? " (매칭됨)" : " (미매칭)"));
  if (manager) meta.push("담당자: " + manager);
  if (confidence != null) meta.push("판단 신뢰도: " + Math.round(confidence * 100) + "%");
  if (from) meta.push("출처: " + from);
  const brief = [summary || body, meta.join("\n")].filter(Boolean).join("\n\n") || null;
  const title = (needsReview ? "🔎 " : "") + title0.slice(0, 190);

  // REQ-022: PR 영구 구분번호 = 현재 최대 pr_seq + 1 (삭제해도 결번 유지·재사용 없음)
  let prSeq = 0;
  try {
    const { data: mx } = await admin.from("deals").select("pr_seq").not("pr_seq", "is", null).order("pr_seq", { ascending: false }).limit(1).maybeSingle();
    prSeq = ((mx?.pr_seq as number) ?? 0) + 1;
  } catch { /* pr_seq 미지원(마이그레이션 전)이면 0 */ }

  const { data, error } = await admin.from("deals").insert({
    code, title, client, creator_id, manager, source: "company_email", type: "creator", step: 0,
    registered_by: "메일 자동등록", ...(prSeq ? { pr_seq: prSeq } : {}),
    fee, share_company: 0, share_creator: 0, due_date: dueDate, received_date: receivedAt, brief,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  const prNo = prSeq ? "PR-" + String(prSeq).padStart(3, "0") : "";
  return { ok: true, id: data.id, needsReview, title: title0, prNo, creatorId: creator_id };
}

// 슬랙 알림: [제목] 메인 + 스레드에 세부 내용
export async function notifyDealSlack(p: ParsedDeal, res: { id?: string; needsReview?: boolean; title?: string; prNo?: string; creatorId?: string | null }): Promise<boolean> {
  const admin = getAdminClient();
  const client = str(p.client, 120).trim() || str(p.brand, 120).trim() || str(p.fromName, 120).trim() || "PR";
  // 매니저 수기 패턴과 동일: 【의뢰사】PR-0XX
  const head = `${res.needsReview ? "🔎 " : ""}【${client}】${res.prNo || ""}`.trim();
  // 매칭된 크리에이터의 전용 채널로 라우팅(있으면) + 팀 채널(#cc_pr_gmail).
  let ccChannel = "";
  if (res.creatorId) {
    try { const { data: cr } = await admin.from("creators").select("slack_channel").eq("id", res.creatorId).maybeSingle(); ccChannel = (cr?.slack_channel as string) || ""; } catch { /* noop */ }
  }
  const targets = [...new Set([PR_CHANNEL, ...(ccChannel ? [ccChannel] : [])])];
  // 수신 메일 원문(스레드에 남김)
  const rawBody = str(p.body, 2500).trim();
  const emailMsg = `✉️ *수신 메일 / 受信メール*\nFrom: ${str(p.from, 250) || "-"}${str(p.subject, 300) ? `\nSubject: ${str(p.subject, 300)}` : ""}${rawBody ? `\n\n${rawBody}` : ""}`;
  const L: string[] = [];
  if (res.prNo) L.push(`• 구분번호 / 識別番号: ${res.prNo}`);
  if (client && client !== "PR") L.push(`• 의뢰사 / 依頼社: ${client}`);
  if (str(p.brand, 120).trim()) L.push(`• 브랜드 / ブランド: ${str(p.brand, 120).trim()}`);
  if (str(p.creator, 120).trim()) L.push(`• 크리에이터 / クリエイター: ${str(p.creator, 120).trim()}`);
  if (str(p.manager, 60).trim()) L.push(`• 담당자 / 担当者: ${str(p.manager, 60).trim()}`);
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
  // AI 답장 초안(일본어) — 한 번 생성해 각 채널 스레드에 동일 게시 (1단계: 초안만, 발송은 매니저가 수동)
  let draft: string | null = null;
  try { draft = await draftReplyWithClaude({ subject: str(p.subject, 300), from: str(p.from, 250), body: str(p.body, 6000) }); } catch { /* noop */ }
  const draftMsg = draft ? `🤖 *AI 답장 초안 / AI返信ドラフト*\n(매니저: 검토·수정 후 contact@에서 회신해주세요 / ご確認後 contact@ より返信ください)\n\n\`\`\`\n${draft}\n\`\`\`` : "";
  // 안건별 루트 스레드 ts를 deals.slack_threads에 저장 → 대시보드 댓글·비용·입금 알림도 같은 스레드에 누적
  const threads: Record<string, string> = {};
  let anySent = false;
  for (const ch of targets) {
    const ts = await slackPost(ch, head);           // 루트: 【의뢰사】PR-0XX (매니저 패턴)
    if (!ts) continue;
    anySent = true; threads[ch] = ts;
    await slackPost(ch, emailMsg, ts);              // ① 수신 메일 원문
    await slackPost(ch, detail, ts);               // ② 파싱 요약·정보
    if (draftMsg) await slackPost(ch, draftMsg, ts); // ③ AI 답장 초안
  }
  if (res.id && anySent) { try { await admin.from("deals").update({ slack_threads: threads }).eq("id", res.id); } catch { /* noop */ } }
  return anySent;
}

// 슬랙 스레드(원 메일 + 매니저·CC 협의) → 합의 요약 + 의뢰사 회신 일본어 이메일 초안.
export async function composeReplyFromThread(transcript: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `以下は、あるPR案件に関する社内Slackスレッドの会話です(先頭に取引先からの元メール、続いて担当マネージャーとCC(クリエイター)による金額・条件の協議が含まれます)。\nこの協議で合意した内容を反映し、取引先(依頼社)へ送る丁寧なビジネス日本語の返信メールを作成してください。\n\n出力フォーマット(この2部構成で、余計な説明は不要):\n【合意サマリー】\n- 金額/条件など、スレッドで確定した要点を箇条書き(社内確認用・日本語)\n\n【返信メール(そのまま送信可)】\n(敬語のメール本文。宛名→本文→署名「81degree」。合意した金額・投稿時期・二次利用等を明記。未確定事項があれば確認のお願いを一文。[ ]プレースホルダは使わない)\n\n--- Slackスレッド ---\n${transcript.slice(0, 9000)}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await res.json();
    const text = (j?.content?.[0]?.text ?? "").trim();
    return text || null;
  } catch (e) { console.warn("[composeReplyFromThread]", (e as Error).message); return null; }
}

// 외부 PR 문의 메일 → 정중한 일본어 답장 초안(1차 접수 응대). ANTHROPIC_API_KEY 필요.
export async function draftReplyWithClaude(m: { subject: string; from: string; body: string }): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `あなたはインフルエンサーPRキャスティング代行会社「81degree」の担当マネージャーです。以下は取引先(ブランド/代理店)から届いたPR案件のお問い合わせメールです。これに対する丁寧なビジネス日本語の返信メール本文を作成してください。\n要件:\n- 敬語で、簡潔に(200〜350字程度)。\n- お問い合わせへの感謝と受領確認、前向きな関心を伝える。\n- クリエイターの空き状況・条件を確認のうえ、追ってご連絡する旨を伝える。\n- 不足している重要情報(投稿時期・二次利用・ギャランティ等)があれば、簡潔に確認をお願いする一文を入れる。\n- 署名は「81degree」。宛名は分かる場合のみ会社名/担当者名を使い、無ければ「ご担当者様」。\n- 本文のみを出力(件名や説明文は不要、[ ]プレースホルダは使わない)。\n\n【受信メール】\nFrom: ${m.from}\nSubject: ${m.subject}\nBody:\n${m.body.slice(0, 5000)}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await res.json();
    const text = (j?.content?.[0]?.text ?? "").trim();
    return text || null;
  } catch (e) { console.warn("[draftReplyWithClaude]", (e as Error).message); return null; }
}

// Claude로 원본 메일 → 구조화 PR 안건 파싱 (ANTHROPIC_API_KEY 필요)
export async function parseEmailWithClaude(m: { subject: string; from: string; body: string }): Promise<ParsedDeal | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `아래는 회사 공용 메일함으로 들어온 이메일입니다. 크리에이터 PR/협업 의뢰인지 판단하고 핵심 정보를 추출해 JSON만 출력하세요.\n오늘 날짜: ${today}. 메일에 연도가 없는 날짜는 오늘 기준 가장 가까운 미래로 해석하세요(과거 연도로 넣지 마세요).\n\nFrom: ${m.from}\nSubject: ${m.subject}\nBody:\n${(m.body || "").slice(0, 6000)}\n\nmanager는 이 메일을 응대 중인 81degree(우리 회사) 담당자 이름입니다. 서명(예: "81degree 岩上", "81degree 藤沢")이나 본문에서 우리 측 담당자를 찾아 넣으세요. 없으면 null.\n출력 JSON 스키마(이 외 텍스트 금지). titleKo/titleJa는 20자 내외의 짧은 안건 제목(한국어/일본어), summary/summaryJa는 같은 내용의 1~2문장(한국어/일본어):\n{"isDeal":boolean,"confidence":number,"client":string|null,"brand":string|null,"creator":string|null,"manager":string|null,"fee":number|null,"currency":string|null,"dueDate":"YYYY-MM-DD"|null,"deliverables":string|null,"secondaryUsage":boolean,"titleKo":string,"titleJa":string,"summary":string,"summaryJa":string}`;
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

// ah!channel PR Inbox — 인바운드 DM 분류 + 협업 제안 구조화 추출.
// cc-os의 Claude 호출 패턴(ingest.ts)과 동일하게 fetch + x-api-key 사용.
// 분류는 가벼운 모델, 추출은 상위 모델(env로 교체). 출력은 JSON 스키마 고정.

const CLASSIFY_MODEL = process.env.PR_INBOX_CLASSIFY_MODEL || "claude-haiku-4-5-20251001";
const EXTRACT_MODEL = process.env.PR_INBOX_EXTRACT_MODEL || "claude-haiku-4-5-20251001";

// 7개 카테고리 (제안 3종만 추출·스코어링으로 진행)
export type DmCategory =
  | "ad_pr" // 広告・PR依頼
  | "seeding" // 商品提供
  | "event" // イベント招待
  | "casting" // 出演依頼(크리에이터 섭외)
  | "application" // 応募(에디터·채용)
  | "fan" // ファン・リクエスト
  | "spam"; // スパム

export const PROPOSAL_CATEGORIES: DmCategory[] = ["ad_pr", "seeding", "event"];

export interface ExtractedProposal {
  brand_name: string | null;
  org_type: "brand" | "agency" | null;
  contact_name: string | null;
  contact_email: string | null;
  brand_country: "KR" | "JP" | "ETC" | null;
  official: boolean | null;
  industry: string | null;
  proposal_type: "T1" | "T2" | "T3" | null;
  deliverables: string | null;
  product_offer: boolean | null;
  budget_mentioned: boolean | null;
  budget_amount: number | null;
  schedule: string | null;
  ko_summary: string | null;
  missing: string[];
}

// 공통 Claude 호출 (JSON 응답 유도) ------------------------------------------
async function callClaude(prompt: string, model: string, maxTokens: number): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    const j = await res.json();
    return (j?.content?.[0]?.text ?? "").trim() || null;
  } catch (e) {
    console.warn("[prInbox callClaude]", (e as Error).message);
    return null;
  }
}

// 코드펜스/잡텍스트에 싸인 JSON도 관대하게 파싱
function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// 1) 분류 --------------------------------------------------------------------
export async function classifyDM(text: string): Promise<DmCategory> {
  const prompt = `あなたはInstagram DMの仕分け担当です。以下のDM本文を、次の7カテゴリのいずれか1つに分類してください。
- ad_pr: 広告・PR・タイアップの依頼(ブランド/代理店から)
- seeding: 商品提供・ギフティング(無償提供中心)
- event: イベント・ポップアップ・発表会への招待
- casting: クリエイター本人への出演・起用依頼(キャスティング)
- application: エディター募集・採用への応募、求人関連
- fan: ファンからのメッセージ、リクエスト、感想
- spam: スパム、詐欺、無関係、宣伝botなど

出力はJSONのみ: {"category":"<上のいずれか>"}

--- DM本文 ---
${text.slice(0, 4000)}`;
  const out = parseJson<{ category: string }>(await callClaude(prompt, CLASSIFY_MODEL, 60));
  const c = out?.category as DmCategory;
  const valid: DmCategory[] = ["ad_pr", "seeding", "event", "casting", "application", "fan", "spam"];
  return valid.includes(c) ? c : "spam";
}

// 2) 제안 상세 추출 (ad_pr / seeding / event 대상) ---------------------------
export async function extractProposal(text: string): Promise<ExtractedProposal | null> {
  const prompt = `以下はInstagramに届いたコラボ/PR提案のDMです。内容から次の項目を抽出し、JSONのみで出力してください。日本語原文の要点を踏まえ、ko_summaryは「韓国語で3行以内」の要約にしてください。不明な項目はnull、提案に不足している重要情報はmissing配列に日本語で列挙してください(例: "予算未記載","希望時期不明")。

スキーマ:
{
  "brand_name": string|null,
  "org_type": "brand"|"agency"|null,
  "contact_name": string|null,
  "contact_email": string|null,
  "brand_country": "KR"|"JP"|"ETC"|null,
  "official": boolean|null,            // 公式/認証アカウントらしさ
  "industry": string|null,             // beauty/fashion/food/travel/telco 等
  "proposal_type": "T1"|"T2"|"T3"|null, // T1=露出型, T2=企画型, T3=クリエイター出演型
  "deliverables": string|null,         // リール本数・ストーリー等
  "product_offer": boolean|null,       // 商品提供の有無
  "budget_mentioned": boolean|null,
  "budget_amount": number|null,        // 円。記載時のみ数値
  "schedule": string|null,             // 希望時期・締切
  "ko_summary": string|null,           // 韓国語3行以内
  "missing": string[]                  // 確認が必要な不足項目(日本語)
}

--- DM本文 ---
${text.slice(0, 6000)}`;
  const out = parseJson<ExtractedProposal>(await callClaude(prompt, EXTRACT_MODEL, 900));
  if (!out) return null;
  return { ...out, missing: Array.isArray(out.missing) ? out.missing : [] };
}

// 분류 + (제안이면) 추출 한 번에
export async function analyzeDM(
  text: string
): Promise<{ category: DmCategory; proposal: ExtractedProposal | null }> {
  const category = await classifyDM(text);
  const proposal = PROPOSAL_CATEGORIES.includes(category) ? await extractProposal(text) : null;
  return { category, proposal };
}

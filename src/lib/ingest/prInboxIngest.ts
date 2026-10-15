// ah!channel PR Inbox — 수집 오케스트레이션.
// DM 1건 → 원문 저장 → 분류·추출 → (제안이면) proposal 저장 + PR-ID 발급.
// 웹훅/백필/수동 어디서든 이 함수를 호출한다.

import { getAdminClient } from "@/lib/supabase/admin";
import { analyzeDM, PROPOSAL_CATEGORIES, type DmCategory, type ExtractedProposal } from "./prInbox";

export interface DmInput {
  text: string;
  mid?: string | null; // Instagram 메시지 ID(웹훅 중복 방지)
  ig_account?: string | null;
  thread_id?: string | null;
  sender_id?: string | null;
  sender_handle?: string | null;
  attachments?: { type: string; url: string }[];
  raw?: unknown;
  source?: "webhook" | "backfill" | "manual";
  received_at?: string; // ISO
}

export interface IngestResult {
  messageId: string;
  category: DmCategory;
  prId: string | null;
  proposal: ExtractedProposal | null;
}

// PR-YYMMDD- 접두어
function prPrefix(dateIso: string): string {
  const d = new Date(dateIso);
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `PR-${yy}${mm}${dd}-`;
}

export async function ingestDM(input: DmInput): Promise<IngestResult> {
  const admin = getAdminClient();
  const received_at = input.received_at || new Date().toISOString();

  // 1) 원문 저장
  const { data: msg, error: mErr } = await admin
    .from("pr_inbox_messages")
    .insert({
      mid: input.mid ?? null,
      ig_account: input.ig_account ?? null,
      thread_id: input.thread_id ?? null,
      sender_id: input.sender_id ?? null,
      sender_handle: input.sender_handle ?? null,
      text_original: input.text,
      attachments: input.attachments ?? [],
      raw: input.raw ?? null,
      source: input.source ?? "manual",
      received_at,
    })
    .select("id")
    .single();
  if (mErr || !msg) throw new Error("message insert: " + (mErr?.message || "no row"));

  // 2) 분류 + (제안이면) 추출
  const { category, proposal } = await analyzeDM(input.text);

  // 3) 제안 3종이면 proposal 저장 + PR-ID 발급
  if (!(PROPOSAL_CATEGORIES.includes(category) && proposal)) {
    return { messageId: msg.id as string, category, prId: null, proposal: null };
  }

  const prefix = prPrefix(received_at);
  const { count } = await admin
    .from("pr_inbox_proposals")
    .select("id", { count: "exact", head: true })
    .like("pr_id", prefix + "%");
  const prId = prefix + String((count ?? 0) + 1).padStart(3, "0");

  const { error: pErr } = await admin.from("pr_inbox_proposals").insert({
    pr_id: prId,
    thread_id: input.thread_id ?? null,
    message_id: msg.id,
    category,
    proposal_type: proposal.proposal_type,
    brand_name: proposal.brand_name,
    org_type: proposal.org_type,
    contact_name: proposal.contact_name,
    contact_email: proposal.contact_email,
    brand_country: proposal.brand_country,
    official: proposal.official,
    industry: proposal.industry,
    deliverables: proposal.deliverables,
    product_offer: proposal.product_offer,
    budget_mentioned: proposal.budget_mentioned,
    budget_amount: proposal.budget_amount,
    schedule: proposal.schedule,
    ko_summary: proposal.ko_summary,
    missing: proposal.missing,
    status: "new",
  });
  if (pErr) throw new Error("proposal insert: " + pErr.message);

  return { messageId: msg.id as string, category, prId, proposal };
}

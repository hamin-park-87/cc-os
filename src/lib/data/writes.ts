"use client";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Brand, BrandProduct, Creator, Deal, Content, SecondaryReq } from "@/lib/types";
import type { SecondaryScope, SecondaryStatus } from "@/lib/types";

// supabase 모드일 때만 실제 DB 쓰기. mock 모드면 no-op(메모리 변경은 호출부에서 처리).
export const isDb = () =>
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" && supabaseConfigured();

function creatorRow(c: Creator) {
  return {
    code: c.code ?? null, pic: c.pic ?? null, name: c.name, name_kanji: c.nameKanji ?? null, name_en: c.nameEn ?? null, address_en: c.addressEn ?? null, handle: c.handle ?? null, photo_url: c.photoUrl ?? null,
    followers: c.followers, status: c.status, category: c.category ?? null, tone: c.tone ?? null,
    intro: c.intro ?? null, monthly_quota: c.monthlyQuota ?? null, fixed_cost: c.fixedCost,
    contract_date: c.contractDate ?? null, start_date: c.startDate ?? null, sns: c.sns, rates: c.rates,
    email: c.email ?? null, phone: c.phone ?? null, address: c.address ?? null, bank_account: c.bankAccount ?? null,
    invoice_reg_no: c.invoiceRegNo ?? null, entity_type: c.entityType ?? null, withholding: c.withholding ?? null,
    contract_end: c.contractEnd ?? null, base_fee: c.baseFee ?? null, pay_cycle: c.payCycle ?? null,
  };
}

// 반환: 저장된 creator (신규면 DB가 만든 id 포함)
export async function saveCreator(c: Creator, isNew: boolean): Promise<Creator> {
  if (!isDb()) return c;
  const sb = getSupabase();
  if (isNew) {
    const { data, error } = await sb.from("creators").insert(creatorRow(c)).select("id").single();
    if (error) throw error;
    return { ...c, id: data.id };
  }
  const { error } = await sb.from("creators").update(creatorRow(c)).eq("id", c.id);
  if (error) throw error;
  return c;
}
export async function deleteCreator(id: string) {
  if (!isDb()) return; const { error } = await getSupabase().from("creators").delete().eq("id", id); if (error) throw error;
}
// 비용/고정비 등 부분 업데이트
export async function patchCreator(id: string, fields: Record<string, unknown>) {
  if (!isDb()) return; const { error } = await getSupabase().from("creators").update(fields).eq("id", id); if (error) throw error;
}

// 브랜드 CRUD
function brandRow(b: Brand) {
  return {
    code: b.code ?? null, name: b.name, color: b.color ?? null, aliases: b.aliases ?? [], domain_allowlist: b.domainAllowlist ?? [],
    contract_start: b.contractStart ?? null, contract_end: b.contractEnd ?? null,
    monthly_quota: b.monthlyQuota ?? null, monthly_amount: b.monthlyAmount ?? null,
    bill_company: b.billCompany ?? null, bill_address: b.billAddress ?? null, bill_tel: b.billTel ?? null,
    bill_rep: b.billRep ?? null, bill_reg_no: b.billRegNo ?? null,
  };
}
export async function saveBrand(b: Brand, isNew: boolean): Promise<Brand> {
  if (!isDb()) return b;
  const sb = getSupabase();
  if (isNew) {
    const { data, error } = await sb.from("brands").insert(brandRow(b)).select("id").single();
    if (error) throw error;
    return { ...b, id: data.id };
  }
  const { error } = await sb.from("brands").update(brandRow(b)).eq("id", b.id);
  if (error) throw error;
  return b;
}
export async function deleteBrand(id: string) {
  if (!isDb()) return; const { error } = await getSupabase().from("brands").delete().eq("id", id); if (error) throw error;
}

// 브랜드 월별 계약 수량·금액 (contracts upsert). quota/amount 0이면 삭제.
export async function setBrandMonthly(brandName: string, month: string, quota: number, amount: number, brands: { id: string; name: string }[]): Promise<void> {
  if (!isDb()) return;
  const sb = getSupabase();
  const brand_id = brands.find((b) => b.name === brandName)?.id;
  if (!brand_id) throw new Error("브랜드를 찾을 수 없습니다");
  if (quota <= 0 && amount <= 0) {
    const { error } = await sb.from("contracts").delete().match({ brand_id, year_month: month });
    if (error) throw error; return;
  }
  const { error } = await sb.from("contracts").upsert(
    { brand_id, year_month: month, quota, monthly_amount: amount || null }, { onConflict: "brand_id,year_month" });
  if (error) throw error;
}

// 월별 브랜드 PR 상품 (mock: 메모리 / db: brand_products)
const mockProducts: BrandProduct[] = [];
export async function getBrandProducts(brandName: string, month: string, brands: { id: string; name: string }[]): Promise<BrandProduct[]> {
  if (!isDb()) return mockProducts.filter((p) => p.brandId === brandName && p.yearMonth === month);
  const brand_id = brands.find((b) => b.name === brandName)?.id;
  if (!brand_id) return [];
  const { data, error } = await getSupabase().from("brand_products").select("*").eq("brand_id", brand_id).eq("year_month", month).order("created_at");
  if (error) { console.warn("[brand_products]", error.message); return []; }
  return (data ?? []).map((r): BrandProduct => ({ id: r.id, brandId: brandName, yearMonth: r.year_month, name: r.name, url: r.url }));
}
export async function addBrandProduct(brandName: string, month: string, name: string, url: string, brands: { id: string; name: string }[]): Promise<BrandProduct> {
  const p: BrandProduct = { id: `${brandName}|${month}|${name}|${mockProducts.length}`, brandId: brandName, yearMonth: month, name, url: url || null };
  if (!isDb()) { mockProducts.push(p); return p; }
  const brand_id = brands.find((b) => b.name === brandName)?.id;
  if (!brand_id) throw new Error("브랜드를 찾을 수 없습니다");
  const { data, error } = await getSupabase().from("brand_products").insert({ brand_id, year_month: month, name, url: url || null }).select("id").single();
  if (error) throw error;
  p.id = data.id; return p;
}
export async function deleteBrandProduct(id: string) {
  if (!isDb()) { const i = mockProducts.findIndex((p) => p.id === id); if (i >= 0) mockProducts.splice(i, 1); return; }
  const { error } = await getSupabase().from("brand_products").delete().eq("id", id); if (error) throw error;
}

// 상품별 크리에이터 배정 (상품 × 크리에이터 → 수량)
export interface ProductAssign { productId: string; creatorName: string; qty: number }
const mockPA: ProductAssign[] = [];
export async function getProductAssignments(brandName: string, month: string, brands: { id: string; name: string }[]): Promise<ProductAssign[]> {
  if (!isDb()) {
    const prodIds = new Set(mockProducts.filter((p) => p.brandId === brandName && p.yearMonth === month).map((p) => p.id));
    return mockPA.filter((a) => prodIds.has(a.productId));
  }
  const sb = getSupabase();
  const brand_id = brands.find((b) => b.name === brandName)?.id;
  if (!brand_id) return [];
  const { data: prods } = await sb.from("brand_products").select("id").eq("brand_id", brand_id).eq("year_month", month);
  const ids = (prods ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const { data, error } = await sb.from("product_assignments").select("product_id, qty, creators(name)").in("product_id", ids);
  if (error) { console.warn("[product_assignments]", error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ productId: r.product_id, creatorName: r.creators?.name ?? "", qty: r.qty }));
}
export async function setProductAssignment(productId: string, creatorName: string, qty: number, creators: Creator[]) {
  if (!isDb()) {
    const i = mockPA.findIndex((a) => a.productId === productId && a.creatorName === creatorName);
    if (qty <= 0) { if (i >= 0) mockPA.splice(i, 1); }
    else if (i >= 0) mockPA[i].qty = qty; else mockPA.push({ productId, creatorName, qty });
    return;
  }
  const sb = getSupabase();
  const creator_id = creators.find((c) => c.name === creatorName)?.id;
  if (!creator_id) return;
  if (qty <= 0) { const { error } = await sb.from("product_assignments").delete().match({ product_id: productId, creator_id }); if (error) throw error; }
  else { const { error } = await sb.from("product_assignments").upsert({ product_id: productId, creator_id, qty }, { onConflict: "product_id,creator_id" }); if (error) throw error; }
}

function dealRow(d: Deal, creatorId: string | null) {
  return {
    code: d.code ?? null, title: d.title, client: d.client, creator_id: creatorId, manager: d.manager ?? null,
    source: d.source, type: d.type, brief: d.brief ?? null, fee: d.fee, secondary_fee: d.secondaryFee ?? null,
    share_company: d.shareCompany, share_creator: d.shareCreator,
    due_date: d.dueDate || null, upload_date: d.uploadDate || null, step: d.step, sched: d.sched ?? {},
    received_date: d.receivedDate || null, payment_due: d.paymentDue || null, paid_date: d.paidDate || null, invoice_file: d.invoiceFile ?? null,
  };
}
// PR 안건 제작 일정(기획/촬영/편집/업로드) 수정 — 업로드 단계는 upload_date에도 반영
export async function updateDealSchedule(id: string, sched: Record<string, string>): Promise<void> {
  if (!isDb()) return;
  const patch: Record<string, unknown> = { sched };
  if (sched.upload) patch.upload_date = sched.upload;
  const { error } = await getSupabase().from("deals").update(patch).eq("id", id);
  if (error) throw error;
}
// 첨부파일 업로드 → 공개 URL 반환 (attachments 버킷)
export async function uploadAttachment(file: File, prefix = "invoice"): Promise<string> {
  if (!isDb()) return "";
  const sb = getSupabase();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${prefix}/${Math.round((Date.now?.() ?? 0))}_${safe}`;
  const { error } = await sb.storage.from("attachments").upload(path, file, { upsert: true });
  if (error) throw error;
  return sb.storage.from("attachments").getPublicUrl(path).data.publicUrl;
}
export async function saveDeal(d: Deal, isNew: boolean, creators: Creator[]): Promise<Deal> {
  if (!isDb()) return d;
  const sb = getSupabase();
  const creatorId = creators.find((c) => c.name === d.creatorName)?.id ?? null;
  if (isNew) {
    const { data, error } = await sb.from("deals").insert(dealRow(d, creatorId)).select("id").single();
    if (error) throw error;
    return { ...d, id: data.id };
  }
  const { error } = await sb.from("deals").update(dealRow(d, creatorId)).eq("id", d.id);
  if (error) throw error;
  return d;
}
export async function deleteDeal(id: string) {
  if (!isDb()) return; const { error } = await getSupabase().from("deals").delete().eq("id", id); if (error) throw error;
}
export async function setDealStep(id: string, step: number) {
  if (!isDb()) return; const { error } = await getSupabase().from("deals").update({ step }).eq("id", id); if (error) throw error;
}

// PR 안건 완료 콘텐츠 URL → contents 생성/링크 (아카이브에 노출)
export async function createDealContent(deal: Deal, url: string, creators: Creator[]): Promise<Content> {
  const creator = creators.find((c) => c.name === deal.creatorName);
  const published = deal.uploadDate || "2026-08-23";
  const content: Content = {
    id: deal.id + "-c", brandId: null, brandName: deal.client, creatorId: deal.creatorName, creatorName: deal.creatorName,
    client: deal.client, product: deal.title, kind: "deal", permalink: url, status: "uploaded", publishedAt: published,
    sched: {}, videoStatus: "ready", views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, dealId: deal.id,
  };
  if (isDb()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("contents").insert({
      creator_id: creator?.id ?? null, client: deal.client, product: deal.title, kind: "deal",
      permalink: url, status: "uploaded", published_at: deal.uploadDate || null, video_status: "ready", deal_id: deal.id,
    }).select("id").single();
    if (error) throw error;
    content.id = data.id;
    await sb.from("deals").update({ content_id: content.id }).eq("id", deal.id);
  }
  return content;
}

// 계정(profiles) 실데이터 조회 — 관리자만 전체 조회 가능(RLS)
export interface AccountRow { id: string; email: string; role: string; scope: string; status: string; lastLogin?: string | null }
export async function getAccounts(): Promise<AccountRow[]> {
  if (!isDb()) return [];
  const { data, error } = await getSupabase().from("profiles").select("id, email, role, status, last_login_at");
  if (error) { console.warn("[accounts]", error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): AccountRow => ({
    id: r.id, email: r.email ?? "", role: r.role, scope: r.role === "admin" ? "81degree" : "—", status: r.status, lastLogin: r.last_login_at,
  }));
}

// 계획 콘텐츠 생성 (배정 → 제작 일정 항목). kind='pr', status='planned'.
export async function createPlannedContent(brandName: string, creatorName: string, product: string, brands: { id: string; name: string }[], creators: Creator[]): Promise<Content> {
  const creator = creators.find((c) => c.name === creatorName);
  const content: Content = {
    id: `plan-${creatorName}-${Date.now?.() ?? Math.round(Math.random() * 1e9)}`, brandId: brandName, brandName, creatorId: creatorName, creatorName,
    product, kind: "pr", status: "planned", sched: {}, videoStatus: "none",
    views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0,
  };
  if (isDb()) {
    const brand_id = brands.find((b) => b.name === brandName)?.id ?? null;
    const { data, error } = await getSupabase().from("contents").insert({
      brand_id, creator_id: creator?.id ?? null, product, kind: "pr", status: "planned", sched: {},
    }).select("id").single();
    if (error) throw error;
    content.id = data.id;
  }
  return content;
}
// 콘텐츠 제작 일정/상태 수정
export async function updateContentSchedule(contentId: string, sched: Record<string, string>, status?: string): Promise<void> {
  if (!isDb()) return;
  const patch: Record<string, unknown> = { sched, planned_date: sched.upload || null };
  if (status) patch.status = status;
  const { error } = await getSupabase().from("contents").update(patch).eq("id", contentId);
  if (error) throw error;
}
export async function deleteContent(contentId: string): Promise<void> {
  if (!isDb()) return;
  const { error } = await getSupabase().from("contents").delete().eq("id", contentId);
  if (error) throw error;
}
export async function patchContentFields(contentId: string, fields: Record<string, unknown>): Promise<void> {
  if (!isDb()) return;
  const { error } = await getSupabase().from("contents").update(fields).eq("id", contentId);
  if (error) throw error;
}

// 콘텐츠를 브랜드에 태깅 (전략 브랜드 pr ↔ 개인 own)
export async function tagContentBrand(contentId: string, brandName: string | null, brands: { id: string; name: string }[]): Promise<void> {
  if (!isDb()) return;
  const brand_id = brandName ? (brands.find((b) => b.name === brandName)?.id ?? null) : null;
  const { error } = await getSupabase().from("contents").update({ brand_id, kind: brandName ? "pr" : "own" }).eq("id", contentId);
  if (error) throw error;
}

// 2차 활용 신청 (secondary_usage_requests)
const mockSecondary: SecondaryReq[] = [];
export async function getSecondaryRequests(): Promise<SecondaryReq[]> {
  if (!isDb()) return mockSecondary;
  const sb = getSupabase();
  const { data, error } = await sb.from("secondary_usage_requests")
    .select("id, scope, channels, period_start, period_end, fee, status, creator_consented_at, content_id, brands(name), contents(product, permalink, thumbnail_url, creators(name))")
    .order("created_at", { ascending: false });
  if (error) { console.warn("[secondary]", error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): SecondaryReq => ({
    id: r.id, contentId: r.content_id, product: r.contents?.product ?? "—",
    creatorName: r.contents?.creators?.name ?? "—", brandName: r.brands?.name ?? "—",
    scope: r.scope, channels: r.channels ?? [], periodStart: r.period_start, periodEnd: r.period_end,
    fee: Number(r.fee ?? 0), status: r.status, creatorConsentedAt: r.creator_consented_at,
    permalink: r.contents?.permalink, thumbnailUrl: r.contents?.thumbnail_url,
  }));
}
export async function createSecondaryRequest(
  contentId: string, brandName: string, scope: SecondaryScope, channels: string[],
  fee: number, periodStart: string | null, periodEnd: string | null,
  brands: { id: string; name: string }[],
): Promise<void> {
  if (!isDb()) { mockSecondary.unshift({ id: "S" + mockSecondary.length, contentId, product: "—", creatorName: "—", brandName, scope, channels, periodStart, periodEnd, fee, status: "requested", creatorConsentedAt: null }); return; }
  const brand_id = brands.find((b) => b.name === brandName)?.id ?? null;
  const { error } = await getSupabase().from("secondary_usage_requests").insert({
    content_id: contentId, brand_id, scope, channels, fee, period_start: periodStart || null, period_end: periodEnd || null, status: "requested",
  });
  if (error) throw error;
}
export async function setSecondaryStatus(id: string, status: SecondaryStatus): Promise<void> {
  if (!isDb()) { const r = mockSecondary.find((x) => x.id === id); if (r) r.status = status; return; }
  const { error } = await getSupabase().from("secondary_usage_requests").update({ status }).eq("id", id);
  if (error) throw error;
}
// 크리에이터 동의 (동의 시각 기록 → 트리거가 승인 허용)
export async function setCreatorConsent(id: string): Promise<void> {
  if (!isDb()) { const r = mockSecondary.find((x) => x.id === id); if (r) { r.creatorConsentedAt = "now"; r.status = "creator_confirming"; } return; }
  const { error } = await getSupabase().from("secondary_usage_requests")
    .update({ creator_consented_at: new Date().toISOString(), status: "creator_confirming" }).eq("id", id);
  if (error) throw error;
}

// 배정: brand/creator 이름 → uuid 해석 후 upsert/delete
export async function setAssignment(
  brandName: string, creatorName: string, month: string, quota: number,
  brands: { id: string; name: string }[], creators: Creator[],
) {
  if (!isDb()) return;
  const sb = getSupabase();
  const brand_id = brands.find((b) => b.name === brandName)?.id;
  const creator_id = creators.find((c) => c.name === creatorName)?.id;
  if (!brand_id || !creator_id) return;
  if (quota <= 0) {
    const { error } = await sb.from("assignments").delete().match({ brand_id, creator_id, year_month: month });
    if (error) throw error;
  } else {
    const { error } = await sb.from("assignments").upsert(
      { brand_id, creator_id, year_month: month, quota }, { onConflict: "brand_id,creator_id,year_month" });
    if (error) throw error;
  }
}

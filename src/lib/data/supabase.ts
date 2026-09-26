import type { DataProvider } from "./provider";
import type { Brand, Creator, Content, Deal, Contract, Assignment, Account } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";

/* DB(snake_case) → 도메인 타입(camelCase) 매핑.
   RLS가 적용되므로 로그인한 사용자 권한에 맞는 행만 반환됩니다. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Supabase는 요청당 기본 1000행만 반환 → 전체를 페이지네이션으로 수집(누락 방지).
// id 정렬로 페이지 간 안정적 순서 보장.
async function q(table: string, cols = "*"): Promise<Row[]> {
  const sb = getSupabase();
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.warn(`[supabase] ${table}:`, error.message); break; }
    const batch = (data ?? []) as Row[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

// caption 등 UI 미사용 컬럼 제외로 페이로드 축소, 스냅샷은 최신값 계산에 필요한 컬럼만
const CONTENT_COLS = "id,brand_id,creator_id,deal_id,client,ig_media_id,permalink,thumbnail_url,product,kind,planned_date,published_at,status,match_source,sched,archived_video_url,video_status,year_month,sample_received,sample_courier,sample_tracking";
const SNAP_COLS = "content_id,captured_at,views,reach,likes,comments,saved,shares,avg_watch_time";

/* 순수 매핑 헬퍼 (row → 도메인 타입). 개별 메서드와 bundle()에서 공용. */
const mapBrand = (r: Row): Brand => ({
  id: r.id, code: r.code, name: r.name, aliases: r.aliases ?? [], color: r.color, domainAllowlist: r.domain_allowlist ?? [],
  contractStart: r.contract_start, contractEnd: r.contract_end,
  monthlyQuota: r.monthly_quota, monthlyAmount: r.monthly_amount != null ? Number(r.monthly_amount) : null,
  billCompany: r.bill_company, billAddress: r.bill_address, billTel: r.bill_tel, billRep: r.bill_rep, billRegNo: r.bill_reg_no,
});
const mapCreator = (r: Row, ig?: Row): Creator => ({
  id: r.id, code: r.code, pic: r.pic, name: r.name, nameKanji: r.name_kanji, nameEn: r.name_en, addressEn: r.address_en, aliases: r.aliases ?? [], handle: r.handle, photoUrl: r.photo_url,
  followers: r.followers ?? 0, status: r.status, category: r.category, tone: r.tone, intro: r.intro,
  monthlyQuota: r.monthly_quota, fixedCost: Number(r.fixed_cost ?? 0), contractDate: r.contract_date, startDate: r.start_date,
  email: r.email, phone: r.phone, address: r.address, bankAccount: r.bank_account, invoiceRegNo: r.invoice_reg_no,
  entityType: r.entity_type, withholding: r.withholding, contractEnd: r.contract_end,
  baseFee: r.base_fee != null ? Number(r.base_fee) : null, payCycle: r.pay_cycle, slackChannel: r.slack_channel,
  sns: r.sns ?? {}, rates: r.rates ?? { reels: 0, secondary: 0, offline: 0, etc: 0 },
  ig: ig ? { status: ig.status, linkedAt: ig.linked_at, expiresAt: ig.expires_at, lastSyncedAt: ig.last_synced_at } : undefined,
});
const mapContent = (r: Row, bName: Map<string, string>, cName: Map<string, string>, m: Row): Content => ({
  id: r.id, brandId: bName.get(r.brand_id) ?? null, brandName: r.client ?? bName.get(r.brand_id) ?? "", creatorId: r.creator_id,
  creatorName: cName.get(r.creator_id) ?? "", dealId: r.deal_id, client: r.client, igMediaId: r.ig_media_id,
  permalink: r.permalink, thumbnailUrl: r.thumbnail_url, caption: r.caption ?? "", product: r.product, kind: r.kind,
  yearMonth: r.year_month ?? null, sampleReceived: r.sample_received ?? false, sampleCourier: r.sample_courier ?? null, sampleTracking: r.sample_tracking ?? null,
  plannedDate: r.planned_date, publishedAt: r.published_at ? String(r.published_at).slice(0, 10) : null,
  status: r.status, matchSource: r.match_source, sched: r.sched ?? {}, videoStatus: r.video_status, archivedVideoUrl: r.archived_video_url,
  views: m.views ?? 0, reach: m.reach ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0, saves: m.saved ?? 0, shares: m.shares ?? 0, watch: m.avg_watch_time,
});
const mapDeal = (r: Row, cName: Map<string, string>): Deal => ({
  id: r.id, code: r.code, title: r.title, client: r.client, creatorName: cName.get(r.creator_id) ?? "",
  manager: r.manager, source: r.source, type: r.type, brief: r.brief, fee: Number(r.fee ?? 0),
  tax: r.tax != null ? Number(r.tax) : null,
  secondaryFee: r.secondary_fee != null ? Number(r.secondary_fee) : null,
  shareCompany: r.share_company, shareCreator: r.share_creator, dueDate: r.due_date, uploadDate: r.upload_date,
  step: r.step, contentId: r.content_id, sched: r.sched ?? {},
  receivedDate: r.received_date, paymentDue: r.payment_due, paidDate: r.paid_date, invoiceFile: r.invoice_file,
  registeredBy: r.registered_by, createdAt: r.created_at, prSeq: r.pr_seq, shareToken: r.share_token,
});
const mapContract = (r: Row, bName: Map<string, string>): Contract => ({
  id: r.id, brandId: bName.get(r.brand_id) ?? r.brand_id, yearMonth: r.year_month, quota: r.quota,
  unitPrice: Number(r.unit_price ?? 0), monthlyAmount: r.monthly_amount != null ? Number(r.monthly_amount) : null,
});
const mapAssignment = (r: Row, cName: Map<string, string>, bName: Map<string, string>): Assignment => ({
  id: r.id, brandId: bName.get(r.brand_id) ?? r.brand_id, creatorId: cName.get(r.creator_id) ?? r.creator_id, yearMonth: r.year_month, quota: r.quota,
});
// 콘텐츠별 최신 스냅샷 맵
function latestByContent(metrics: Row[]): Map<string, Row> {
  const latest = new Map<string, Row>();
  for (const m of metrics) { const cur = latest.get(m.content_id); if (!cur || m.captured_at > cur.captured_at) latest.set(m.content_id, m); }
  return latest;
}

export const supabaseProvider: DataProvider = {
  async brands() { return (await q("brands")).map(mapBrand); },
  async creators() {
    const [rows, igs] = await Promise.all([q("creators"), q("ig_accounts")]);
    const igByCreator = new Map(igs.map((i) => [i.creator_id, i]));
    return rows.map((r) => mapCreator(r, igByCreator.get(r.id)));
  },
  async contents() {
    const [rows, brands, creators, metrics] = await Promise.all([q("contents", CONTENT_COLS), q("brands"), q("creators"), q("content_metric_snapshots", SNAP_COLS)]);
    const bName = new Map(brands.map((b) => [b.id, b.name]));
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    const latest = latestByContent(metrics);
    return rows.map((r) => mapContent(r, bName, cName, latest.get(r.id) ?? {}));
  },
  async deals() {
    const [rows, creators] = await Promise.all([q("deals"), q("creators")]);
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    return rows.map((r) => mapDeal(r, cName));
  },
  async contracts() {
    const [rows, brands] = await Promise.all([q("contracts"), q("brands")]);
    const bName = new Map(brands.map((b) => [b.id, b.name]));
    return rows.map((r) => mapContract(r, bName));
  },
  async assignments() {
    const [rows, creators, brands] = await Promise.all([q("assignments"), q("creators"), q("brands")]);
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    const bName = new Map(brands.map((b) => [b.id, b.name]));
    return rows.map((r) => mapAssignment(r, cName, bName));
  },
  async accounts() {
    return (await q("profiles")).map((r): Account => ({
      email: r.email ?? "", role: r.role, scope: r.role === "admin" ? "81degree" : "—", status: r.status, lastLogin: r.last_login_at,
    }));
  },
  // 초기 로딩용 통합 페치 — 각 테이블 1회만 조회(중복 제거) + 단일 배리어로 최대 병렬화.
  async bundle() {
    const [brandRows, creatorRows, igs, contentRows, metrics, dealRows, contractRows, assignRows] = await Promise.all([
      q("brands"), q("creators"), q("ig_accounts"),
      q("contents", CONTENT_COLS), q("content_metric_snapshots", SNAP_COLS),
      q("deals"), q("contracts"), q("assignments"),
    ]);
    const bName = new Map(brandRows.map((b) => [b.id, b.name]));
    const cName = new Map(creatorRows.map((c) => [c.id, c.name]));
    const igByCreator = new Map(igs.map((i) => [i.creator_id, i]));
    const latest = latestByContent(metrics);
    return {
      brands: brandRows.map(mapBrand),
      creators: creatorRows.map((r) => mapCreator(r, igByCreator.get(r.id))),
      contents: contentRows.map((r) => mapContent(r, bName, cName, latest.get(r.id) ?? {})),
      deals: dealRows.map((r) => mapDeal(r, cName)),
      contracts: contractRows.map((r) => mapContract(r, bName)),
      assignments: assignRows.map((r) => mapAssignment(r, cName, bName)),
    };
  },
};

import type { DataProvider } from "./provider";
import type { Brand, Creator, Content, Deal, Contract, Assignment, Account } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";

/* DB(snake_case) → 도메인 타입(camelCase) 매핑.
   RLS가 적용되므로 로그인한 사용자 권한에 맞는 행만 반환됩니다. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function q(table: string, cols = "*"): Promise<Row[]> {
  const { data, error } = await getSupabase().from(table).select(cols);
  if (error) { console.warn(`[supabase] ${table}:`, error.message); return []; }
  return (data ?? []) as Row[];
}

export const supabaseProvider: DataProvider = {
  async brands() {
    return (await q("brands")).map((r): Brand => ({
      id: r.id, name: r.name, aliases: r.aliases ?? [], color: r.color, domainAllowlist: r.domain_allowlist ?? [],
    }));
  },
  async creators() {
    const [rows, igs] = await Promise.all([q("creators"), q("ig_accounts")]);
    const igByCreator = new Map(igs.map((i) => [i.creator_id, i]));
    return rows.map((r): Creator => {
      const ig = igByCreator.get(r.id);
      return {
        id: r.id, pic: r.pic, name: r.name, aliases: r.aliases ?? [], handle: r.handle, photoUrl: r.photo_url,
        followers: r.followers ?? 0, status: r.status, category: r.category, tone: r.tone, intro: r.intro,
        monthlyQuota: r.monthly_quota, fixedCost: Number(r.fixed_cost ?? 0), contractDate: r.contract_date, startDate: r.start_date,
        email: r.email, phone: r.phone, address: r.address, bankAccount: r.bank_account, invoiceRegNo: r.invoice_reg_no,
        entityType: r.entity_type, withholding: r.withholding, contractEnd: r.contract_end,
        baseFee: r.base_fee != null ? Number(r.base_fee) : null, payCycle: r.pay_cycle,
        sns: r.sns ?? {}, rates: r.rates ?? { reels: 0, secondary: 0, offline: 0, etc: 0 },
        ig: ig ? { status: ig.status, linkedAt: ig.linked_at, expiresAt: ig.expires_at } : undefined,
      };
    });
  },
  async contents() {
    const [rows, brands, creators, metrics] = await Promise.all([q("contents"), q("brands"), q("creators"), q("content_metric_snapshots")]);
    const bName = new Map(brands.map((b) => [b.id, b.name]));
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    // 콘텐츠별 최신 스냅샷
    const latest = new Map<string, Row>();
    for (const m of metrics) { const cur = latest.get(m.content_id); if (!cur || m.captured_at > cur.captured_at) latest.set(m.content_id, m); }
    return rows.map((r): Content => {
      const m = latest.get(r.id) ?? {};
      return {
        id: r.id, brandId: bName.get(r.brand_id) ?? null, brandName: r.client ?? bName.get(r.brand_id) ?? "", creatorId: r.creator_id,
        creatorName: cName.get(r.creator_id) ?? "", dealId: r.deal_id, client: r.client, igMediaId: r.ig_media_id,
        permalink: r.permalink, thumbnailUrl: r.thumbnail_url, caption: r.caption, product: r.product, kind: r.kind,
        plannedDate: r.planned_date, publishedAt: r.published_at ? String(r.published_at).slice(0, 10) : null,
        status: r.status, matchSource: r.match_source, sched: r.sched ?? {}, videoStatus: r.video_status, archivedVideoUrl: r.archived_video_url,
        views: m.views ?? 0, reach: m.reach ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0, saves: m.saved ?? 0, shares: m.shares ?? 0, watch: m.avg_watch_time,
      };
    });
  },
  async deals() {
    const [rows, creators] = await Promise.all([q("deals"), q("creators")]);
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    return rows.map((r): Deal => ({
      id: r.id, code: r.code, title: r.title, client: r.client, creatorName: cName.get(r.creator_id) ?? "",
      manager: r.manager, source: r.source, type: r.type, brief: r.brief, fee: Number(r.fee ?? 0),
      shareCompany: r.share_company, shareCreator: r.share_creator, dueDate: r.due_date, uploadDate: r.upload_date,
      step: r.step, contentId: r.content_id,
    }));
  },
  async contracts() {
    return (await q("contracts")).map((r): Contract => ({
      id: r.id, brandId: r.brand_id, yearMonth: r.year_month, quota: r.quota, unitPrice: Number(r.unit_price ?? 0),
    }));
  },
  async assignments() {
    const [rows, creators, brands] = await Promise.all([q("assignments"), q("creators"), q("brands")]);
    const cName = new Map(creators.map((c) => [c.id, c.name]));
    const bName = new Map(brands.map((b) => [b.id, b.name]));
    return rows.map((r): Assignment => ({
      id: r.id, brandId: bName.get(r.brand_id) ?? r.brand_id, creatorId: cName.get(r.creator_id) ?? r.creator_id, yearMonth: r.year_month, quota: r.quota,
    }));
  },
  async accounts() {
    return (await q("profiles")).map((r): Account => ({
      email: r.email ?? "", role: r.role, scope: r.role === "admin" ? "81degree" : "—", status: r.status, lastLogin: r.last_login_at,
    }));
  },
};

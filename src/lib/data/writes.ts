"use client";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Creator, Deal } from "@/lib/types";

// supabase 모드일 때만 실제 DB 쓰기. mock 모드면 no-op(메모리 변경은 호출부에서 처리).
export const isDb = () =>
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" && supabaseConfigured();

function creatorRow(c: Creator) {
  return {
    pic: c.pic ?? null, name: c.name, handle: c.handle ?? null, photo_url: c.photoUrl ?? null,
    followers: c.followers, status: c.status, category: c.category ?? null, tone: c.tone ?? null,
    intro: c.intro ?? null, monthly_quota: c.monthlyQuota ?? null, fixed_cost: c.fixedCost,
    contract_date: c.contractDate ?? null, start_date: c.startDate ?? null, sns: c.sns, rates: c.rates,
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

function dealRow(d: Deal, creatorId: string | null) {
  return {
    code: d.code ?? null, title: d.title, client: d.client, creator_id: creatorId, manager: d.manager ?? null,
    source: d.source, type: d.type, brief: d.brief ?? null, fee: d.fee,
    share_company: d.shareCompany, share_creator: d.shareCreator,
    due_date: d.dueDate || null, upload_date: d.uploadDate || null, step: d.step,
  };
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

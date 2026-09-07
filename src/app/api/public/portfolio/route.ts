import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// 공개 포트폴리오 — 특정 크리에이터의 업로드 콘텐츠(공개 작업물) + 지표. PII 없음.
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ items: [] });
  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ items: [] }); }

  const { data: creator } = await admin.from("creators").select("id").eq("name", name).eq("status", "active").maybeSingle();
  if (!creator) return NextResponse.json({ items: [] });

  const { data: contents } = await admin.from("contents")
    .select("id, product, permalink, thumbnail_url, published_at, kind, brand_id")
    .eq("creator_id", creator.id).eq("status", "uploaded").neq("kind", "deal").limit(300);
  const ids = (contents ?? []).map((c) => c.id);
  const [{ data: metrics }, { data: brands }] = await Promise.all([
    ids.length ? admin.from("content_metric_snapshots").select("content_id, views, reach, likes, comments, saved, shares, captured_at").in("content_id", ids) : Promise.resolve({ data: [] }),
    admin.from("brands").select("id, name"),
  ]);
  const bName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const latest = new Map<string, Record<string, number | string>>();
  for (const m of metrics ?? []) { const cur = latest.get(m.content_id); if (!cur || (m.captured_at as string) > (cur.captured_at as string)) latest.set(m.content_id, m); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (contents ?? []).map((c: any) => {
    const m = latest.get(c.id) ?? {};
    return {
      product: c.product, permalink: c.permalink ?? null, thumbnailUrl: c.thumbnail_url ?? null,
      publishedAt: c.published_at ? String(c.published_at).slice(0, 10) : null,
      brandName: c.brand_id ? bName.get(c.brand_id) ?? null : null,
      views: Number(m.views ?? 0), reach: Number(m.reach ?? 0), likes: Number(m.likes ?? 0),
      comments: Number(m.comments ?? 0), saves: Number(m.saved ?? 0), shares: Number(m.shares ?? 0),
    };
  }).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  return NextResponse.json({ items });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

// 로그인한 사용자가 특정 크리에이터의 업로드 콘텐츠(포트폴리오)를 조회.
// 캐스팅/프로필용 — 본인 소속 브랜드가 아니어도 크리에이터의 공개 작업물을 볼 수 있음.
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const name = req.nextUrl.searchParams.get("name"); // 없으면 전체
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });

  const admin = getAdminClient();
  let creatorId: string | null = null;
  if (name) {
    const { data: creator } = await admin.from("creators").select("id").eq("name", name).maybeSingle();
    if (!creator) return NextResponse.json({ rows: [] });
    creatorId = creator.id;
  }
  let cq = admin.from("contents")
    .select("id, creator_id, product, permalink, thumbnail_url, caption, published_at, status, kind, client, brand_id")
    .eq("status", "uploaded").limit(600);
  if (creatorId) cq = cq.eq("creator_id", creatorId);
  const { data: contents } = await cq;
  const ids = (contents ?? []).map((c) => c.id);
  const [{ data: metrics }, { data: brands }, { data: creators }] = await Promise.all([
    ids.length ? admin.from("content_metric_snapshots").select("content_id, views, reach, likes, comments, saved, shares, captured_at").in("content_id", ids) : Promise.resolve({ data: [] }),
    admin.from("brands").select("id, name"),
    admin.from("creators").select("id, name"),
  ]);
  const bName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const cName = new Map((creators ?? []).map((c) => [c.id, c.name]));
  const latest = new Map<string, Record<string, number | string>>();
  for (const m of metrics ?? []) { const cur = latest.get(m.content_id); if (!cur || (m.captured_at as string) > (cur.captured_at as string)) latest.set(m.content_id, m); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (contents ?? []).map((c: any) => {
    const m = latest.get(c.id) ?? {};
    return {
      id: c.id, creatorId: cName.get(c.creator_id) ?? "", creatorName: cName.get(c.creator_id) ?? "", brandId: bName.get(c.brand_id) ?? null,
      brandName: c.client ?? bName.get(c.brand_id) ?? "", product: c.product, permalink: c.permalink, thumbnailUrl: c.thumbnail_url,
      caption: c.caption, publishedAt: c.published_at ? String(c.published_at).slice(0, 10) : null, status: c.status, kind: c.kind,
      sched: {}, videoStatus: "ready",
      views: m.views ?? 0, reach: m.reach ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0, saves: m.saved ?? 0, shares: m.shares ?? 0,
    };
  });
  return NextResponse.json({ rows });
}

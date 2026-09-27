import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ah!channel 미디어(자체 인스타그램) 분석 — 홈/오디언스/콘텐츠.
// ah!channel 미디어 엔티티(creators.is_media=true or name='ah!channel')의 IG 스냅샷 집계.
// 인증: 로그인 세션 Bearer → 역할 ahchannel/admin.
async function auth(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "로그인 필요", status: 401 as const };
  const { data: { user } } = await createClient(url, anonKey).auth.getUser(token);
  if (!user) return { error: "인증 실패", status: 401 as const };
  const admin = getAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "ahchannel" && prof?.role !== "admin") return { error: "권한 없음", status: 403 as const };
  return { admin };
}

const EMPTY = {
  connected: false, name: "ah!channel", handle: null as string | null,
  kpi: { followers: 0, impressions: 0, reach: 0, newFollowers: 0, contentCount: 0 },
  followerSeries: [] as { date: string; followers: number }[],
  weeklyGrowth: [] as { week: string; delta: number; pct: number }[],
  audience: { female: 0, ages: [] as [string, number][], countries: [] as [string, number][], cities: [] as [string, number][] },
  contents: [] as unknown[],
};

export async function GET(req: NextRequest) {
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin } = a;

  // ah!channel 미디어 엔티티 찾기
  const { data: media } = await admin.from("creators").select("id, name, handle").ilike("name", "ah!channel").maybeSingle();
  if (!media) return NextResponse.json(EMPTY, { headers: { "Cache-Control": "no-store" } });
  const cid = media.id;

  // IG 연결 여부
  const { data: acct } = await admin.from("ig_accounts").select("creator_id").eq("creator_id", cid).maybeSingle();

  // 팔로워 추이
  const { data: snaps } = await admin.from("creator_account_snapshots").select("date, followers").eq("creator_id", cid).order("date", { ascending: true });
  const followerSeries = (snaps || []).map((r) => ({ date: String(r.date), followers: Number(r.followers) || 0 }));
  const followers = followerSeries.length ? followerSeries[followerSeries.length - 1].followers : 0;

  // 주간 성장(스냅샷 7일 간격 근사)
  const weeklyGrowth: { week: string; delta: number; pct: number }[] = [];
  for (let i = followerSeries.length - 1; i > 0 && weeklyGrowth.length < 13; i--) {
    const cur = followerSeries[i], prev = followerSeries[Math.max(0, i - 7)];
    const delta = cur.followers - prev.followers;
    weeklyGrowth.push({ week: cur.date, delta, pct: prev.followers ? +(delta / prev.followers * 100).toFixed(1) : 0 });
    i -= 6;
  }

  // 오디언스(최신)
  const { data: aud } = await admin.from("audience_snapshots").select("female_pct, ages, countries, cities").eq("creator_id", cid).order("captured_at", { ascending: false }).limit(1).maybeSingle();
  const audience = { female: aud?.female_pct ?? 0, ages: aud?.ages ?? [], countries: aud?.countries ?? [], cities: aud?.cities ?? [] };

  // 콘텐츠 + 최신 지표
  const { data: cts } = await admin.from("contents").select("id, permalink, thumbnail_url, product, published_at").eq("creator_id", cid).order("published_at", { ascending: false }).range(0, 999);
  const ids = (cts || []).map((c) => c.id);
  const metricByContent: Record<string, Record<string, number>> = {};
  if (ids.length) {
    const { data: ms } = await admin.from("content_metric_snapshots").select("content_id, views, likes, comments, saved, shares, reach, captured_at").in("content_id", ids).order("captured_at", { ascending: false });
    for (const m of ms || []) { if (!metricByContent[m.content_id]) metricByContent[m.content_id] = { views: m.views ?? 0, likes: m.likes ?? 0, comments: m.comments ?? 0, saved: m.saved ?? 0, shares: m.shares ?? 0, reach: (m as { reach?: number }).reach ?? 0 }; }
  }
  const contents = (cts || []).map((c) => {
    const m = metricByContent[c.id] || { views: 0, likes: 0, comments: 0, saved: 0, shares: 0, reach: 0 };
    return { id: c.id, caption: c.product || "", permalink: c.permalink, thumbnailUrl: c.thumbnail_url, publishedAt: c.published_at, ...m };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const impressions = contents.reduce((s, c: any) => s + (c.views || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reach = contents.reduce((s, c: any) => s + (c.reach || 0), 0);

  return NextResponse.json({
    connected: !!acct, name: media.name, handle: media.handle,
    kpi: { followers, impressions, reach, newFollowers: weeklyGrowth[0]?.delta ?? 0, contentCount: contents.length },
    followerSeries, weeklyGrowth, audience, contents,
  }, { headers: { "Cache-Control": "no-store" } });
}

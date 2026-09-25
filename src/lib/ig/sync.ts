import type { SupabaseClient } from "@supabase/supabase-js";
import { metaProvider, fetchProfile } from "@/lib/ingest/meta";

// 크리에이터 1명 동기화 (수동 버튼 + 크론 공용). admin = service_role 클라이언트.
// opts.maxMetrics: 인사이트를 조회할 최근 콘텐츠 수 (크론은 작게 → 타임아웃 방지)
export async function syncCreatorData(admin: SupabaseClient, creatorId: string, opts: { maxMetrics?: number } = {}) {
  const maxMetrics = opts.maxMetrics ?? 300;
  const { data: acct } = await admin.from("ig_accounts").select("ig_user_id, token").eq("creator_id", creatorId).maybeSingle();
  if (!acct?.token) throw new Error("연동된 인스타 계정이 없습니다");
  const igToken = acct.token as string;
  const provider = metaProvider(igToken);
  const today = new Date().toISOString().slice(0, 10);
  try {
    // 프로필 → 팔로워 + 계정 스냅샷
    const profile = await fetchProfile(igToken);
    const followers = profile.followers_count ?? 0;
    await admin.from("creators").update({ followers }).eq("id", creatorId);
    await admin.from("creator_account_snapshots").upsert(
      { creator_id: creatorId, date: today, followers }, { onConflict: "creator_id,date" });
    // 동기화 시각을 조기에 기록 (이후 미디어 루프가 느려도/중단돼도 최신화 반영)
    await admin.from("ig_accounts").update({ last_synced_at: new Date().toISOString(), status: "active" }).eq("creator_id", creatorId);

    // 미디어 수집
    const reels = await provider.fetchRecentReels(acct.ig_user_id ?? "");
    // 릴스 permalink → 기존 콘텐츠(수동 등록 PR 등) 매칭용. 릴스 코드로 대조.
    const reelCode = (u?: string | null) => { const m = (u || "").match(/instagram\.com\/(?:share\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i); return m ? m[1] : ""; };
    const { data: existing } = await admin.from("contents").select("id, ig_media_id, permalink, kind").eq("creator_id", creatorId);
    // PR/딜 등 비(非)-own 콘텐츠는 kind/product/brand를 보존해야 하므로 대량 upsert에서 제외하고 미디어 필드만 갱신
    const protectedMedia = new Set<string>(); // 이미 ig_media_id가 붙은 비-own 콘텐츠
    const prByCode = new Map<string, string>(); // permalink만 있는 비-own 콘텐츠: code → content id
    for (const c of existing ?? []) {
      if (c.kind !== "own") {
        if (c.ig_media_id) protectedMedia.add(c.ig_media_id as string);
        else { const cd = reelCode(c.permalink); if (cd) prByCode.set(cd, c.id as string); }
      }
    }
    // 1) PR 콘텐츠에 릴스 연결(미디어 필드만) — kind/product/brand 보존
    const bulkOwn: Record<string, unknown>[] = [];
    for (const r of reels) {
      const cd = reelCode(r.permalink);
      const prId = (cd && prByCode.get(cd)) || null;
      if (prId) {
        await admin.from("contents").update({
          ig_media_id: r.igMediaId, thumbnail_url: r.thumbnailUrl, published_at: r.publishedAt || null,
          video_status: "ready", status: "uploaded",
        }).eq("id", prId);
        protectedMedia.add(r.igMediaId); // 이후 대량 upsert에서 제외
      } else if (protectedMedia.has(r.igMediaId)) {
        // 이미 연결된 PR 콘텐츠 — 썸네일 등 미디어 필드만 갱신(kind 보존)
        await admin.from("contents").update({ thumbnail_url: r.thumbnailUrl, published_at: r.publishedAt || null, video_status: "ready" }).eq("ig_media_id", r.igMediaId);
      } else {
        bulkOwn.push({
          creator_id: creatorId, ig_media_id: r.igMediaId, permalink: r.permalink, thumbnail_url: r.thumbnailUrl,
          caption: r.caption, product: (r.caption || "인스타 콘텐츠").split("\n")[0].slice(0, 60),
          kind: "own", status: "uploaded", published_at: r.publishedAt || null, video_status: "ready", match_source: "auto",
        });
      }
    }
    // 2) 나머지 개인 게시물 대량 upsert (기존 방식)
    if (bulkOwn.length) await admin.from("contents").upsert(bulkOwn, { onConflict: "ig_media_id" });
    // ig_media_id → content id 매핑 (지표 저장용) — PR 콘텐츠 포함
    const { data: idRows } = await admin.from("contents").select("id, ig_media_id").eq("creator_id", creatorId).not("ig_media_id", "is", null);
    const idByMedia = new Map((idRows ?? []).map((x) => [x.ig_media_id, x.id]));
    // 최근 maxMetrics건만 인사이트 조회 (느린 부분 제한)
    let metricCount = 0;
    for (let i = 0; i < Math.min(reels.length, maxMetrics); i++) {
      const r = reels[i]; const cid = idByMedia.get(r.igMediaId);
      if (!cid) continue;
      try {
        const m = await provider.fetchContentMetrics(r.igMediaId);
        await admin.from("content_metric_snapshots").upsert({
          content_id: cid, captured_at: `${today}T00:00:00Z`,
          views: m.views, reach: m.reach, likes: m.likes, comments: m.comments, saved: m.saved, shares: m.shares,
        }, { onConflict: "content_id,captured_at" });
        metricCount++;
      } catch { /* 인사이트 미지원 미디어 건너뜀 */ }
    }
    // 오디언스(성별·연령) 수집 — IG follower_demographics. 미지원 계정이면 조용히 건너뜀.
    try {
      const aud = await provider.fetchAudience(acct.ig_user_id ?? "");
      const parsed = parseAudience(aud.genderAge);
      const countries = parseTopBreakdown(aud.country);
      const cities = parseTopBreakdown(aud.city);
      if (parsed || countries.length || cities.length) await admin.from("audience_snapshots").upsert(
        { creator_id: creatorId, date: today, female_pct: parsed?.female ?? null, ages: parsed?.ages ?? null, countries, cities, raw: aud.genderAge },
        { onConflict: "creator_id,date" });
    } catch { /* 데모그래픽 미지원 계정 */ }

    return { followers, contents: reels.length, metrics: metricCount };
  } catch (e) {
    await admin.from("ig_accounts").update({ status: "expired" }).eq("creator_id", creatorId);
    throw e;
  }
}

// IG follower_demographics(breakdown=age,gender) → { female:%, ages:[[bucket,%],...] }
// 성별 데이터가 없으면 female=null. 파싱 불가 시 null 반환.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAudience(data: any): { female: number | null; ages: [string, number][] } | null {
  const bd = data?.[0]?.total_value?.breakdowns?.[0];
  const results = bd?.results;
  if (!Array.isArray(results) || !results.length) return null;
  const keys: string[] = bd.dimension_keys || ["age", "gender"];
  const ageIdx = keys.indexOf("age"), genderIdx = keys.indexOf("gender");
  const bucketOf = (a: string) => {
    if (!a) return "45+";
    if (a.startsWith("13")) return "13–17";
    if (a.startsWith("18")) return "18–24";
    if (a.startsWith("25")) return "25–34";
    if (a.startsWith("35")) return "35–44";
    return "45+";
  };
  const buckets: Record<string, number> = { "13–17": 0, "18–24": 0, "25–34": 0, "35–44": 0, "45+": 0 };
  let total = 0, female = 0, hasGender = false;
  for (const r of results) {
    const v = Number(r.value) || 0; total += v;
    const dv: string[] = r.dimension_values || [];
    if (ageIdx >= 0) buckets[bucketOf(dv[ageIdx])] += v;
    if (genderIdx >= 0) { hasGender = true; if ((dv[genderIdx] || "").toUpperCase() === "F") female += v; }
  }
  if (!total) return null;
  const ages: [string, number][] = Object.entries(buckets).map(([k, v]) => [k, Math.round(v / total * 100)]);
  return { female: hasGender ? Math.round(female / total * 100) : null, ages };
}

// 단일 차원(country/city) breakdown → 상위 N개 [[값, %], ...]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTopBreakdown(data: any, limit = 6): [string, number][] {
  const results = data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results) || !results.length) return [];
  let total = 0; const map: Record<string, number> = {};
  for (const r of results) { const v = Number(r.value) || 0; total += v; const k = (r.dimension_values || [])[0]; if (k) map[k] = (map[k] || 0) + v; }
  if (!total) return [];
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => [k, Math.round(v / total * 100)]);
}

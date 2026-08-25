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
    // 콘텐츠 메타데이터를 한 번에 upsert (개별 왕복 제거 → 타임아웃 방지)
    const rows = reels.map((r) => ({
      creator_id: creatorId, ig_media_id: r.igMediaId, permalink: r.permalink, thumbnail_url: r.thumbnailUrl,
      caption: r.caption, product: (r.caption || "인스타 콘텐츠").split("\n")[0].slice(0, 60),
      kind: "own", status: "uploaded", published_at: r.publishedAt || null, video_status: "ready", match_source: "auto",
    }));
    if (rows.length) await admin.from("contents").upsert(rows, { onConflict: "ig_media_id" });
    // ig_media_id → content id 매핑 (지표 저장용)
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
    return { followers, contents: rows.length, metrics: metricCount };
  } catch (e) {
    await admin.from("ig_accounts").update({ status: "expired" }).eq("creator_id", creatorId);
    throw e;
  }
}

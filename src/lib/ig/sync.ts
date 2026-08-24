import type { SupabaseClient } from "@supabase/supabase-js";
import { metaProvider, fetchProfile } from "@/lib/ingest/meta";

// 크리에이터 1명 동기화 (수동 버튼 + 크론 공용). admin = service_role 클라이언트.
export async function syncCreatorData(admin: SupabaseClient, creatorId: string) {
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

    // 미디어 → 콘텐츠 upsert + 지표 스냅샷 (전체, 최대 300)
    const reels = await provider.fetchRecentReels(acct.ig_user_id ?? "");
    let contentCount = 0, metricCount = 0;
    for (const r of reels) {
      const product = (r.caption || "인스타 콘텐츠").split("\n")[0].slice(0, 60);
      const { data: c, error: cErr } = await admin.from("contents").upsert({
        creator_id: creatorId, ig_media_id: r.igMediaId, permalink: r.permalink, thumbnail_url: r.thumbnailUrl,
        caption: r.caption, product, kind: "own", status: "uploaded",
        published_at: r.publishedAt || null, video_status: "ready", match_source: "auto",
      }, { onConflict: "ig_media_id" }).select("id").single();
      if (cErr || !c) continue;
      contentCount++;
      try {
        const m = await provider.fetchContentMetrics(r.igMediaId);
        // 콘텐츠당 하루 1행(당일 자정 스탬프) — 시간별 동기화가 같은 행을 덮어써 DB 폭증 방지
        await admin.from("content_metric_snapshots").upsert({
          content_id: c.id, captured_at: `${today}T00:00:00Z`,
          views: m.views, reach: m.reach, likes: m.likes, comments: m.comments, saved: m.saved, shares: m.shares,
        }, { onConflict: "content_id,captured_at" });
        metricCount++;
      } catch { /* 인사이트 미지원 미디어 건너뜀 */ }
    }
    await admin.from("ig_accounts").update({ last_synced_at: new Date().toISOString(), status: "active" }).eq("creator_id", creatorId);
    return { followers, contents: contentCount, metrics: metricCount };
  } catch (e) {
    await admin.from("ig_accounts").update({ status: "expired" }).eq("creator_id", creatorId);
    throw e;
  }
}

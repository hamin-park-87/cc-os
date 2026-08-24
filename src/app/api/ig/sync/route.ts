import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { metaProvider, fetchProfile } from "@/lib/ingest/meta";

// 관리자 트리거 동기화: 크리에이터 인스타 데이터 → 스냅샷/콘텐츠 반영.
// POST body: { creatorId }
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let body: { creatorId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const { creatorId } = body;
  if (!creatorId) return NextResponse.json({ error: "creatorId 필요" }, { status: 400 });

  // 1) 관리자 검증
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자만 동기화할 수 있습니다" }, { status: 403 });

  // 2) 토큰 로드
  const { data: acct } = await admin.from("ig_accounts").select("ig_user_id, token").eq("creator_id", creatorId).maybeSingle();
  if (!acct?.token) return NextResponse.json({ error: "연동된 인스타 계정이 없습니다" }, { status: 400 });
  const igToken = acct.token as string;
  const provider = metaProvider(igToken);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 3) 프로필 → 팔로워 업데이트 + 계정 스냅샷
    const profile = await fetchProfile(igToken);
    const followers = profile.followers_count ?? 0;
    await admin.from("creators").update({ followers }).eq("id", creatorId);
    await admin.from("creator_account_snapshots").upsert(
      { creator_id: creatorId, date: today, followers },
      { onConflict: "creator_id,date" }
    );

    // 4) 미디어 → 콘텐츠 upsert + 지표 스냅샷 (최근 25개)
    const reels = (await provider.fetchRecentReels(acct.ig_user_id ?? "")).slice(0, 25);
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
        await admin.from("content_metric_snapshots").upsert({
          content_id: c.id, captured_at: new Date().toISOString(),
          views: m.views, reach: m.reach, likes: m.likes, comments: m.comments, saved: m.saved, shares: m.shares,
        }, { onConflict: "content_id,captured_at" });
        metricCount++;
      } catch { /* 인사이트 미지원 미디어는 건너뜀 */ }
    }
    return NextResponse.json({ ok: true, followers, contents: contentCount, metrics: metricCount });
  } catch (e) {
    // 토큰 만료 등 → 상태 표시
    await admin.from("ig_accounts").update({ status: "expired" }).eq("creator_id", creatorId);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

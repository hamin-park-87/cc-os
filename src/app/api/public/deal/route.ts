import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// 공개(로그인 불필요) 안건 대시보드 — 토큰으로 1건 조회. 내부 민감정보(금액·쉐어 등) 제외.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "not found" }, { status: 404 });
  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ error: "server" }, { status: 500 }); }

  const { data: deal } = await admin.from("deals")
    .select("id, pr_seq, title, client, creator_id, manager, step, brief, due_date, upload_date, received_date, sched, content_id")
    .eq("share_token", token).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [{ data: creator }, { data: content }] = await Promise.all([
    deal.creator_id ? admin.from("creators").select("name, name_en, handle, photo_url").eq("id", deal.creator_id).maybeSingle() : Promise.resolve({ data: null }),
    deal.content_id ? admin.from("contents").select("id, permalink, thumbnail_url, published_at").eq("id", deal.content_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // 업로드 콘텐츠 지표(최신)
  let metrics: Record<string, number> | null = null;
  if (content?.id) {
    const { data: ms } = await admin.from("content_metric_snapshots")
      .select("views, likes, comments, saved, shares, captured_at").eq("content_id", content.id).order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (ms) metrics = { views: ms.views ?? 0, likes: ms.likes ?? 0, comments: ms.comments ?? 0, saved: ms.saved ?? 0, shares: ms.shares ?? 0 };
  }

  return NextResponse.json({
    prNo: deal.pr_seq ? "PR-" + String(deal.pr_seq).padStart(3, "0") : null,
    title: deal.title, client: deal.client, manager: deal.manager ?? null,
    step: deal.step ?? 0, brief: deal.brief ?? null,
    dueDate: deal.due_date, uploadDate: deal.upload_date, receivedDate: deal.received_date,
    sched: deal.sched ?? {},
    creator: creator ? { name: creator.name, nameEn: creator.name_en ?? null, handle: creator.handle ?? null, photoUrl: creator.photo_url ?? null } : null,
    content: content ? { permalink: content.permalink ?? null, thumbnailUrl: content.thumbnail_url ?? null, publishedAt: content.published_at ?? null, metrics } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

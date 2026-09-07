import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// 공개(로그인 불필요) 크리에이터 리스트 — PII 완전 제외, 공개용 프로필 + 성과 요약만.
export const revalidate = 300; // 5분 캐시

export async function GET() {
  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ creators: [] }); }

  const [{ data: creators }, { data: contents }, { data: metrics }] = await Promise.all([
    admin.from("creators").select("id, code, name, name_en, handle, photo_url, followers, category, tone, intro, sns, status").eq("status", "active"),
    admin.from("contents").select("id, creator_id, status, kind").eq("status", "uploaded"),
    admin.from("content_metric_snapshots").select("content_id, views, likes, comments, saved, shares, captured_at"),
  ]);

  // 콘텐츠별 최신 스냅샷
  const latest = new Map<string, { views: number; likes: number; comments: number; saved: number; shares: number }>();
  const cap = new Map<string, string>();
  for (const m of metrics ?? []) {
    const prev = cap.get(m.content_id);
    if (!prev || (m.captured_at as string) > prev) { cap.set(m.content_id, m.captured_at as string); latest.set(m.content_id, m); }
  }
  // 크리에이터별 집계
  const agg = new Map<string, { uploads: number; views: number; engSum: number; engN: number }>();
  for (const c of contents ?? []) {
    if (c.kind === "deal") continue; // 외부 PR은 공개 미디어킷에서 제외(개인/전략 브랜드 위주)
    const a = agg.get(c.creator_id) ?? { uploads: 0, views: 0, engSum: 0, engN: 0 };
    a.uploads++;
    const m = latest.get(c.id);
    if (m && m.views > 0) { a.views += m.views; a.engSum += (m.likes + m.comments + m.saved + m.shares) / m.views * 100; a.engN++; }
    agg.set(c.creator_id, a);
  }

  const rows = (creators ?? []).map((c) => {
    const a = agg.get(c.id) ?? { uploads: 0, views: 0, engSum: 0, engN: 0 };
    return {
      code: c.code ?? null, name: c.name, nameEn: c.name_en ?? null, handle: c.handle ?? null,
      photoUrl: c.photo_url ?? null, followers: c.followers ?? 0, category: c.category ?? null,
      tone: c.tone ?? null, intro: c.intro ?? null, sns: c.sns ?? {},
      uploads: a.uploads, totalViews: a.views, avgEng: a.engN ? +(a.engSum / a.engN).toFixed(1) : null,
    };
  });
  // 번호순 정렬
  rows.sort((x, y) => {
    const nx = x.code?.match(/\d+/), ny = y.code?.match(/\d+/);
    return (nx ? +nx[0] : 9999) - (ny ? +ny[0] : 9999) || x.name.localeCompare(y.name);
  });
  return NextResponse.json({ creators: rows });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncCreatorData } from "@/lib/ig/sync";

// Vercel Cron: 1시간마다 연동된 모든 크리에이터 자동 동기화.
// CRON_SECRET 설정 시 Vercel이 Authorization: Bearer <CRON_SECRET> 헤더를 보냄 → 검증.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let admin;
  try { admin = getAdminClient(); } catch { return NextResponse.json({ error: "service role 미설정" }, { status: 500 }); }

  // 활성 연동 계정만
  const { data: accts } = await admin.from("ig_accounts").select("creator_id").eq("status", "active");
  const ids = (accts ?? []).map((a) => a.creator_id as string);
  const results: { creatorId: string; ok: boolean; followers?: number; contents?: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      const r = await syncCreatorData(admin, id);
      results.push({ creatorId: id, ok: true, followers: r.followers, contents: r.contents });
    } catch (e) {
      results.push({ creatorId: id, ok: false, error: (e as Error).message });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ ran: results.length, ok, failed: results.length - ok, results });
}

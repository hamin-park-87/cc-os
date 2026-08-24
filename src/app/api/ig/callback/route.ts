import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, longLivedToken, fetchProfile, igConfig } from "@/lib/ingest/meta";
import { verifyState } from "@/lib/ig/state";
import { getAdminClient } from "@/lib/supabase/admin";

// 인스타 동의 후 콜백: code → 장기토큰 → ig_accounts 저장 후 앱으로 복귀.
export async function GET(req: NextRequest) {
  const { appUrl } = igConfig();
  const back = (q: string) => NextResponse.redirect(`${appUrl}/?ig=${q}`);
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("denied");
  const code = sp.get("code");
  const state = sp.get("state") ?? "";
  const creatorId = verifyState(state);
  if (!code || !creatorId) return back("invalid");
  try {
    const { accessToken: shortTok } = await exchangeCode(code);
    const { accessToken: token, expiresIn } = await longLivedToken(shortTok);
    const profile = await fetchProfile(token);
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const admin = getAdminClient();
    // 기존 연동 제거 후 재등록 (크리에이터당 1계정)
    await admin.from("ig_accounts").delete().eq("creator_id", creatorId);
    const { error } = await admin.from("ig_accounts").insert({
      creator_id: creatorId, ig_user_id: String(profile.user_id ?? ""), token,
      scope: ["instagram_business_basic", "instagram_business_manage_insights"],
      linked_at: new Date().toISOString(), expires_at: expiresAt, status: "active",
    });
    if (error) throw error;
    // 핸들 자동 반영 (있으면)
    if (profile.username) await admin.from("creators").update({ handle: "@" + profile.username }).eq("id", creatorId);
    return back("connected");
  } catch (e) {
    console.warn("[ig/callback]", (e as Error).message);
    return back("failed");
  }
}

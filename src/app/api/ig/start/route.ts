import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl, igConfig } from "@/lib/ingest/meta";
import { signState } from "@/lib/ig/state";

// 연동 시작: 크리에이터를 인스타 동의 화면으로 리디렉션.
// 사용: /api/ig/start?creator=<creator_uuid>
export async function GET(req: NextRequest) {
  const creator = req.nextUrl.searchParams.get("creator");
  if (!creator) return NextResponse.json({ error: "creator 파라미터 필요" }, { status: 400 });
  if (!igConfig().configured) return NextResponse.json({ error: "서버에 IG_APP_ID / IG_APP_SECRET 미설정" }, { status: 500 });
  const url = authorizeUrl(signState(creator));
  return NextResponse.redirect(url);
}

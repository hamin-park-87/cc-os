import { NextResponse } from "next/server";

// 환경변수 설정 여부만 (값 노출 없음) — 연동 상태 점검용
export async function GET() {
  return NextResponse.json({
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    slack: !!process.env.SLACK_WEBHOOK_URL,
    email: !!process.env.RESEND_API_KEY,
    ingestSecret: !!process.env.DEALS_INGEST_SECRET,
    cronSecret: !!process.env.CRON_SECRET,
    ig: !!(process.env.META_APP_ID || process.env.IG_APP_ID),
  });
}

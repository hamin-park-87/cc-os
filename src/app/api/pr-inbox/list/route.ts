import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

// PR Inbox 제안 리스트 — 구글시트(Apps Script) 동기화용 JSON. PR_INBOX_SECRET 보호.
// (자금수지 시트의 pr-list와 동일 패턴: 시트가 pull) 예: /api/pr-inbox/list?key=xxx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = { ad_pr: "광고·PR", seeding: "제품시딩", event: "이벤트" };

export async function GET(req: NextRequest) {
  const secret = process.env.PR_INBOX_SECRET;
  const key = req.nextUrl.searchParams.get("key") || "";
  if (!secret || key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("pr_inbox_proposals")
      .select(
        "pr_id, extracted_at, category, proposal_type, brand_name, org_type, contact_email, brand_country, industry, deliverables, budget_mentioned, budget_amount, schedule, ko_summary, score, grade, status, assignee, replied_at"
      )
      .order("extracted_at", { ascending: false })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
  }

  const header = [
    "PR_ID", "수신일시", "카테고리", "제안유형", "브랜드", "구분", "이메일", "국적",
    "업종", "산출물", "예산기재", "예산(¥)", "희망일정", "한국어요약", "점수", "등급", "상태", "담당자", "최종응답일",
  ];
  const body = rows.map((r) => [
    r.pr_id, r.extracted_at, CAT_LABEL[r.category] || r.category, r.proposal_type || "",
    r.brand_name || "", r.org_type || "", r.contact_email || "", r.brand_country || "",
    r.industry || "", r.deliverables || "", r.budget_mentioned ? "Y" : "", r.budget_amount ?? "",
    r.schedule || "", r.ko_summary || "", r.score ?? "", r.grade || "", r.status || "", r.assignee || "", r.replied_at || "",
  ]);

  return NextResponse.json({ updatedAt: new Date().toISOString(), header, rows: body });
}

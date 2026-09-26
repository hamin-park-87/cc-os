import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 외부 PR 안건 리스트 — 경리 스프레드시트(Apps Script) 동기화용 JSON.
// 시크릿 키(PR_LIST_SECRET)로 보호. 예: /api/public/pr-list?key=xxxx
const STEPS = ["인입", "매니저 검토", "크리에이터 협의", "의뢰사 전달", "계약 성사", "제작·업로드", "청구서 발행", "입금 확인", "완료"];
const BASE = "https://cc-os.81degree.com/pr/";

// 투고일 기준 "翌々月末"(익익월 말일) 추정 입금예정일
function estPayDate(uploadDate: string): string {
  const dt = new Date(uploadDate);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 3, 0);
  return last.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const secret = process.env.PR_LIST_SECRET;
  const key = req.nextUrl.searchParams.get("key") || "";
  if (!secret || key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  // 전체 안건(페이지네이션)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deals: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("deals")
      .select("pr_seq, client, title, creator_id, fee, tax, fee_agreed, step, upload_date, invoice_at, paid_on, payment_confirmed, share_token")
      .order("pr_seq", { ascending: true }).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deals = deals.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(deals.map((d) => d.creator_id).filter(Boolean))];
  const { data: crs } = ids.length
    ? await admin.from("creators").select("id, name").in("id", ids)
    : { data: [] };
  const nm: Record<string, string> = Object.fromEntries((crs || []).map((c: { id: string; name: string }) => [c.id, c.name]));

  const header = ["PR번호", "의뢰사 依頼社", "안건 案件", "크리에이터 CC", "금액 金額(¥)", "소비세 消費税(¥)", "합의 合意", "진행단계 ステータス", "청구서발행일 請求書発行日", "입금예정·입금일 入金予定/入金日", "입금확인 入金確認", "대시보드 ダッシュボード"];
  const rows = deals.map((d) => {
    const pr = d.pr_seq ? "PR-" + String(d.pr_seq).padStart(3, "0") : "";
    const est = (!d.paid_on && d.upload_date) ? estPayDate(d.upload_date) + " (예정)" : "";
    return [
      pr,
      d.client || "",
      (d.title || "").slice(0, 60),
      nm[d.creator_id] || "",
      d.fee != null ? Number(d.fee) : "",
      d.tax != null ? Number(d.tax) : "",
      d.fee_agreed ? "합의" : "",
      STEPS[d.step] || "",
      d.invoice_at ? String(d.invoice_at).slice(0, 10) : "",
      d.paid_on || est,
      d.payment_confirmed ? "입금완료" : "",
      BASE + d.share_token,
    ];
  });

  return NextResponse.json({ header, rows, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

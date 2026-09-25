import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import ExcelJS from "exceljs";

export const maxDuration = 60;
export const runtime = "nodejs";

// REQ-017: 외부 PR 안건 목록 xlsx 출력 (관리자 전용)
const STEPS = ["인입", "매니저 검토", "크리에이터 협의", "의뢰사 전달", "계약 성사", "제작·업로드", "청구서 발행", "입금 확인", "CC 입금 완료"];

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const anon = createClient(url, anonKey);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const admin = getAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (caller?.role !== "admin") return NextResponse.json({ error: "관리자 전용" }, { status: 403 });

  const [{ data: deals }, { data: creators }] = await Promise.all([
    admin.from("deals").select("*").order("pr_seq", { ascending: true, nullsFirst: false }),
    admin.from("creators").select("id, name"),
  ]);
  const cName = new Map((creators ?? []).map((c) => [c.id, c.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("외부PR안건");
  ws.columns = [
    { header: "PR번호", key: "no", width: 10 },
    { header: "인입일", key: "recv", width: 12 },
    { header: "납기", key: "due", width: 12 },
    { header: "안건", key: "title", width: 40 },
    { header: "의뢰사", key: "client", width: 22 },
    { header: "크리에이터", key: "creator", width: 14 },
    { header: "담당", key: "mgr", width: 10 },
    { header: "등록자", key: "reg", width: 16 },
    { header: "단계", key: "step", width: 14 },
    { header: "PR비용", key: "fee", width: 12 },
    { header: "소비세", key: "tax", width: 10 },
    { header: "2차활용비", key: "sec", width: 12 },
    { header: "상태", key: "status", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (deals ?? []) as any[]) {
    ws.addRow({
      no: d.pr_seq ? "PR-" + String(d.pr_seq).padStart(3, "0") : "",
      recv: d.received_date || "", due: d.due_date || "", title: d.title || "",
      client: d.client || "", creator: cName.get(d.creator_id) || "", mgr: d.manager || "",
      reg: d.registered_by || "", step: STEPS[d.step] ?? d.step,
      fee: Number(d.fee ?? 0), tax: d.tax != null ? Number(d.tax) : "", sec: d.secondary_fee != null ? Number(d.secondary_fee) : "",
      status: d.step >= 8 ? "완료" : "진행중",
    });
  }
  ["fee", "tax", "sec"].forEach((k) => { ws.getColumn(k).numFmt = "#,##0"; });

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PR안건_${today}.xlsx"`,
    },
  });
}

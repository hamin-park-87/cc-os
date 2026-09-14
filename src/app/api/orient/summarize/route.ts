import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import ExcelJS from "exceljs";

export const maxDuration = 60;
export const runtime = "nodejs";

const MODEL = process.env.ORIENT_AI_MODEL || "claude-haiku-4-5-20251001";

// 오리엔시트(브리프) 파일을 AI가 읽어 구조화 요약(KO/JA) 후 저장.
// 인증: 관리자 세션 Bearer. 입력: { id }
export async function POST(req: NextRequest) {
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  const { data: row } = await admin.from("orient_sheets").select("id,title,description,file_url,file_name,brands(name)").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "오리엔시트를 찾을 수 없음" }, { status: 404 });

  await admin.from("orient_sheets").update({ ai_status: "processing" }).eq("id", id);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandName = (row as any).brands?.name ?? "";
    const fileName: string = row.file_name || "";
    const ext = fileName.toLowerCase().split(".").pop() || "";
    const context = `브랜드: ${brandName}\n제목: ${row.title}\n관리자 메모: ${row.description || "(없음)"}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userContent: any;
    if (["xlsx", "xls", "csv"].includes(ext)) {
      const text = await extractSpreadsheet(row.file_url, ext);
      if (!text.trim()) throw new Error("스프레드시트에서 텍스트를 추출하지 못함");
      userContent = `${PROMPT}\n\n[문맥]\n${context}\n\n[오리엔시트 내용(표)]\n${text.slice(0, 14000)}`;
    } else if (ext === "pdf") {
      const b64 = await fetchBase64(row.file_url);
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
        { type: "text", text: `${PROMPT}\n\n[문맥]\n${context}` },
      ];
    } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      const media = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
      const b64 = await fetchBase64(row.file_url);
      userContent = [
        { type: "image", source: { type: "base64", media_type: media, data: b64 } },
        { type: "text", text: `${PROMPT}\n\n[문맥]\n${context}` },
      ];
    } else {
      // 지원 안 되는 형식(docx/pptx 등) → 메모만으로 정리 시도, 없으면 unsupported
      if (!row.description) {
        await admin.from("orient_sheets").update({ ai_status: "unsupported", ai_at: new Date().toISOString() }).eq("id", id);
        return NextResponse.json({ ok: false, unsupported: true, reason: `미지원 형식(.${ext})` });
      }
      userContent = `${PROMPT}\n\n[문맥]\n${context}\n\n(파일 본문 추출 불가 형식이므로 관리자 메모 기준으로 정리)`;
    }

    const parsed = await callClaude(key, userContent);
    if (!parsed) throw new Error("AI 응답 파싱 실패");

    const aiData = {
      brand: parsed.brand ?? brandName, product: parsed.product,
      keyPoints: arr(parsed.keyPoints), keyPointsJa: arr(parsed.keyPointsJa),
      mustInclude: arr(parsed.mustInclude), mustIncludeJa: arr(parsed.mustIncludeJa),
      tone: parsed.tone, toneJa: parsed.toneJa,
      hashtags: arr(parsed.hashtags), mentions: arr(parsed.mentions),
      deadline: parsed.deadline, dont: arr(parsed.dont), dontJa: arr(parsed.dontJa),
    };
    await admin.from("orient_sheets").update({
      ai_summary: str(parsed.summaryKo), ai_summary_ja: str(parsed.summaryJa),
      ai_data: aiData, ai_status: "done", ai_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    await admin.from("orient_sheets").update({ ai_status: "failed", ai_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const PROMPT = `당신은 인플루언서 PR 대행사의 어시스턴트입니다. 아래 브랜드 오리엔시트(브리프)를 읽고, 크리에이터가 한눈에 이해할 수 있도록 핵심을 구조화하세요.
크리에이터는 대부분 일본인이므로 한국어(내부용)와 일본어(크리에이터용)를 모두 작성하세요.
JSON만 출력하세요(그 외 텍스트 금지). 값이 없으면 빈 배열/빈 문자열.
{
 "summaryKo": "2~4문장 핵심 요약(한국어)",
 "summaryJa": "同じ内容の要約(日本語)",
 "brand": "브랜드/제품명",
 "product": "구체 제품(있으면)",
 "keyPoints": ["핵심 요청/기획 의도(한국어) 3~6개"],
 "keyPointsJa": ["同(日本語)"],
 "mustInclude": ["필수 포함요소(한국어): 소구점, 장면, 문구 등"],
 "mustIncludeJa": ["同(日本語)"],
 "tone": "톤&매너(한국어)",
 "toneJa": "トーン(日本語)",
 "hashtags": ["#해시태그"],
 "mentions": ["@멘션계정"],
 "deadline": "납기/투고일정(원문 그대로)",
 "dont": ["금지사항/주의(한국어)"],
 "dontJa": ["同(日本語)"]
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (v: any): string[] => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 12) : [];
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, 4000);

async function fetchBase64(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("파일 다운로드 실패");
  const ab = await res.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

async function extractSpreadsheet(fileUrl: string, ext: string): Promise<string> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error("파일 다운로드 실패");
  const ab = await res.arrayBuffer();
  if (ext === "csv") return Buffer.from(ab).toString("utf8");
  const wb = new ExcelJS.Workbook();
  // exceljs 타입은 Node Buffer를 요구 — 런타임은 동일, 타입만 캐스팅
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(ab) as any);
  const parts: string[] = [];
  wb.eachSheet((ws) => {
    parts.push(`# 시트: ${ws.name}`);
    ws.eachRow((r) => {
      // values는 1-indexed 배열
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vals = (r.values as any[]).slice(1).map(cellText);
      if (vals.some((v) => v)) parts.push(vals.join("\t"));
    });
  });
  return parts.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t: { text: string }) => t.text).join("");
    if (v.hyperlink) return String(v.hyperlink);
    return "";
  }
  return String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaude(key: string, content: any): Promise<Record<string, any> | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2048,
      messages: [{ role: "user", content }],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || "Claude 요청 실패");
  const text = j?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";

type Comment = { id: string; role: string; author: string | null; kind: string; body: string | null; url: string | null; createdAt: string };
type Deal = {
  prNo: string | null; title: string; client: string; manager: string | null; step: number; brief: string | null;
  fee: number | null; tax: number | null;
  dueDate: string | null; uploadDate: string | null; receivedDate: string | null;
  sched: Record<string, string>;
  creator: { name: string; nameEn: string | null; handle: string | null; photoUrl: string | null } | null;
  content: { permalink: string | null; thumbnailUrl: string | null; publishedAt: string | null; metrics: Record<string, number> | null } | null;
  comments: Comment[];
  stepDates: Record<string, string>;
};

const STEPS: [string, string][] = [
  ["인입", "受付"], ["매니저 검토", "マネージャー確認"], ["크리에이터 협의", "クリエイター協議"], ["의뢰사 전달", "先方共有"],
  ["계약 성사", "契約成立"], ["제작·업로드", "制作・投稿"], ["청구서 발행", "請求書発行"], ["입금 확인", "入金確認"], ["완료", "完了"],
];
const STAGES: [string, string, string][] = [["plan", "기획", "企画"], ["shoot", "촬영", "撮影"], ["edit", "편집", "編集"], ["upload", "업로드", "投稿"]];
const DICT = {
  ko: { subtitle: "PR 안건 진행 대시보드", client: "의뢰사", creator: "크리에이터", manager: "담당 매니저", progress: "진행 단계", schedule: "제작 일정", brief: "의뢰 내용", amount: "의뢰 금액", amountNote: "※ 최종 협의 후 확정", tax: "소비세", result: "결과물", draft: "1차 완성본", viewVideo: "영상 보기", viewDraft: "초안 보기", views: "조회수", likes: "좋아요", notyet: "아직 등록되지 않았어요", loading: "불러오는 중…", notfound: "안건을 찾을 수 없어요. 링크를 다시 확인해주세요.", uploaded: "업로드 완료", pending: "예정", thread: "수정요청 · 피드백", empty: "아직 등록된 내용이 없어요.", name: "이름", role: "역할", kind: "유형", note: "댓글", request: "수정요청", link: "링크(초안 등)", msg: "내용", send: "등록", sending: "등록 중…", sent: "등록되었어요!" },
  ja: { subtitle: "PR案件 進行ダッシュボード", client: "依頼社", creator: "クリエイター", manager: "担当マネージャー", progress: "進行ステータス", schedule: "制作スケジュール", brief: "依頼内容", amount: "依頼金額", amountNote: "※ 最終協議後に確定", tax: "消費税", result: "成果物", draft: "初稿", viewVideo: "動画を見る", viewDraft: "初稿を見る", views: "再生数", likes: "いいね", notyet: "まだ登録されていません", loading: "読み込み中…", notfound: "案件が見つかりません。リンクをご確認ください。", uploaded: "投稿完了", pending: "予定", thread: "修正依頼 · フィードバック", empty: "まだ投稿がありません。", name: "お名前", role: "区分", kind: "種別", note: "コメント", request: "修正依頼", link: "リンク(初稿など)", msg: "内容", send: "登録", sending: "登録中…", sent: "登録しました！" },
};
const ROLE_OPT: [string, string, string][] = [["client", "의뢰사", "依頼社"], ["manager", "매니저", "マネージャー"], ["creator", "CC", "CC"]];
const yen = (n?: number | null) => n == null ? null : "¥" + n.toLocaleString();
const fmtN = (n?: number) => n == null ? "—" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
const ymd = (d?: string | null) => d ? d.slice(0, 10).replace(/-/g, ".") : "—";
// 안건별 permalink 정규화(공유토큰 제거)
const canon = (u?: string | null) => { if (!u) return u ?? ""; const m = u.match(/instagram\.com\/(?:share\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i); return m ? `https://www.instagram.com/${m[1].toLowerCase().startsWith("reel") ? "reel" : m[1].toLowerCase()}/${m[2]}/` : u; };

export default function PublicDealPage() {
  const params = useParams();
  const token = String(params?.token ?? "");
  const [lang, setLang] = useState<"ko" | "ja">("ja");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [form, setForm] = useState({ role: "client", kind: "note", author: "", body: "", url: "" });
  const [sending, setSending] = useState(false); const [sentOk, setSentOk] = useState(false);
  async function load() {
    try {
      const res = await fetch(`/api/public/deal?token=${encodeURIComponent(token)}`);
      if (!res.ok) { setState("notfound"); return; }
      setDeal(await res.json()); setState("ok");
    } catch { setState("notfound"); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  async function submit() {
    if (!form.author.trim() || (!form.body.trim() && !form.url.trim())) return;
    setSending(true);
    try {
      const res = await fetch("/api/public/deal/comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...form }) });
      if (res.ok) { setForm((f) => ({ ...f, body: "", url: "" })); setSentOk(true); setTimeout(() => setSentOk(false), 2000); await load(); }
    } catch { /* noop */ }
    setSending(false);
  }
  const t = DICT[lang];
  const name = (c: NonNullable<Deal["creator"]>) => lang === "ja" ? (c.name) : (c.name);
  const today = new Date().toISOString().slice(0, 10);
  // 딜레이: 예정일이 지났는데 아직 업로드(단계<제작·업로드 완료=5) 전인 스테이지
  const delays = deal && deal.step < 5 ? STAGES.filter(([k]) => { const d = deal.sched?.[k]; return d && d.slice(0, 10) < today; }).map(([, ko, ja]) => (lang === "ja" ? ja : ko)) : [];
  const drafts = (deal?.comments ?? []).filter((c) => c.kind === "draft");
  const thread = (deal?.comments ?? []).filter((c) => c.kind !== "draft");
  const selSt: CSSProperties = { fontFamily: "inherit", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #2a322e", background: "#121715", color: "#e8ece9" };

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0f0e", color: "#e8ece9", fontFamily: "system-ui, -apple-system, 'Noto Sans JP', 'Noto Sans KR', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <header style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.01em" }}>81<span style={{ color: "#3fb984" }}>&apos;</span>DEGREE</div>
            <div style={{ fontSize: 12, color: "#8a938d", marginTop: 2 }}>{t.subtitle}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {(["ja", "ko"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} style={{ cursor: "pointer", border: 0, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, background: lang === l ? "#3fb984" : "#1a201e", color: lang === l ? "#04120c" : "#8a938d" }}>{l === "ja" ? "日本語" : "한국어"}</button>
            ))}
          </div>
        </header>

        {state === "loading" && <div style={{ color: "#8a938d", padding: 40, textAlign: "center" }}>{t.loading}</div>}
        {state === "notfound" && <div style={{ color: "#8a938d", padding: 40, textAlign: "center" }}>{t.notfound}</div>}

        {state === "ok" && deal && (<>
          {/* 헤더 카드 */}
          <div style={{ background: "#121715", border: "1px solid #212824", borderRadius: 16, padding: 22, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {deal.prNo && <span style={{ fontSize: 12, fontWeight: 800, color: "#3fb984", background: "rgba(63,185,132,.12)", padding: "3px 9px", borderRadius: 7 }}>{deal.prNo}</span>}
              <span style={{ fontSize: 12, color: "#8a938d" }}>{t.client}: {deal.client}</span>
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35, margin: 0 }}>{deal.title}</h1>
            {deal.fee != null && deal.fee > 0 && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#8a938d" }}>{t.amount}</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{yen(deal.fee)}</span>
                {deal.tax != null && deal.tax > 0 && <span style={{ fontSize: 12, color: "#8a938d" }}>({t.tax} {yen(deal.tax)})</span>}
                <span style={{ fontSize: 11, color: "#6b746e" }}>{t.amountNote}</span>
              </div>
            )}
          </div>

          {/* 딜레이 안내 */}
          {delays.length > 0 && (
            <div style={{ marginTop: 14, background: "rgba(224,120,90,.12)", border: "1px solid rgba(224,120,90,.4)", color: "#f0a58a", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>
              ⚠️ {lang === "ja" ? `予定日を過ぎた工程があります: ${delays.join(", ")}` : `예정일이 지난 단계가 있어요: ${delays.join(", ")}`}
            </div>
          )}

          {/* 진행 단계 */}
          <Section title={t.progress}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STEPS.map(([ko, ja], i) => {
                const done = i < deal.step, now = i === deal.step;
                const dt = deal.stepDates?.[String(i)];
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 20, fontSize: 12.5, fontWeight: now ? 800 : 600,
                      background: now ? "#3fb984" : done ? "rgba(63,185,132,.12)" : "#161b19", color: now ? "#04120c" : done ? "#3fb984" : "#6b746e", border: `1px solid ${now ? "#3fb984" : done ? "rgba(63,185,132,.3)" : "#212824"}` }}>
                      <span>{done ? "✓" : i + 1}</span>{lang === "ja" ? ja : ko}
                    </div>
                    {dt && <span style={{ fontSize: 10, color: "#6b746e", paddingLeft: 4 }}>{dt.replace(/-/g, ".")}</span>}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 크리에이터 */}
          {deal.creator && (
            <Section title={t.creator}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 46, height: 46, borderRadius: 23, overflow: "hidden", background: "#1a201e", flex: "none" }}>
                  {deal.creator.photoUrl && <img src={deal.creator.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{name(deal.creator)}</div>
                  {deal.creator.handle && <a href={`https://instagram.com/${deal.creator.handle.replace(/^@/, "")}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "#3fb984", textDecoration: "none" }}>{deal.creator.handle}</a>}
                </div>
              </div>
            </Section>
          )}

          {/* 제작 일정 */}
          <Section title={t.schedule}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {STAGES.map(([k, ko, ja]) => (
                <div key={k} style={{ background: "#161b19", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid #212824" }}>
                  <div style={{ fontSize: 11, color: "#8a938d", marginBottom: 4 }}>{lang === "ja" ? ja : ko}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: deal.sched?.[k] ? "#e8ece9" : "#4d554f" }}>{ymd(deal.sched?.[k]) }</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 결과물 */}
          <Section title={t.result}>
            {drafts.length > 0 && (
              <div style={{ marginBottom: deal.content?.permalink ? 14 : 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {drafts.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#161b19", border: "1px solid #212824", borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#c9a13a", flex: "none" }}>📝 {t.draft}</span>
                    <span style={{ fontSize: 12, color: "#8a938d", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.body || d.url}</span>
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#04120c", background: "#c9a13a", padding: "6px 12px", borderRadius: 8, textDecoration: "none", flex: "none" }}>▶ {t.viewDraft}</a>}
                  </div>
                ))}
              </div>
            )}
            {deal.content?.permalink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {deal.content.thumbnailUrl && <img src={deal.content.thumbnailUrl} alt="" style={{ width: 64, height: 84, objectFit: "cover", borderRadius: 8, background: "#000" }} />}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#3fb984" }}>● {t.uploaded}</span>
                    <div style={{ fontSize: 12, color: "#8a938d", marginTop: 2 }}>{ymd(deal.content.publishedAt)}</div>
                    <a href={canon(deal.content.permalink)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#04120c", background: "#3fb984", padding: "7px 14px", borderRadius: 9, textDecoration: "none" }}>▶ {t.viewVideo}</a>
                  </div>
                </div>
                {deal.content.metrics && (
                  <div style={{ display: "flex", gap: 18, fontSize: 13 }}>
                    <span>👁 <b>{fmtN(deal.content.metrics.views)}</b> <span style={{ color: "#8a938d", fontSize: 11 }}>{t.views}</span></span>
                    <span>♡ <b>{fmtN(deal.content.metrics.likes)}</b> <span style={{ color: "#8a938d", fontSize: 11 }}>{t.likes}</span></span>
                  </div>
                )}
              </div>
            ) : (drafts.length ? null : <div style={{ color: "#6b746e", fontSize: 13 }}>{t.notyet}</div>)}
          </Section>

          {/* 의뢰 내용 */}
          {deal.brief && <Section title={t.brief}><div style={{ fontSize: 13, lineHeight: 1.7, color: "#c7ccc8", whiteSpace: "pre-wrap" }}>{deal.brief}</div></Section>}

          {/* 수정요청 · 피드백 (협업 스레드) */}
          <Section title={t.thread}>
            {thread.length === 0 ? <div style={{ color: "#6b746e", fontSize: 13, marginBottom: 14 }}>{t.empty}</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {thread.map((c) => {
                  const isReq = c.kind === "request";
                  return (
                    <div key={c.id} style={{ background: "#161b19", border: `1px solid ${isReq ? "rgba(224,120,90,.35)" : "#212824"}`, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 11.5 }}>
                        <span style={{ fontWeight: 800, color: isReq ? "#f0a58a" : "#3fb984" }}>{isReq ? t.request : (c.role === "client" ? t.client : c.role === "manager" ? t.manager : t.creator)}</span>
                        <span style={{ color: "#c7ccc8", fontWeight: 600 }}>{c.author}</span>
                        <span style={{ color: "#6b746e", marginLeft: "auto" }}>{(c.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                      {c.body && <div style={{ fontSize: 13, lineHeight: 1.6, color: "#e8ece9", whiteSpace: "pre-wrap" }}>{c.body}</div>}
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3fb984", wordBreak: "break-all" }}>{c.url}</a>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 작성 폼 — 누구나(의뢰사·CC·매니저) */}
            <div style={{ background: "#0f1412", border: "1px solid #212824", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={selSt}>{ROLE_OPT.map(([v, ko, ja]) => <option key={v} value={v}>{lang === "ja" ? ja : ko}</option>)}</select>
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} style={selSt}>
                  <option value="note">{t.note}</option><option value="request">{t.request}</option><option value="draft">{t.draft}</option>
                </select>
                <input placeholder={t.name} value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} style={{ ...selSt, flex: 1, minWidth: 120 }} />
              </div>
              <textarea placeholder={t.msg} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} style={{ ...selSt, minHeight: 70, resize: "vertical" }} />
              {(form.kind === "draft") && <input placeholder={t.link} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} style={selSt} />}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {sentOk && <span style={{ color: "#3fb984", fontSize: 12.5 }}>✓ {t.sent}</span>}
                <button onClick={submit} disabled={sending || !form.author.trim() || (!form.body.trim() && !form.url.trim())} style={{ marginLeft: "auto", cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 800, background: "#3fb984", color: "#04120c", opacity: sending ? .6 : 1 }}>{sending ? t.sending : t.send}</button>
              </div>
            </div>
          </Section>

          {deal.manager && <div style={{ marginTop: 20, fontSize: 12.5, color: "#8a938d", textAlign: "center" }}>{t.manager}: {deal.manager} · 81degree.inc</div>}
        </>)}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#121715", border: "1px solid #212824", borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#8a938d", marginBottom: 12, letterSpacing: ".02em" }}>{title}</div>
      {children}
    </div>
  );
}

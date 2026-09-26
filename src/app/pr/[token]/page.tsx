"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";

type Comment = { id: string; parentId: string | null; role: string; author: string | null; kind: string; body: string | null; url: string | null; createdAt: string };
type SchedItem = { date?: string; itemKo?: string; itemJa?: string };
type BriefSummary = {
  summaryKo?: string; summaryJa?: string; client?: string; product?: string; status?: string;
  deliverables?: string[]; deliverablesJa?: string[]; secondary?: string; secondaryJa?: string;
  fee?: string; schedule?: SchedItem[]; notes?: string[]; notesJa?: string[];
};
type FeeProposal = { id: string; by: string; author: string | null; amount: number; note: string | null; status: string; createdAt: string };
type Deal = {
  prNo: string | null; title: string; client: string; manager: string | null; step: number; brief: string | null;
  briefRaw: string | null; briefSummary: BriefSummary | null; briefAiStatus: string | null;
  fee: number | null; tax: number | null; feeAgreed: boolean; feeProposals: FeeProposal[];
  invoice: { url: string; name: string | null; at: string | null } | null;
  payment: { paidOn: string | null; url: string | null; name: string | null } | null;
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
  ko: { subtitle: "PR 안건 진행 대시보드", client: "의뢰사", creator: "크리에이터", manager: "담당 매니저", progress: "진행 단계", schedule: "제작 일정", brief: "의뢰 내용", amount: "의뢰 금액", amountNote: "※ 최종 협의 후 확정", tax: "소비세", result: "결과물", draft: "1차 완성본", viewVideo: "영상 보기", viewDraft: "초안 보기", views: "조회수", likes: "좋아요", notyet: "아직 등록되지 않았어요", loading: "불러오는 중…", notfound: "안건을 찾을 수 없어요. 링크를 다시 확인해주세요.", uploaded: "업로드 완료", pending: "예정", thread: "수정요청 · 피드백", empty: "아직 등록된 내용이 없어요.", name: "이름", role: "역할", kind: "유형", note: "댓글", request: "수정요청", link: "링크(초안 등)", msg: "내용", send: "등록", sending: "등록 중…", sent: "등록되었어요!", edit: "수정", del: "삭제", save: "저장", cancel: "취소", reply: "답글", briefAi: "AI 요약", briefRaw: "의뢰 원문", briefStatus: "상태", briefProduct: "상품", deliverables: "요청 산출물", secondary: "2차 이용", feeCond: "개런티/조건", notes: "주의사항", scheduleP: "진행 일정", pasteBrief: "의뢰 원문 붙여넣기", briefPh: "의뢰사에서 받은 안건 내용을 그대로 붙여넣으면 AI가 핵심을 정리해요.", analyze: "AI로 정리", reanalyze: "수정 후 다시 정리", editRaw: "원문 수정", analyzing: "AI가 정리 중…", showRaw: "원문 보기", hideRaw: "원문 접기", updateNote: "다시 붙여넣고 정리하면 기존 원문·AI 요약을 새 내용으로 교체해요.", aiFailed: "AI 정리에 실패했어요. 원문은 저장됐어요.", feeNego: "비용 협의", feePropose: "희망 비용 제안", feeAmount: "희망 금액(¥)", feeNote: "메모(선택)", feeSend: "제안하기", feeAgree: "이 금액으로 합의", feeAgreed: "합의 완료", feeAgreedAmt: "합의 금액", feeNone: "아직 제안된 금액이 없어요.", feeProposed: "제안", feeByCreator: "CC 제안", feeByClient: "의뢰사 제안", feeByManager: "매니저 제안", feeWho: "제안자", billing: "청구 · 입금", invoice: "청구서", invoiceUpload: "청구서 업로드(81degree)", noInvoice: "아직 청구서가 등록되지 않았어요.", open: "열기", paidDate: "입금일", remittance: "송금확인증", paymentTitle: "입금 확인(의뢰사)", paymentReport: "입금 등록", uploading: "업로드 중…", chooseFile: "파일 선택", paidOnLabel: "입금일" },
  ja: { subtitle: "PR案件 進行ダッシュボード", client: "依頼社", creator: "クリエイター", manager: "担当マネージャー", progress: "進行ステータス", schedule: "制作スケジュール", brief: "依頼内容", amount: "依頼金額", amountNote: "※ 最終協議後に確定", tax: "消費税", result: "成果物", draft: "初稿", viewVideo: "動画を見る", viewDraft: "初稿を見る", views: "再生数", likes: "いいね", notyet: "まだ登録されていません", loading: "読み込み中…", notfound: "案件が見つかりません。リンクをご確認ください。", uploaded: "投稿完了", pending: "予定", thread: "修正依頼 · フィードバック", empty: "まだ投稿がありません。", name: "お名前", role: "区分", kind: "種別", note: "コメント", request: "修正依頼", link: "リンク(初稿など)", msg: "内容", send: "登録", sending: "登録中…", sent: "登録しました！", edit: "編集", del: "削除", save: "保存", cancel: "キャンセル", reply: "返信", briefAi: "AI要約", briefRaw: "依頼原文", briefStatus: "ステータス", briefProduct: "商材", deliverables: "ご依頼事項", secondary: "二次利用", feeCond: "ギャランティ/条件", notes: "注意事項", scheduleP: "進行スケジュール", pasteBrief: "依頼原文を貼り付け", briefPh: "依頼社から届いた案件内容をそのまま貼り付けると、AIが要点を整理します。", analyze: "AIで整理", reanalyze: "修正して再整理", editRaw: "原文を修正", analyzing: "AIが整理中…", showRaw: "原文を見る", hideRaw: "原文を閉じる", updateNote: "貼り直して整理すると、既存の原文・AI要約が新しい内容に置き換わります。", aiFailed: "AI整理に失敗しました。原文は保存されています。", feeNego: "費用のご相談", feePropose: "希望費用の提案", feeAmount: "希望金額(¥)", feeNote: "メモ(任意)", feeSend: "提案する", feeAgree: "この金額で合意", feeAgreed: "合意済み", feeAgreedAmt: "合意金額", feeNone: "まだ提案された金額はありません。", feeProposed: "提案", feeByCreator: "CC提案", feeByClient: "依頼社提案", feeByManager: "マネージャー提案", feeWho: "提案者", billing: "請求 · 入金", invoice: "請求書", invoiceUpload: "請求書アップロード(81degree)", noInvoice: "まだ請求書が登録されていません。", open: "開く", paidDate: "入金日", remittance: "送金確認書", paymentTitle: "入金確認(依頼社)", paymentReport: "入金を登録", uploading: "アップロード中…", chooseFile: "ファイル選択", paidOnLabel: "入金日" },
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
  const EK = "cc-os.pr.editkeys";
  const readKeys = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(EK) || "{}"); } catch { return {}; } };
  const saveKey = (id: string, key: string) => { try { const m = readKeys(); m[id] = key; localStorage.setItem(EK, JSON.stringify(m)); } catch { /* noop */ } };
  const [myKeys, setMyKeys] = useState<Record<string, string>>({});
  useEffect(() => { setMyKeys(readKeys()); }, [deal]);
  const [editingId, setEditingId] = useState(""); const [editBody, setEditBody] = useState(""); const [editUrl, setEditUrl] = useState("");
  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/public/deal/comment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...payload }) });
    if (res.ok) { const j = await res.json().catch(() => ({})); if (j.comment?.id && j.editKey) saveKey(j.comment.id, j.editKey); await load(); setMyKeys(readKeys()); return true; }
    return false;
  }
  async function submit() {
    if (!form.author.trim() || (!form.body.trim() && !form.url.trim())) return;
    setSending(true);
    if (await post(form)) { setForm((f) => ({ ...f, body: "", url: "" })); setSentOk(true); setTimeout(() => setSentOk(false), 2000); }
    setSending(false);
  }
  const [replyTo, setReplyTo] = useState(""); const [reply, setReply] = useState({ role: "manager", author: "", body: "" });
  async function submitReply(parentId: string) {
    if (!reply.author.trim() || !reply.body.trim()) return;
    if (await post({ ...reply, kind: "note", parentId })) { setReply({ role: "manager", author: "", body: "" }); setReplyTo(""); }
  }
  const [feeForm, setFeeForm] = useState({ by: "creator", author: "", amount: "", note: "" }); const [feeBusy, setFeeBusy] = useState(false);
  async function proposeFee() {
    const amount = Number(feeForm.amount);
    if (!(amount > 0) || feeBusy) return;
    setFeeBusy(true);
    try {
      const res = await fetch("/api/public/deal/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "propose", by: feeForm.by, author: feeForm.author, amount, note: feeForm.note }) });
      if (res.ok) { setFeeForm((f) => ({ ...f, amount: "", note: "" })); await load(); }
    } catch { /* noop */ }
    setFeeBusy(false);
  }
  async function agreeFee(proposalId: string, author: string) {
    if (feeBusy) return;
    setFeeBusy(true);
    try {
      const res = await fetch("/api/public/deal/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "agree", proposalId, author }) });
      if (res.ok) await load();
    } catch { /* noop */ }
    setFeeBusy(false);
  }
  const [billBusy, setBillBusy] = useState(""); const [payAuthor, setPayAuthor] = useState(""); const [paidOn, setPaidOn] = useState("");
  async function uploadBilling(kind: "invoice" | "payment", file: File | null) {
    if (billBusy) return;
    const fd = new FormData();
    fd.append("token", token); fd.append("kind", kind);
    if (file) fd.append("file", file);
    if (kind === "payment") { fd.append("author", payAuthor); if (paidOn) fd.append("paidOn", paidOn); }
    else { fd.append("author", ""); }
    setBillBusy(kind);
    try {
      const res = await fetch("/api/public/deal/billing", { method: "POST", body: fd });
      if (res.ok) { if (kind === "payment") setPaidOn(""); await load(); }
      else { const j = await res.json().catch(() => ({})); if (j.error) alert(j.error); }
    } catch { /* noop */ }
    setBillBusy("");
  }
  const [briefText, setBriefText] = useState(""); const [briefBusy, setBriefBusy] = useState(false); const [showRaw, setShowRaw] = useState(false);
  async function submitBrief() {
    if (briefText.trim().length < 10 || briefBusy) return;
    setBriefBusy(true);
    try {
      const res = await fetch("/api/public/deal/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, raw: briefText.trim() }) });
      if (res.ok) { setBriefText(""); await load(); }
    } catch { /* noop */ }
    setBriefBusy(false);
  }
  async function saveEdit(c: Comment) {
    const editKey = readKeys()[c.id]; if (!editKey) return;
    const res = await fetch("/api/public/deal/comment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, id: c.id, editKey, body: editBody, url: editUrl }) });
    if (res.ok) { setEditingId(""); await load(); }
  }
  async function removeComment(c: Comment) {
    const editKey = readKeys()[c.id]; if (!editKey) return;
    if (!confirm(lang === "ja" ? "削除しますか？" : "삭제할까요?")) return;
    const res = await fetch("/api/public/deal/comment", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, id: c.id, editKey }) });
    if (res.ok) await load();
  }
  const t = DICT[lang];
  const name = (c: NonNullable<Deal["creator"]>) => lang === "ja" ? (c.name) : (c.name);
  const today = new Date().toISOString().slice(0, 10);
  // 딜레이: 예정일이 지났는데 아직 업로드(단계<제작·업로드 완료=5) 전인 스테이지
  const delays = deal && deal.step < 5 ? STAGES.filter(([k]) => { const d = deal.sched?.[k]; return d && d.slice(0, 10) < today; }).map(([, ko, ja]) => (lang === "ja" ? ja : ko)) : [];
  const drafts = (deal?.comments ?? []).filter((c) => c.kind === "draft");
  const thread = (deal?.comments ?? []).filter((c) => c.kind !== "draft");
  const sum = deal?.briefSummary ?? null;
  const sumText = sum ? ((lang === "ja" ? sum.summaryJa : sum.summaryKo) || sum.summaryKo || sum.summaryJa || "") : "";
  const secText = sum ? ((lang === "ja" ? sum.secondaryJa : sum.secondary) || sum.secondary || sum.secondaryJa || "") : "";
  const delivList = sum ? ((lang === "ja" ? sum.deliverablesJa : sum.deliverables) || sum.deliverables || []) : [];
  const notesList = sum ? ((lang === "ja" ? sum.notesJa : sum.notes) || sum.notes || []) : [];
  const lastFee = (deal?.feeProposals ?? []).filter((p) => p.status === "agreed").slice(-1)[0] ?? null;
  const selSt: CSSProperties = { fontFamily: "inherit", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid #2a322e", background: "#121715", color: "#e8ece9" };
  const roots = thread.filter((c) => !c.parentId);
  const childrenOf = (id: string) => thread.filter((c) => c.parentId === id);
  const roleLabel = (c: Comment) => c.kind === "request" ? t.request : (c.role === "client" ? t.client : c.role === "manager" ? t.manager : t.creator);
  const renderNode = (c: Comment, depth: number): React.ReactNode => {
    const isReq = c.kind === "request";
    const kids = childrenOf(c.id);
    return (
      <div key={c.id} style={{ marginLeft: depth ? 14 : 0, borderLeft: depth ? "2px solid #212824" : undefined, paddingLeft: depth ? 12 : 0 }}>
        <div style={{ background: "#161b19", border: `1px solid ${isReq ? "rgba(224,120,90,.35)" : "#212824"}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 11.5 }}>
            <span style={{ fontWeight: 800, color: isReq ? "#f0a58a" : "#3fb984" }}>{roleLabel(c)}</span>
            <span style={{ color: "#c7ccc8", fontWeight: 600 }}>{c.author}</span>
            <span style={{ color: "#6b746e", marginLeft: "auto" }}>{(c.createdAt || "").slice(0, 16).replace("T", " ")}</span>
          </div>
          {editingId === c.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ ...selSt, minHeight: 60 }} />
              {c.kind === "draft" && <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder={t.link} style={selSt} />}
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setEditingId("")} style={{ cursor: "pointer", border: "1px solid #2a322e", background: "transparent", color: "#8a938d", borderRadius: 7, padding: "5px 12px", fontSize: 12 }}>{t.cancel}</button>
                <button onClick={() => saveEdit(c)} style={{ cursor: "pointer", border: 0, background: "#3fb984", color: "#04120c", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 700 }}>{t.save}</button>
              </div>
            </div>
          ) : (<>
            {c.body && <div style={{ fontSize: 13, lineHeight: 1.6, color: "#e8ece9", whiteSpace: "pre-wrap" }}>{c.body}</div>}
            {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3fb984", wordBreak: "break-all" }}>{c.url}</a>}
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={() => { setReplyTo(replyTo === c.id ? "" : c.id); setReply({ role: "manager", author: "", body: "" }); }} style={{ cursor: "pointer", border: 0, background: "none", color: "#6b746e", fontSize: 11.5, padding: 0 }}>{t.reply}</button>
              {myKeys[c.id] && <>
                <button onClick={() => { setEditingId(c.id); setEditBody(c.body || ""); setEditUrl(c.url || ""); }} style={{ cursor: "pointer", border: 0, background: "none", color: "#6b746e", fontSize: 11.5, padding: 0 }}>{t.edit}</button>
                <button onClick={() => removeComment(c)} style={{ cursor: "pointer", border: 0, background: "none", color: "#e0785a", fontSize: 11.5, padding: 0 }}>{t.del}</button>
              </>}
            </div>
          </>)}
        </div>
        {replyTo === c.id && (
          <div style={{ marginLeft: 14, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={reply.role} onChange={(e) => setReply((r) => ({ ...r, role: e.target.value }))} style={selSt}>{ROLE_OPT.map(([v, ko, ja]) => <option key={v} value={v}>{lang === "ja" ? ja : ko}</option>)}</select>
              <input placeholder={t.name} value={reply.author} onChange={(e) => setReply((r) => ({ ...r, author: e.target.value }))} style={{ ...selSt, flex: 1, minWidth: 120 }} />
            </div>
            <textarea placeholder={t.msg} value={reply.body} onChange={(e) => setReply((r) => ({ ...r, body: e.target.value }))} style={{ ...selSt, minHeight: 56, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setReplyTo("")} style={{ cursor: "pointer", border: "1px solid #2a322e", background: "transparent", color: "#8a938d", borderRadius: 7, padding: "5px 12px", fontSize: 12 }}>{t.cancel}</button>
              <button onClick={() => submitReply(c.id)} disabled={!reply.author.trim() || !reply.body.trim()} style={{ cursor: "pointer", border: 0, background: "#3fb984", color: "#04120c", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 700, opacity: (!reply.author.trim() || !reply.body.trim()) ? .6 : 1 }}>{t.send}</button>
            </div>
          </div>
        )}
        {kids.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>{kids.map((k) => renderNode(k, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0f0e", color: "#e8ece9", fontFamily: "system-ui, -apple-system, 'Noto Sans JP', 'Noto Sans KR', sans-serif" }}>
      <style>{`.pr-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.pr-two>*{margin-bottom:0}@media(max-width:560px){.pr-two{grid-template-columns:1fr}}`}</style>
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
                {deal.feeAgreed
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: "#04120c", background: "#3fb984", borderRadius: 6, padding: "2px 8px" }}>✓ {t.feeAgreed}</span>
                  : <span style={{ fontSize: 11, color: "#6b746e" }}>{t.amountNote}</span>}
              </div>
            )}
          </div>

          {/* 딜레이 안내 */}
          {delays.length > 0 && (
            <div style={{ marginTop: 14, background: "rgba(224,120,90,.12)", border: "1px solid rgba(224,120,90,.4)", color: "#f0a58a", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600 }}>
              ⚠️ {lang === "ja" ? `予定日を過ぎた工程があります: ${delays.join(", ")}` : `예정일이 지난 단계가 있어요: ${delays.join(", ")}`}
            </div>
          )}

          {/* 카테고리 네비 — 클릭 시 해당 섹션으로 스크롤 */}
          <nav style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 6, overflowX: "auto", padding: "10px 0", marginBottom: 4, background: "#0b0f0e", WebkitOverflowScrolling: "touch" }}>
            {([["sec-brief", t.brief], ["sec-progress", t.progress], ...(deal.creator ? [["sec-creator", t.creator]] : []), ["sec-schedule", t.schedule], ["sec-fee", t.feeNego], ["sec-billing", t.billing], ["sec-result", t.result], ["sec-thread", t.thread]] as [string, string][]).map(([id, label]) => (
              <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ flexShrink: 0, cursor: "pointer", border: "1px solid #2a322e", background: "#161b19", color: "#c7ccc8", borderRadius: 999, padding: "6px 13px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</button>
            ))}
          </nav>

          {/* 의뢰 내용 — AI 요약 + 원문 + 붙여넣기 (상단 배치) */}
          <Section title={t.brief} id="sec-brief">
            {deal.brief && <div style={{ fontSize: 13, lineHeight: 1.7, color: "#c7ccc8", whiteSpace: "pre-wrap", marginBottom: sum || deal.briefRaw ? 14 : 0 }}>{deal.brief}</div>}
            {deal.briefAiStatus === "processing" && <div style={{ color: "#3fb984", fontSize: 12.5, marginBottom: 12 }}>⏳ {t.analyzing}</div>}
            {deal.briefAiStatus === "failed" && !sum && <div style={{ color: "#e0785a", fontSize: 12.5, marginBottom: 12 }}>⚠ {t.aiFailed}</div>}
            {sum && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#04120c", background: "#3fb984", borderRadius: 6, padding: "2px 8px" }}>✦ {t.briefAi}</span>
                  {sum.status && <span style={{ fontSize: 11.5, color: "#8a938d" }}>{t.briefStatus}: {sum.status}</span>}
                </div>
                {sumText && <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "#e8ece9", whiteSpace: "pre-wrap" }}>{sumText}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sum.product && <Chip label={t.briefProduct} val={sum.product} />}
                  {sum.fee && <Chip label={t.feeCond} val={sum.fee} />}
                  {secText && <Chip label={t.secondary} val={secText} />}
                </div>
                {delivList.length > 0 && <FieldList title={t.deliverables} items={delivList} />}
                {notesList.length > 0 && <FieldList title={t.notes} items={notesList} accent="#f0a58a" />}
                {(sum.schedule ?? []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8a938d", marginBottom: 6 }}>{t.scheduleP}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(sum.schedule ?? []).map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#c7ccc8" }}>
                          <span style={{ color: "#3fb984", fontWeight: 700, minWidth: 96, fontVariantNumeric: "tabular-nums" }}>{s.date || "—"}</span>
                          <span>{(lang === "ja" ? s.itemJa : s.itemKo) || s.itemKo || s.itemJa}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {deal.briefRaw && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setShowRaw((v) => !v)} style={{ cursor: "pointer", border: "1px solid #2a322e", background: "transparent", color: "#8a938d", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>{showRaw ? t.hideRaw : t.showRaw}</button>
                  <button onClick={() => { setBriefText(deal.briefRaw || ""); setShowRaw(false); }} style={{ cursor: "pointer", border: "1px solid #2a322e", background: "transparent", color: "#c7ccc8", borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>✎ {t.editRaw}</button>
                </div>
                {showRaw && <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#a7afa9", whiteSpace: "pre-wrap", background: "#0f1412", border: "1px solid #212824", borderRadius: 10, padding: "12px 14px", maxHeight: 360, overflowY: "auto" }}>{deal.briefRaw}</div>}
              </div>
            )}
            {/* 붙여넣기 인입 / 수정 — 의뢰사 */}
            <div style={{ background: "#0f1412", border: "1px solid #212824", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#8a938d" }}>{deal.briefRaw ? t.updateNote : t.pasteBrief}</div>
              <textarea placeholder={t.briefPh} value={briefText} onChange={(e) => setBriefText(e.target.value)} style={{ ...selSt, minHeight: 90, resize: "vertical" }} />
              <button onClick={submitBrief} disabled={briefBusy || briefText.trim().length < 10} style={{ marginLeft: "auto", cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 800, background: "#3fb984", color: "#04120c", opacity: (briefBusy || briefText.trim().length < 10) ? .6 : 1 }}>{briefBusy ? t.analyzing : (deal.briefRaw ? t.reanalyze : t.analyze)}</button>
            </div>
          </Section>

          {/* 진행 단계 */}
          <Section title={t.progress} id="sec-progress">
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
            <Section title={t.creator} id="sec-creator">
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
          <Section title={t.schedule} id="sec-schedule">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {STAGES.map(([k, ko, ja]) => (
                <div key={k} style={{ background: "#161b19", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid #212824" }}>
                  <div style={{ fontSize: 11, color: "#8a938d", marginBottom: 4 }}>{lang === "ja" ? ja : ko}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: deal.sched?.[k] ? "#e8ece9" : "#4d554f" }}>{ymd(deal.sched?.[k]) }</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 비용 협의 · 청구/입금 — 한 행 2열(좁으면 1열) */}
          <div className="pr-two" style={{ marginBottom: 16 }}>
          {/* 비용 협의 */}
          <Section title={t.feeNego} id="sec-fee">
            {deal.feeAgreed && lastFee && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: "rgba(63,185,132,.1)", border: "1px solid rgba(63,185,132,.3)", borderRadius: 10, padding: "12px 14px" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#04120c", background: "#3fb984", borderRadius: 6, padding: "2px 8px" }}>✓ {t.feeAgreed}</span>
                <span style={{ fontSize: 12, color: "#8a938d" }}>{t.feeAgreedAmt}</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{yen(lastFee.amount)}</span>
              </div>
            )}
            {(deal.feeProposals ?? []).length === 0 ? (
              <div style={{ color: "#6b746e", fontSize: 13, marginBottom: 14 }}>{t.feeNone}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {(deal.feeProposals ?? []).map((p) => {
                  const label = p.by === "client" ? t.feeByClient : p.by === "manager" ? t.feeByManager : t.feeByCreator;
                  const canAgree = !deal.feeAgreed && p.status !== "agreed" && p.by !== "client";
                  return (
                    <div key={p.id} style={{ background: "#161b19", border: `1px solid ${p.status === "agreed" ? "rgba(63,185,132,.4)" : "#212824"}`, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: p.by === "client" ? "#f0a58a" : "#3fb984" }}>{label}</span>
                        <span style={{ fontSize: 11.5, color: "#c7ccc8" }}>{p.author}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, marginLeft: 4 }}>{yen(p.amount)}</span>
                        {p.status === "agreed" && <span style={{ fontSize: 11, fontWeight: 800, color: "#3fb984" }}>✓ {t.feeAgreed}</span>}
                        <span style={{ fontSize: 11, color: "#6b746e", marginLeft: "auto" }}>{(p.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                      {p.note && <div style={{ fontSize: 12.5, color: "#a7afa9", marginTop: 5, whiteSpace: "pre-wrap" }}>{p.note}</div>}
                      {canAgree && (
                        <div style={{ marginTop: 8 }}>
                          <button onClick={() => { const a = prompt(lang === "ja" ? "承認者のお名前" : "승인자 이름", feeForm.author || "") || feeForm.author; agreeFee(p.id, a); }} disabled={feeBusy} style={{ cursor: "pointer", border: 0, borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, background: "#3fb984", color: "#04120c", opacity: feeBusy ? .6 : 1 }}>{t.feeAgree}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* 제안 폼 — CC/매니저/의뢰사 */}
            <div style={{ background: "#0f1412", border: "1px solid #212824", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#8a938d" }}>{t.feePropose}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={feeForm.by} onChange={(e) => setFeeForm((f) => ({ ...f, by: e.target.value }))} style={selSt}>{ROLE_OPT.map(([v, ko, ja]) => <option key={v} value={v}>{lang === "ja" ? ja : ko}</option>)}</select>
                <input placeholder={t.name} value={feeForm.author} onChange={(e) => setFeeForm((f) => ({ ...f, author: e.target.value }))} style={{ ...selSt, flex: 1, minWidth: 110 }} />
                <input type="number" inputMode="numeric" placeholder={t.feeAmount} value={feeForm.amount} onChange={(e) => setFeeForm((f) => ({ ...f, amount: e.target.value }))} style={{ ...selSt, width: 150 }} />
              </div>
              <input placeholder={t.feeNote} value={feeForm.note} onChange={(e) => setFeeForm((f) => ({ ...f, note: e.target.value }))} style={selSt} />
              <button onClick={proposeFee} disabled={feeBusy || !(Number(feeForm.amount) > 0)} style={{ marginLeft: "auto", cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 800, background: "#3fb984", color: "#04120c", opacity: (feeBusy || !(Number(feeForm.amount) > 0)) ? .6 : 1 }}>{feeBusy ? t.sending : t.feeSend}</button>
            </div>
          </Section>

          {/* 청구 · 입금 */}
          <Section title={t.billing} id="sec-billing">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 청구서 — 우리(81degree) 업로드 */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8a938d", marginBottom: 8 }}>{t.invoice}</div>
                {deal.invoice ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#161b19", border: "1px solid #212824", borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ fontSize: 18 }}>🧾</span>
                    <span style={{ fontSize: 13, color: "#e8ece9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.invoice.name || t.invoice}</span>
                    {deal.invoice.at && <span style={{ fontSize: 11, color: "#6b746e" }}>{ymd(deal.invoice.at)}</span>}
                    <a href={deal.invoice.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#3fb984" }}>{t.open}</a>
                  </div>
                ) : <div style={{ color: "#6b746e", fontSize: 13, marginBottom: 8 }}>{t.noInvoice}</div>}
                <label style={{ display: "inline-block", marginTop: 8, cursor: billBusy ? "default" : "pointer", border: "1px solid #2a322e", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, color: "#c7ccc8", opacity: billBusy ? .6 : 1 }}>
                  {billBusy === "invoice" ? t.uploading : `＋ ${t.invoiceUpload}`}
                  <input type="file" style={{ display: "none" }} disabled={!!billBusy} onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) uploadBilling("invoice", f); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {/* 입금 확인 — 의뢰사 */}
              <div style={{ borderTop: "1px solid #1a201d", paddingTop: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8a938d", marginBottom: 8 }}>{t.paymentTitle}</div>
                {deal.payment && (deal.payment.paidOn || deal.payment.url) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(63,185,132,.08)", border: "1px solid rgba(63,185,132,.25)", borderRadius: 10, padding: "10px 12px", marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 18 }}>💴</span>
                    {deal.payment.paidOn && <span style={{ fontSize: 13, color: "#e8ece9" }}>{t.paidDate}: <b>{ymd(deal.payment.paidOn)}</b></span>}
                    {deal.payment.url && <a href={deal.payment.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#3fb984" }}>{t.remittance} {t.open}</a>}
                  </div>
                )}
                <div style={{ background: "#0f1412", border: "1px solid #212824", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input placeholder={t.name} value={payAuthor} onChange={(e) => setPayAuthor(e.target.value)} style={{ ...selSt, flex: 1, minWidth: 110 }} />
                    <label style={{ fontSize: 11, color: "#8a938d", display: "flex", flexDirection: "column", gap: 3 }}>
                      {t.paidOnLabel}
                      <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={selSt} />
                    </label>
                  </div>
                  <label style={{ display: "inline-block", cursor: billBusy ? "default" : "pointer", border: "1px solid #2a322e", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, color: "#c7ccc8", textAlign: "center", opacity: billBusy ? .6 : 1 }}>
                    {billBusy === "payment" ? t.uploading : `＋ ${t.remittance} · ${t.paymentReport}`}
                    <input type="file" style={{ display: "none" }} disabled={!!billBusy} onChange={(e) => { const f = e.target.files?.[0] ?? null; uploadBilling("payment", f); e.currentTarget.value = ""; }} />
                  </label>
                  {paidOn && !deal.payment?.paidOn && <button onClick={() => uploadBilling("payment", null)} disabled={!!billBusy} style={{ cursor: "pointer", border: 0, borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 800, background: "#3fb984", color: "#04120c", opacity: billBusy ? .6 : 1 }}>{billBusy === "payment" ? t.uploading : t.paymentReport}</button>}
                </div>
              </div>
            </div>
          </Section>
          </div>

          {/* 결과물 (수정요청·피드백 바로 위 — 결과물 보고 피드백) */}
          <Section title={t.result} id="sec-result">
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

          {/* 수정요청 · 피드백 (협업 스레드) */}
          <Section title={t.thread} id="sec-thread">
            {roots.length === 0 ? <div style={{ color: "#6b746e", fontSize: 13, marginBottom: 14 }}>{t.empty}</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {roots.map((c) => renderNode(c, 0))}
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

function Chip({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ background: "#0f1412", border: "1px solid #212824", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, maxWidth: "100%" }}>
      <span style={{ color: "#8a938d", marginRight: 6 }}>{label}</span>
      <span style={{ color: "#e8ece9" }}>{val}</span>
    </div>
  );
}
function FieldList({ title, items, accent = "#3fb984" }: { title: string; items: string[]; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8a938d", marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((x, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: "#c7ccc8", display: "flex", gap: 8 }}>
            <span style={{ color: accent, flexShrink: 0 }}>•</span><span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} style={{ background: "#121715", border: "1px solid #212824", borderRadius: 16, padding: 20, marginBottom: 16, scrollMarginTop: 70 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#8a938d", marginBottom: 12, letterSpacing: ".02em" }}>{title}</div>
      {children}
    </div>
  );
}

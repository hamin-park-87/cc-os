"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Deal = {
  prNo: string | null; title: string; client: string; manager: string | null; step: number; brief: string | null;
  dueDate: string | null; uploadDate: string | null; receivedDate: string | null;
  sched: Record<string, string>;
  creator: { name: string; nameEn: string | null; handle: string | null; photoUrl: string | null } | null;
  content: { permalink: string | null; thumbnailUrl: string | null; publishedAt: string | null; metrics: Record<string, number> | null } | null;
};

const STEPS: [string, string][] = [
  ["인입", "受付"], ["매니저 검토", "マネージャー確認"], ["크리에이터 협의", "クリエイター協議"], ["의뢰사 전달", "先方共有"],
  ["계약 성사", "契約成立"], ["제작·업로드", "制作・投稿"], ["청구서 발행", "請求書発行"], ["입금 확인", "入金確認"], ["완료", "完了"],
];
const STAGES: [string, string, string][] = [["plan", "기획", "企画"], ["shoot", "촬영", "撮影"], ["edit", "편집", "編集"], ["upload", "업로드", "投稿"]];
const DICT = {
  ko: { subtitle: "PR 안건 진행 대시보드", client: "의뢰사", creator: "크리에이터", manager: "담당 매니저", progress: "진행 단계", schedule: "제작 일정", brief: "의뢰 내용", result: "결과물", viewVideo: "영상 보기", views: "조회수", likes: "좋아요", notyet: "아직 등록되지 않았어요", loading: "불러오는 중…", notfound: "안건을 찾을 수 없어요. 링크를 다시 확인해주세요.", uploaded: "업로드 완료", pending: "예정" },
  ja: { subtitle: "PR案件 進行ダッシュボード", client: "依頼社", creator: "クリエイター", manager: "担当マネージャー", progress: "進行ステータス", schedule: "制作スケジュール", brief: "依頼内容", result: "成果物", viewVideo: "動画を見る", views: "再生数", likes: "いいね", notyet: "まだ登録されていません", loading: "読み込み中…", notfound: "案件が見つかりません。リンクをご確認ください。", uploaded: "投稿完了", pending: "予定" },
};
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
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/deal?token=${encodeURIComponent(token)}`);
        if (!res.ok) { setState("notfound"); return; }
        setDeal(await res.json()); setState("ok");
      } catch { setState("notfound"); }
    })();
  }, [token]);
  const t = DICT[lang];
  const name = (c: NonNullable<Deal["creator"]>) => lang === "ja" ? (c.name) : (c.name);

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
          </div>

          {/* 진행 단계 */}
          <Section title={t.progress}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STEPS.map(([ko, ja], i) => {
                const done = i < deal.step, now = i === deal.step;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 20, fontSize: 12.5, fontWeight: now ? 800 : 600,
                    background: now ? "#3fb984" : done ? "rgba(63,185,132,.12)" : "#161b19", color: now ? "#04120c" : done ? "#3fb984" : "#6b746e", border: `1px solid ${now ? "#3fb984" : done ? "rgba(63,185,132,.3)" : "#212824"}` }}>
                    <span>{done ? "✓" : i + 1}</span>{lang === "ja" ? ja : ko}
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
            ) : <div style={{ color: "#6b746e", fontSize: 13 }}>{t.notyet}</div>}
          </Section>

          {/* 의뢰 내용 */}
          {deal.brief && <Section title={t.brief}><div style={{ fontSize: 13, lineHeight: 1.7, color: "#c7ccc8", whiteSpace: "pre-wrap" }}>{deal.brief}</div></Section>}

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

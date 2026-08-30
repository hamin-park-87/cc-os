"use client";
import { useMemo, useState } from "react";
import type { Content } from "@/lib/types";
import { Avatar } from "./Avatar";
import { fmt, kfmt, engRate, monthOf } from "@/lib/format";
import { BRAND_COLOR } from "@/lib/data/seed";
import { T } from "@/lib/i18n";

const bcolor = (b?: string | null) => (b && BRAND_COLOR[b]) || "#3B7DD8";
const grad = (c: string) => `linear-gradient(150deg, ${c}, ${c}22)`;

export function ContentArchive({ contents, showCreator = true, showBrand = true, hint, tagBrands, onTag, compact, limit, onMore }: {
  contents: Content[]; showCreator?: boolean; showBrand?: boolean; hint?: string;
  tagBrands?: string[]; onTag?: (c: Content, brandName: string | null) => Promise<void>;
  compact?: boolean; limit?: number; onMore?: () => void; // compact: 필터 숨김 + N개 미리보기 + 더보기
}) {
  const [, setTick] = useState(0);
  const [creator, setCreator] = useState("");
  const [brand, setBrand] = useState("");
  const [kind, setKind] = useState("");
  const [period, setPeriod] = useState("");
  const [sort, setSort] = useState("date");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Content | null>(null);

  const creators = useMemo(() => [...new Set(contents.map((c) => c.creatorName))], [contents]);
  const brands = useMemo(() => [...new Set(contents.map((c) => c.brandName).filter(Boolean))] as string[], [contents]);
  const months = useMemo(() => [...new Set(contents.map(monthOf).filter(Boolean))].sort().reverse() as string[], [contents]);

  const items = useMemo(() => {
    const f = contents.filter((c) =>
      (!creator || c.creatorName === creator) && (!brand || c.brandName === brand) &&
      (!kind || c.kind === kind) &&
      (!status || c.status === status) && (!period || monthOf(c) === period) &&
      (!q || c.product.toLowerCase().includes(q.toLowerCase()) || c.creatorName.toLowerCase().includes(q.toLowerCase())));
    return [...f].sort((a, b) => {
      if (sort === "views") return b.views - a.views;
      if (sort === "saves") return b.saves - a.saves;
      if (sort === "eng") return (b.views ? (b.likes + b.comments + b.saves + b.shares) / b.views : 0) - (a.views ? (a.likes + a.comments + a.saves + a.shares) / a.views : 0);
      return (b.publishedAt ?? "0000-00").localeCompare(a.publishedAt ?? "0000-00");
    });
  }, [contents, creator, brand, kind, period, sort, status, q]);

  const shown = compact && limit ? items.slice(0, limit) : items;
  return (
    <>
      {!compact && <div className="filterbar">
        {showCreator && <select value={creator} onChange={(e) => setCreator(e.target.value)}><option value="">{T("모든 크리에이터")}</option>{creators.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        {showBrand && <select value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">{T("모든 브랜드")}</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>}
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">{T("모든 유형")}</option><option value="pr">{T("전략 브랜드")}</option><option value="own">{T("개인")}</option><option value="deal">{T("외부 PR")}</option></select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">{T("전체 기간")}</option>{months.map((m) => <option key={m} value={m}>{+m.slice(5)}{T("월")}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">{T("최신순")}</option><option value="views">{T("조회수순")}</option><option value="saves">{T("저장순")}</option><option value="eng">{T("참여율순")}</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{T("전체 상태")}</option><option value="uploaded">{T("게시완료")}</option><option value="planned">{T("예정")}</option></select>
        <input placeholder={T("상품 검색")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="count">{items.length}{T("개")}</span>
      </div>}
      {items.length === 0 ? <div className="empty">{T("조건에 맞는 콘텐츠가 없어요.")}</div> : (
        <div className="archive">
          {shown.map((c) => (
            <button key={c.id} className="rcard" onClick={() => setOpen(c)}>
              <div className="poster" style={c.thumbnailUrl
                ? { backgroundImage: `url(${c.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#000" }
                : { background: grad(bcolor(c.brandId ?? c.brandName)) }}>
                <div className="ov" />
                <div className="topline">
                  <span className="vbadge" style={{ background: "rgba(0,0,0,.4)" }}>{c.brandName}</span>
                  {c.status === "planned" ? <span className="vbadge"><span className="d" style={{ background: "#FBBF24" }} />{T("예정")} {c.plannedDate}</span>
                    : c.videoStatus === "ready" ? <span className="vbadge"><span className="d" style={{ background: "#34D399" }} />{T("아카이브")}</span> : null}
                </div>
                {c.status !== "planned" && <div className="play">▶</div>}
                <div className="prod">{c.product}</div>
              </div>
              <div className="meta">
                <div className="cr"><Avatar name={c.creatorName} size={22} radius={11} /><b>{c.creatorName}</b>
                  <span className={`chip ${c.kind === "deal" ? "p-acc" : c.kind === "own" ? "" : "p-acc"}`} style={{ marginLeft: "auto" }}>{c.kind === "own" ? T("개인") : c.kind === "deal" ? T("외부 PR") : "PR"}</span></div>
                <div className="stats">
                  <span>👁 <span className="num">{c.views ? kfmt(c.views) : "—"}</span></span>
                  <span>♡ <span className="num">{c.likes ? kfmt(c.likes) : "—"}</span></span>
                  <span>🔖 <span className="num">{c.saves ? kfmt(c.saves) : "—"}</span></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {compact && onMore && items.length > 0 && (
        <button className="btn" style={{ width: "100%", marginTop: 12, padding: "11px", fontWeight: 700 }} onClick={onMore}>
          {T("더보기")}{items.length > shown.length ? ` (${items.length - shown.length}+)` : ""} →
        </button>
      )}
      {open && <VideoModal content={open} tagBrands={tagBrands} onTag={onTag} onChanged={() => setTick((t) => t + 1)} onClose={() => setOpen(null)} />}
    </>
  );
}

function VideoModal({ content: c, tagBrands, onTag, onChanged, onClose }: { content: Content; tagBrands?: string[]; onTag?: (c: Content, brandName: string | null) => Promise<void>; onChanged?: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  async function tag(brandName: string | null) {
    if (!onTag) return;
    setBusy(true);
    try {
      await onTag(c, brandName);
      // 로컬 반영
      c.kind = brandName ? "pr" : "own";
      c.brandId = brandName; c.brandName = brandName ?? "";
      onChanged?.();
    } catch (e) { alert(T("태깅 실패: ") + (e as Error).message); }
    setBusy(false);
  }
  return (
    <div className="backdrop" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal">
        <div className="player" style={c.thumbnailUrl
          ? { backgroundImage: `url(${c.thumbnailUrl})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#000" }
          : { background: grad(bcolor(c.brandId ?? c.brandName)) }}>
          <div className="bigplay">▶</div>
          <div className="prodtitle">{c.product}</div>
        </div>
        <div className="mbody">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="chip"><span className="sw" style={{ background: bcolor(c.brandId ?? c.brandName) }} />{c.brandName}</span>
            <span className="chip">{c.creatorName}</span>
            <button className="iconbtn" style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
          </div>
          <h3>{c.product}</h3>
          <div className="note"><span>{c.publishedAt ? `${T("게시")} ${c.publishedAt}` : `${T("업로드 예정")} ${c.plannedDate}`}</span></div>
          <div className="mgrid">
            {([[T("조회수"), c.views], [T("도달"), c.reach], [T("좋아요"), c.likes], [T("저장"), c.saves], [T("댓글"), c.comments], [T("공유"), c.shares]] as [string, number][]).map(([l, v]) => (
              <div className="m" key={l}><div className="l">{l}</div><div className="v">{v ? fmt(v) : "—"}</div></div>
            ))}
          </div>
          <div>
            <div className="kv"><span>{T("참여율 (ENG%)")}</span><span className="num">{engRate(c)}</span></div>
            <div className="kv"><span>{T("저장률 (Save%)")}</span><span className="num">{c.views ? (c.saves / c.views * 100).toFixed(1) + "%" : "—"}</span></div>
            <div className="kv"><span>{T("아카이브 상태")}</span><span>{c.videoStatus === "ready" ? <span className="pill p-ok"><span className="d" />{T("재생 가능")}</span> : <span className="pill p-plan"><span className="d" />{T("미게시")}</span>}</span></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn acc">▶ {T("아카이브 재생")}</button>
            {c.permalink && <a className="btn" href={c.permalink} target="_blank" rel="noopener">{T("원본 게시물")}</a>}
          </div>
          {onTag && tagBrands && <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>{T("전략 브랜드 태깅")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ fontFamily: "var(--body)", fontSize: 13, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)" }}
                defaultValue={c.kind === "pr" ? (c.brandName || "") : ""} disabled={busy} onChange={(e) => tag(e.target.value || null)}>
                <option value="">{T("개인 (태깅 안함)")}</option>
                {tagBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{c.kind === "pr" ? T("전략 브랜드 콘텐츠로 지정됨") : T("브랜드를 선택하면 전략 브랜드로 지정됩니다")}</span>
            </div>
          </div>}
          <div className="note">{T("영상은 permalink에서 자동 다운로드 후 스토리지에 보관됩니다.")}</div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import type { Content } from "@/lib/types";
import { Avatar } from "./Avatar";
import { fmt, kfmt, engRate, monthOf } from "@/lib/format";
import { BRAND_COLOR } from "@/lib/data/seed";

const bcolor = (b?: string | null) => (b && BRAND_COLOR[b]) || "#3B7DD8";
const grad = (c: string) => `linear-gradient(150deg, ${c}, ${c}22)`;

export function ContentArchive({ contents, showCreator = true, showBrand = true, hint }: {
  contents: Content[]; showCreator?: boolean; showBrand?: boolean; hint?: string;
}) {
  const [creator, setCreator] = useState("");
  const [brand, setBrand] = useState("");
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
      (!status || c.status === status) && (!period || monthOf(c) === period) &&
      (!q || c.product.toLowerCase().includes(q.toLowerCase()) || c.creatorName.toLowerCase().includes(q.toLowerCase())));
    return [...f].sort((a, b) => {
      if (sort === "views") return b.views - a.views;
      if (sort === "saves") return b.saves - a.saves;
      if (sort === "eng") return (b.views ? (b.likes + b.comments + b.saves + b.shares) / b.views : 0) - (a.views ? (a.likes + a.comments + a.saves + a.shares) / a.views : 0);
      return (b.publishedAt ?? "0000-00").localeCompare(a.publishedAt ?? "0000-00");
    });
  }, [contents, creator, brand, period, sort, status, q]);

  return (
    <>
      <div className="filterbar">
        {showCreator && <select value={creator} onChange={(e) => setCreator(e.target.value)}><option value="">모든 크리에이터</option>{creators.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        {showBrand && <select value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">모든 브랜드</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>}
        <select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">전체 기간</option>{months.map((m) => <option key={m} value={m}>{+m.slice(5)}월</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="date">최신순</option><option value="views">조회수순</option><option value="saves">저장순</option><option value="eng">참여율순</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">전체 상태</option><option value="uploaded">게시완료</option><option value="planned">예정</option></select>
        <input placeholder="상품 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="count">{items.length}개</span>
      </div>
      {items.length === 0 ? <div className="empty">조건에 맞는 콘텐츠가 없어요.</div> : (
        <div className="archive">
          {items.map((c) => (
            <button key={c.id} className="rcard" onClick={() => setOpen(c)}>
              <div className="poster" style={{ background: grad(bcolor(c.brandId ?? c.brandName)) }}>
                <div className="ov" />
                <div className="topline">
                  <span className="vbadge" style={{ background: "rgba(0,0,0,.4)" }}>{c.brandName}</span>
                  {c.status === "planned" ? <span className="vbadge"><span className="d" style={{ background: "#FBBF24" }} />예정 {c.plannedDate}</span>
                    : c.videoStatus === "ready" ? <span className="vbadge"><span className="d" style={{ background: "#34D399" }} />아카이브</span> : null}
                </div>
                {c.status !== "planned" && <div className="play">▶</div>}
                <div className="prod">{c.product}</div>
              </div>
              <div className="meta">
                <div className="cr"><Avatar name={c.creatorName} size={22} radius={11} /><b>{c.creatorName}</b>
                  <span className={`chip ${c.kind === "deal" ? "p-acc" : c.kind === "own" ? "" : "p-acc"}`} style={{ marginLeft: "auto" }}>{c.kind === "own" ? "개인" : c.kind === "deal" ? "외부 PR" : "PR"}</span></div>
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
      {open && <VideoModal content={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function VideoModal({ content: c, onClose }: { content: Content; onClose: () => void }) {
  return (
    <div className="backdrop" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal">
        <div className="player" style={{ background: c.thumbnailUrl ? undefined : grad(bcolor(c.brandId ?? c.brandName)) }}>
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
          <div className="note"><span>{c.publishedAt ? `게시 ${c.publishedAt}` : `업로드 예정 ${c.plannedDate}`}</span></div>
          <div className="mgrid">
            {([["조회수", c.views], ["도달", c.reach], ["좋아요", c.likes], ["저장", c.saves], ["댓글", c.comments], ["공유", c.shares]] as [string, number][]).map(([l, v]) => (
              <div className="m" key={l}><div className="l">{l}</div><div className="v">{v ? fmt(v) : "—"}</div></div>
            ))}
          </div>
          <div>
            <div className="kv"><span>참여율 (ENG%)</span><span className="num">{engRate(c)}</span></div>
            <div className="kv"><span>저장률 (Save%)</span><span className="num">{c.views ? (c.saves / c.views * 100).toFixed(1) + "%" : "—"}</span></div>
            <div className="kv"><span>아카이브 상태</span><span>{c.videoStatus === "ready" ? <span className="pill p-ok"><span className="d" />재생 가능</span> : <span className="pill p-plan"><span className="d" />미게시</span>}</span></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn acc">▶ 아카이브 재생</button>
            {c.permalink && <a className="btn" href={c.permalink} target="_blank" rel="noopener">원본 게시물</a>}
          </div>
          <div className="note">영상은 permalink에서 자동 다운로드 후 스토리지에 보관됩니다.</div>
        </div>
      </div>
    </div>
  );
}

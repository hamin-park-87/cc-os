"use client";
import { useEffect, useMemo, useState } from "react";

type PubCreator = {
  code: string | null; name: string; nameEn: string | null; handle: string | null;
  photoUrl: string | null; followers: number; category: string | null; tone: string | null;
  intro: string | null; sns: Record<string, string>; uploads: number; totalViews: number; avgEng: number | null;
};
type PubContent = {
  product: string; permalink: string | null; thumbnailUrl: string | null; publishedAt: string | null;
  brandName: string | null; views: number; reach: number; likes: number; comments: number; saves: number; shares: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const kfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K" : "" + n);
const initials = (s: string) => s.trim().slice(0, 2).toUpperCase();

export default function PublicCreators() {
  const [rows, setRows] = useState<PubCreator[] | null>(null);
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [sort, setSort] = useState<"code" | "followers" | "name">("code");
  const [open, setOpen] = useState<PubCreator | null>(null);
  const [theme, setTheme] = useState<string>("");

  useEffect(() => { fetch("/api/public/creators").then((r) => r.json()).then((j) => setRows(j.creators ?? [])).catch(() => setRows([])); }, []);
  useEffect(() => { try { const t = localStorage.getItem("creatoros.theme"); if (t) { setTheme(t); document.documentElement.setAttribute("data-theme", t); } } catch { } }, []);
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", next); setTheme(next);
    try { localStorage.setItem("creatoros.theme", next); } catch { }
  }

  const cats = useMemo(() => [...new Set((rows ?? []).map((c) => c.category).filter(Boolean))] as string[], [rows]);
  const list = useMemo(() => {
    let f = [...(rows ?? [])];
    if (cat) f = f.filter((c) => c.category === cat);
    if (q) { const s = q.toLowerCase(); f = f.filter((c) => c.name.toLowerCase().includes(s) || (c.handle ?? "").toLowerCase().includes(s) || (c.nameEn ?? "").toLowerCase().includes(s)); }
    const rank = (c: PubCreator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : 9999; };
    f.sort((a, b) => sort === "followers" ? b.followers - a.followers : sort === "name" ? a.name.localeCompare(b.name) : rank(a) - rank(b) || a.name.localeCompare(b.name));
    return f;
  }, [rows, q, cat, sort]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ground)", color: "var(--ink)" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 14, padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "color-mix(in srgb,var(--surface) 82%,transparent)", backdropFilter: "blur(8px)" }}>
        <b style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, letterSpacing: "-.03em", color: "var(--accent)" }}>81'<span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 10.5, letterSpacing: ".22em", marginLeft: 6 }}>DEGREE</span></b>
        <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>크리에이터</span>
        <span style={{ marginLeft: "auto" }} />
        <button className="iconbtn" title="테마" onClick={toggleTheme}>◐</button>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px 60px" }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "var(--display)", fontSize: 26, margin: 0, letterSpacing: "-.02em" }}>81&apos;DEGREE 크리에이터</h1>
          <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 6 }}>일본 시장 크리에이터 라인업 · 프로필과 대표 콘텐츠 성과를 확인하세요.</p>
        </div>

        <div className="filterbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <input placeholder="이름·핸들 검색" value={q} onChange={(e) => setQ(e.target.value)}
            style={inp} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={inp}><option value="">모든 카테고리</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={inp}><option value="code">번호순</option><option value="followers">팔로워순</option><option value="name">이름순</option></select>
          <span style={{ alignSelf: "center", color: "var(--faint)", fontSize: 12.5, marginLeft: "auto" }}>{list.length}명</span>
        </div>

        {rows === null ? <div style={ph}>불러오는 중…</div> : !list.length ? <div style={ph}>조건에 맞는 크리에이터가 없어요.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
            {list.map((c) => (
              <button key={c.name} onClick={() => setOpen(c)} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {c.photoUrl ? <img src={c.photoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 13, objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 48, height: 48, borderRadius: 13, background: "var(--accent-weak)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 }}>{initials(c.nameEn || c.name)}</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.code ? <span style={{ color: "var(--faint)", fontWeight: 600, marginRight: 5, fontSize: 12 }}>{c.code}</span> : null}{c.name}</div>
                    <div style={{ color: "var(--faint)", fontSize: 12.5 }}>{c.handle}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}><b className="num" style={{ display: "block", fontSize: 16 }}>{kfmt(c.followers)}</b><small style={{ color: "var(--faint)" }}>팔로워</small></div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {c.category && <span className="chip"><span className="sw" style={{ background: "var(--accent)" }} />{c.category}</span>}
                  {c.tone && <span className="chip">{c.tone}</span>}
                </div>
                {c.intro && <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 10, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.intro}</div>}
                <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12 }}>
                  <span>업로드 <b className="num">{c.uploads}</b></span>
                  <span>평균 참여율 <b className="num">{c.avgEng != null ? c.avgEng + "%" : "—"}</b></span>
                  <span style={{ marginLeft: "auto", color: "var(--accent-ink)", fontWeight: 600 }}>콘텐츠 보기 →</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ textAlign: "center", color: "var(--faint)", fontSize: 12, marginTop: 40 }}>© 81&apos;DEGREE · cc-os.81degree.com</div>
      </main>

      {open && <PortfolioModal creator={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PortfolioModal({ creator: c, onClose }: { creator: PubCreator; onClose: () => void }) {
  const [items, setItems] = useState<PubContent[] | null>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    fetch("/api/public/portfolio?name=" + encodeURIComponent(c.name)).then((r) => r.json()).then((j) => setItems(j.items ?? [])).catch(() => setItems([]));
    return () => window.removeEventListener("keydown", h);
  }, [c.name, onClose]);
  const eng = (x: PubContent) => x.views ? (((x.likes + x.comments + x.saves + x.shares) / x.views) * 100).toFixed(1) + "%" : "—";
  return (
    <div onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(8,14,13,.62)", backdropFilter: "blur(4px)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div className="card" style={{ width: "min(760px,100%)", maxHeight: "92dvh", overflow: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {c.photoUrl ? <img src={c.photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-weak)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontWeight: 700 }}>{initials(c.nameEn || c.name)}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{c.code ? <span style={{ color: "var(--faint)", fontWeight: 600, marginRight: 6, fontSize: 13 }}>{c.code}</span> : null}{c.name}</div>
            <div style={{ color: "var(--faint)", fontSize: 12.5 }}>{c.handle} · 팔로워 {fmt(c.followers)} · {c.category ?? "—"}</div>
          </div>
          <button className="iconbtn" onClick={onClose}>✕</button>
        </div>
        {c.intro && <div className="note" style={{ marginBottom: 14 }}>{c.intro}</div>}
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", marginBottom: 10 }}>대표 콘텐츠 {items ? `(${items.length})` : ""}</div>
        {items === null ? <div style={ph}>불러오는 중…</div> : !items.length ? <div style={ph}>공개된 콘텐츠가 없어요.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
            {items.map((x, i) => (
              <a key={i} href={x.permalink ?? undefined} target="_blank" rel="noreferrer"
                style={{ textDecoration: "none", color: "inherit", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)", pointerEvents: x.permalink ? "auto" : "none" }}>
                <div style={{ aspectRatio: "3/4", background: x.thumbnailUrl ? `center/cover no-repeat url(${x.thumbnailUrl})` : "linear-gradient(150deg,var(--surface-3),var(--surface-2))", position: "relative" }}>
                  {x.permalink && <span style={{ position: "absolute", right: 8, bottom: 8, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, padding: "2px 7px", borderRadius: 999 }}>▶ 보기</span>}
                </div>
                <div style={{ padding: "9px 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.product}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 5, fontSize: 11, color: "var(--muted)" }}>
                    <span>👁 <b className="num">{x.views ? kfmt(x.views) : "—"}</b></span>
                    <span>💬 <b className="num">{eng(x)}</b></span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { fontFamily: "var(--body)", fontSize: 13, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)" };
const card: React.CSSProperties = { textAlign: "left", cursor: "pointer", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, boxShadow: "var(--shadow)", width: "100%", color: "inherit", font: "inherit" };
const ph: React.CSSProperties = { padding: "48px 20px", textAlign: "center", color: "var(--faint)", fontSize: 13.5, border: "1px dashed var(--border-strong)", borderRadius: 14 };

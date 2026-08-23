"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/auth/session";
import { getData } from "@/lib/data";
import { t, type Lang } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { AdminView, BrandView, CreatorView, type Bundle } from "./dashboards";

const NAV: Record<string, [string, string][]> = {
  admin: [["a-matrix", "대시보드"], ["a-assign", "배정 관리"], ["a-deals", "PR 안건"], ["a-revenue", "매출 대시보드"], ["a-insights", "크리에이터 인사이트"], ["a-roster", "크리에이터 관리"], ["a-cost", "비용 관리"], ["a-accounts", "계정·권한"], ["a-archive", "콘텐츠 아카이브"], ["a-risk", "계약 리스크"], ["a-conn", "연동 상태"]],
  brand: [["b-dash", "대시보드"], ["b-creators", "크리에이터별"], ["b-roster", "소속 크리에이터"], ["b-archive", "콘텐츠 아카이브"], ["b-secondary", "2차 활용"]],
  creator: [["c-growth", "내 계정 성장"], ["c-deals", "PR 안건"], ["c-revenue", "PR 매출"], ["c-content", "내 콘텐츠"], ["c-todo", "이번 달 할 일"]],
};
const ROLE_LABEL: Record<string, string> = { admin: "관리자", brand: "브랜드", creator: "크리에이터" };

export function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [d, setD] = useState<Bundle | null>(null);
  const [pane, setPane] = useState(NAV[session.role][0][0]);
  const [lang, setLang] = useState<Lang>("ko");
  const [theme, setTheme] = useState<string>("");

  useEffect(() => {
    const api = getData();
    Promise.all([api.brands(), api.creators(), api.contents(), api.deals(), api.contracts(), api.assignments()])
      .then(([brands, creators, contents, deals, contracts, assignments]) =>
        setD({ brands, creators, contents, deals, contracts, assignments }));
  }, []);

  useEffect(() => {
    try { const l = localStorage.getItem("creatoros.lang"); if (l === "ja" || l === "ko") setLang(l); } catch { }
    try { const th = localStorage.getItem("creatoros.theme"); if (th) { setTheme(th); document.documentElement.setAttribute("data-theme", th); } } catch { }
  }, []);

  const nav = NAV[session.role];
  const currentLabel = nav.find((n) => n[0] === pane)?.[1] ?? "";

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = cur ? (cur === "dark" ? "light" : "dark") : (sysDark ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", next); setTheme(next);
    try { localStorage.setItem("creatoros.theme", next); } catch { }
  }
  function toggleLang() {
    const next: Lang = lang === "ko" ? "ja" : "ko"; setLang(next);
    try { localStorage.setItem("creatoros.lang", next); } catch { }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brandmark"><b className="logo">81'<span>DEGREE</span></b></div>
        <div className="navlabel">{t(ROLE_LABEL[session.role], lang)}</div>
        {nav.map(([key, label]) => (
          <button key={key} className={`navitem ${pane === key ? "active" : ""}`} onClick={() => setPane(key)}>
            {t(label, lang)}
          </button>
        ))}
        <div className="sidebar-foot">
          <Avatar name={session.role === "creator" ? session.scope : session.scope[0]} size={32} radius={8} />
          <div className="who"><b>{session.role === "admin" ? "81degree" : session.scope}</b>
            <small>{t(ROLE_LABEL[session.role], lang)} · {session.email}</small></div>
          <button className="iconbtn" title="로그아웃" style={{ marginLeft: "auto" }} onClick={onLogout}>⎋</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div><h1>{t(currentLabel, lang)}</h1><div className="sub">2026-08 · {session.role === "admin" ? "81degree" : session.scope}</div></div>
          <div className="spacer" />
          <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 600 }} onClick={toggleLang}>{lang === "ko" ? "日本語" : "KO"}</button>
          <button className="iconbtn" title="테마" onClick={toggleTheme}>◐</button>
        </div>
        <div className="content">
          {!d ? <div className="placeholder">불러오는 중…</div>
            : session.role === "admin" ? <AdminView pane={pane} d={d} />
            : session.role === "brand" ? <BrandView pane={pane} d={d} scope={session.scope} />
            : <CreatorView pane={pane} d={d} scope={session.scope} />}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/auth/session";
import { getData } from "@/lib/data";
import { t, setCurrentLang, type Lang } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { AdminView, BrandView, CreatorView, type Bundle } from "./dashboards";

type NavItem = [string, string];               // [key, 중분류 라벨]
type NavGroup = { group: string; items: NavItem[] }; // group="" 이면 대분류 헤더 없이 단독 노출
const NAV: Record<string, NavGroup[]> = {
  admin: [
    { group: "", items: [["a-matrix", "대시보드"]] },
    { group: "크리에이터", items: [["a-roster", "크리에이터 관리"], ["a-insights", "크리에이터 인사이트"], ["a-cost", "비용 관리"], ["a-conn", "연동 상태"]] },
    { group: "브랜드", items: [["a-brands", "브랜드 관리"]] },
    { group: "PR · 콘텐츠", items: [["a-deals", "PR 안건"], ["a-assign", "배정 관리"], ["a-schedule", "제작 일정"], ["a-archive", "콘텐츠 아카이브"], ["a-secondary", "2차 활용"], ["a-risk", "계약 리스크"]] },
    { group: "매출 · 운영", items: [["a-revenue", "매출 대시보드"], ["a-accounts", "계정·권한"]] },
  ],
  brand: [
    { group: "", items: [["b-dash", "대시보드"]] },
    { group: "크리에이터", items: [["b-creators", "크리에이터별"], ["b-roster", "소속 크리에이터"]] },
    { group: "콘텐츠", items: [["b-assign", "콘텐츠 배정 및 관리"], ["b-schedule", "제작 일정"], ["b-archive", "콘텐츠 아카이브"], ["b-secondary", "2차 활용"]] },
  ],
  creator: [
    { group: "", items: [["c-growth", "내 계정 성장"], ["c-profile", "내 프로필 관리"]] },
    { group: "PR", items: [["c-deals", "PR 안건"], ["c-revenue", "PR 매출"]] },
    { group: "콘텐츠", items: [["c-content", "내 콘텐츠"], ["c-secondary", "2차 활용"], ["c-todo", "이번 달 할 일"]] },
  ],
};
const flatNav = (role: string): NavItem[] => NAV[role].flatMap((g) => g.items);
const MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
function defaultMonth(): string {
  let m = MONTHS[0];
  try { m = new Date().toLocaleDateString("sv-SE").slice(0, 7); } catch { }
  if (MONTHS.includes(m)) return m;
  return m < MONTHS[0] ? MONTHS[0] : MONTHS[MONTHS.length - 1];
}
const ROLE_LABEL: Record<string, string> = { admin: "관리자", brand: "브랜드", creator: "크리에이터" };

export function AppShell({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [d, setD] = useState<Bundle | null>(null);
  const [pane, setPane] = useState(flatNav(session.role)[0][0]);
  const [lang, setLang] = useState<Lang>("ko");
  const [theme, setTheme] = useState<string>("");
  const [month, setMonth] = useState(defaultMonth());
  const [navOpen, setNavOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 화면 전환 → URL 해시 반영 (공유 가능한 링크)
  const go = (key: string) => {
    setPane(key); setNavOpen(false);
    try { if (decodeURIComponent(location.hash.replace(/^#/, "")) !== key) location.hash = key; } catch { }
  };
  // 딥링크: URL 해시로 진입/뒤로가기 시 해당 화면 복원
  useEffect(() => {
    const keys = flatNav(session.role).map((n) => n[0]);
    const apply = () => { try { const h = decodeURIComponent(location.hash.replace(/^#/, "")); if (keys.includes(h)) setPane(h); } catch { } };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [session.role]);
  function copyLink() {
    try { navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { }
  }

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

  setCurrentLang(lang); // 렌더 시 전역 언어 반영 → 하위 트리의 T()가 현재 언어로 동작
  const groups = NAV[session.role];
  const currentLabel = flatNav(session.role).find((n) => n[0] === pane)?.[1] ?? "";

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
      <div className={`nav-scrim ${navOpen ? "show" : ""}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="brandmark"><b className="logo">81'<span>DEGREE</span></b>
          <button className="iconbtn nav-close" title="닫기" onClick={() => setNavOpen(false)}>✕</button></div>
        <div className="navlabel">{t(ROLE_LABEL[session.role], lang)}</div>
        {groups.map((g, gi) => (
          <div key={gi} className="navgroup">
            {g.group && <div className="navgroup-h">{t(g.group, lang)}</div>}
            {g.items.map(([key, label]) => (
              <button key={key} className={`navitem ${g.group ? "sub" : ""} ${pane === key ? "active" : ""}`} onClick={() => go(key)}>
                {t(label, lang)}
              </button>
            ))}
          </div>
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
          <button className="iconbtn nav-open" title="메뉴" onClick={() => setNavOpen(true)}>☰</button>
          <div style={{ minWidth: 0 }}><h1>{t(currentLabel, lang)}</h1><div className="sub">{month} · {session.role === "admin" ? "81degree" : session.scope}</div></div>
          <div className="spacer" />
          {session.role === "admin" && <select value={month} onChange={(e) => setMonth(e.target.value)}
            style={{ fontFamily: "var(--body)", fontSize: 12.5, fontWeight: 600, padding: "0 10px", height: 34, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)" }}>
            {MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{t("월", lang)}</option>)}
          </select>}
          <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 600 }} title={t("이 화면 링크 복사", lang)} onClick={copyLink}>{copied ? "✓ " + t("복사됨", lang) : "🔗 " + t("링크", lang)}</button>
          <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 600 }} onClick={toggleLang}>{lang === "ko" ? "日本語" : "KO"}</button>
          <button className="iconbtn" title="테마" onClick={toggleTheme}>◐</button>
        </div>
        <div className="content">
          {!d ? <div className="placeholder">불러오는 중…</div>
            : session.role === "admin" ? <AdminView pane={pane} d={d} month={month} email={session.email} />
            : session.role === "brand" ? <BrandView pane={pane} d={d} scope={session.scope} />
            : <CreatorView pane={pane} d={d} scope={session.scope} onNav={go} />}
        </div>
      </div>
    </div>
  );
}

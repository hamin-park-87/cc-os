"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/auth/session";
import { getData } from "@/lib/data";
import { t, setCurrentLang, type Lang } from "@/lib/i18n";
import { Avatar } from "./Avatar";
import { AdminView, BrandView, CreatorView, type Bundle } from "./dashboards";
import { Modal, Field, inp } from "./Modal";
import { changePassword } from "@/lib/auth/supabaseAuth";

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
    { group: "크리에이터", items: [["b-creators", "크리에이터"]] },
    { group: "콘텐츠", items: [["b-schedule", "제작 일정"], ["b-archive", "콘텐츠 아카이브"], ["b-secondary", "2차 활용"]] },
  ],
  creator: [
    { group: "", items: [["c-growth", "내 계정 성장"], ["c-profile", "내 프로필 관리"]] },
    { group: "PR", items: [["c-deals", "PR 안건"], ["c-revenue", "PR 정산"]] },
    { group: "콘텐츠", items: [["c-todo", "제작 일정"], ["c-content", "콘텐츠 아카이브"], ["c-secondary", "2차 활용"]] },
  ],
};
const flatNav = (role: string): NavItem[] => NAV[role].flatMap((g) => g.items);
// 코드(BR001/CC001…) 번호순 정렬 — 코드 없으면 뒤로
const codeRank = (code?: string | null) => { const m = code?.match(/\d+/); return m ? +m[0] : Infinity; };
const byCode = (a: { code?: string | null; name: string }, b: { code?: string | null; name: string }) => codeRank(a.code) - codeRank(b.code) || a.name.localeCompare(b.name);
function genMonths(): string[] {
  const out: string[] = [];
  try {
    const cur = new Date(2026, 7, 1); const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    while (cur <= end) { out.push(cur.toLocaleDateString("sv-SE").slice(0, 7)); cur.setMonth(cur.getMonth() + 1); }
  } catch { /* fallback */ }
  return out.length ? out : ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
}
const MONTHS = genMonths();
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
  const [pwOpen, setPwOpen] = useState(false);
  // 관리자 전용: 다른 브랜드/크리에이터 어드민으로 들어가 보기 (View as)
  const [viewAs, setViewAs] = useState<{ role: "brand" | "creator"; scope: string } | null>(null);
  const effRole = viewAs ? viewAs.role : session.role;
  const effScope = viewAs ? viewAs.scope : session.scope;

  // 화면 전환 → URL 해시 반영 (공유 가능한 링크)
  const go = (key: string) => {
    setPane(key); setNavOpen(false);
    try { if (decodeURIComponent(location.hash.replace(/^#/, "")) !== key) location.hash = key; } catch { }
  };
  // 전환 시작/종료 → 해당 역할 첫 화면으로 이동, 해시 초기화
  function enterViewAs(v: { role: "brand" | "creator"; scope: string } | null) {
    setViewAs(v);
    const role = v ? v.role : session.role;
    setPane(flatNav(role)[0][0]);
    try { history.replaceState(null, "", location.pathname + location.search); } catch { }
    setNavOpen(false);
  }
  // 딥링크: URL 해시로 진입/뒤로가기 시 해당 화면 복원
  useEffect(() => {
    const keys = flatNav(effRole).map((n) => n[0]);
    const apply = () => { try { const h = decodeURIComponent(location.hash.replace(/^#/, "")); if (keys.includes(h)) setPane(h); } catch { } };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [effRole]);
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
  const groups = NAV[effRole];
  const currentLabel = flatNav(effRole).find((n) => n[0] === pane)?.[1] ?? "";

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
        <div className="navlabel">{t(ROLE_LABEL[effRole], lang)}{viewAs ? ` · ${viewAs.scope}` : ""}</div>
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
          <button className="iconbtn" title={t("비밀번호 변경", lang)} style={{ marginLeft: "auto" }} onClick={() => setPwOpen(true)}>🔑</button>
          <button className="iconbtn" title="로그아웃" onClick={onLogout}>⎋</button>
        </div>
      </aside>
      {pwOpen && <PasswordModal lang={lang} onClose={() => setPwOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <button className="iconbtn nav-open" title="메뉴" onClick={() => setNavOpen(true)}>☰</button>
          <div style={{ minWidth: 0 }}><h1>{t(currentLabel, lang)}</h1><div className="sub">{month} · {effRole === "admin" ? "81degree" : effScope}</div></div>
          <div className="spacer" />
          {/* 관리자 전용: 다른 어드민으로 전환 / 복귀 */}
          {session.role === "admin" && !viewAs && d && <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; const i = v.indexOf(":"); enterViewAs({ role: v.slice(0, i) as "brand" | "creator", scope: v.slice(i + 1) }); }}
            style={{ fontFamily: "var(--body)", fontSize: 12.5, fontWeight: 600, padding: "0 10px", height: 34, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)", maxWidth: 180 }} title={t("다른 어드민으로 보기", lang)}>
            <option value="">🔀 {t("어드민 전환", lang)}</option>
            <optgroup label={t("브랜드", lang)}>{[...d.brands].sort(byCode).map((b) => <option key={b.id} value={"brand:" + b.name}>{b.code ? b.code + " · " : ""}{b.name}</option>)}</optgroup>
            <optgroup label={t("크리에이터", lang)}>{[...d.creators].sort(byCode).map((c) => <option key={c.id} value={"creator:" + c.name}>{c.code ? c.code + " · " : ""}{c.name}</option>)}</optgroup>
          </select>}
          {viewAs && <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 700, background: "var(--accent-weak)", color: "var(--accent-ink)" }} onClick={() => enterViewAs(null)}>← {t("관리자로", lang)}</button>}
          <select value={month} onChange={(e) => setMonth(e.target.value)} title={t("기준 월", lang)}
            style={{ fontFamily: "var(--body)", fontSize: 12.5, fontWeight: 600, padding: "0 10px", height: 34, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)" }}>
            {MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{t("월", lang)}</option>)}
          </select>
          <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 600 }} title={t("이 화면 링크 복사", lang)} onClick={copyLink}>{copied ? "✓ " + t("복사됨", lang) : "🔗 " + t("링크", lang)}</button>
          <button className="iconbtn" style={{ width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 600 }} onClick={toggleLang}>{lang === "ko" ? "日本語" : "KO"}</button>
          <button className="iconbtn" title="테마" onClick={toggleTheme}>◐</button>
        </div>
        <div className="content">
          {viewAs && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, borderRadius: 10, background: "var(--accent-weak)", borderLeft: "3px solid var(--accent)", fontSize: 13 }}>
            <span>🔎 <b>{t(ROLE_LABEL[effRole], lang)}</b> {t("어드민으로 보는 중", lang)}: <b>{viewAs.scope}</b></span>
            <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => enterViewAs(null)}>← {t("관리자로 돌아가기", lang)}</button>
          </div>}
          {!d ? <div className="placeholder">불러오는 중…</div>
            : effRole === "admin" ? <AdminView pane={pane} d={d} month={month} email={session.email} onNav={go} />
            : effRole === "brand" ? <BrandView pane={pane} d={d} scope={effScope} month={month} />
            : <CreatorView pane={pane} d={d} scope={effScope} month={month} onNav={go} />}
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit() {
    if (pw.length < 8) { setMsg(t("8자 이상 입력하세요", lang)); return; }
    if (pw !== pw2) { setMsg(t("비밀번호가 일치하지 않습니다", lang)); return; }
    setBusy(true); setMsg("");
    const { error } = await changePassword(pw);
    setBusy(false);
    if (error) { setMsg(t("변경 실패", lang) + ": " + error.message); return; }
    setMsg("✓ " + t("변경되었습니다", lang)); setTimeout(onClose, 1200);
  }
  return (
    <Modal title={t("비밀번호 변경", lang)} onClose={onClose} width={420}
      footer={<><button className="btn" onClick={onClose}>{t("취소", lang)}</button><button className="btn acc" disabled={busy} onClick={submit}>{busy ? "…" : t("변경", lang)}</button></>}>
      <Field label={t("새 비밀번호 (8자 이상)", lang)}><input style={inp} type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <Field label={t("새 비밀번호 확인", lang)}><input style={inp} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("✓") ? "var(--accent-ink)" : "var(--critical)" }}>{msg}</div>}
    </Modal>
  );
}

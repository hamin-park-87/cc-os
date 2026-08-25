"use client";
import { useState } from "react";
import { findAccount, saveSession, type Session } from "@/lib/auth/session";
import { sendMagicLink, signInPassword } from "@/lib/auth/supabaseAuth";
import { supabaseConfigured } from "@/lib/supabase/client";
import { toLoginEmail } from "@/lib/roles";

export function Login({ onDemoLogin }: { onDemoLogin: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const real = supabaseConfigured();

  async function pwLogin() {
    if (!email.trim() || !pw) { setErr("아이디와 비밀번호를 입력해주세요"); return; }
    setBusy(true); setErr("");
    const { error } = await signInPassword(toLoginEmail(email), pw);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // 세션 변화는 page.tsx의 onAuthChange가 감지
  }

  async function magic() {
    if (!email.trim() || !email.includes("@")) { setErr("매직링크는 이메일 계정만 가능합니다"); return; }
    setBusy(true); setErr("");
    const { error } = await sendMagicLink(email);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  }
  function demo(e: string) {
    const acct = findAccount(e);
    if (!acct) { setErr("초대되지 않은 이메일입니다."); return; }
    const s: Session = { email: acct.email, role: acct.role, scope: acct.scope };
    saveSession(s); onDemoLogin(s);
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brandmark"><b className="logo">81'<span>DEGREE</span></b></div>
        <h2>로그인</h2>
        <div className="sub">cc-os.81degree.com</div>
        {!sent ? (
          <>
            <div className="field">
              <label htmlFor="email">아이디 또는 이메일</label>
              <input id="email" type="text" placeholder="아이디 (또는 name@company.com)"
                value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") real ? pwLogin() : (email.trim() ? setSent(true) : setErr("아이디를 입력해주세요")); }} />
            </div>
            <div className="field"><input type="password" placeholder="비밀번호" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") real ? pwLogin() : demo(email); }} /></div>
            {real ? <>
              <button className="btn acc" disabled={busy} onClick={pwLogin}>{busy ? "로그인 중…" : "로그인"}</button>
              <div className="divider">이메일 계정이면</div>
              <button className="btn" disabled={busy} onClick={magic}>이메일로 매직링크 받기</button>
            </> : <>
              <button className="btn acc" onClick={() => demo(email.trim() || "hmpark@81degree.com")}>로그인</button>
            </>}
          </>
        ) : (
          <>
            <div className="field"><label>메일함을 확인하세요</label>
              <div className="sub" style={{ margin: 0 }}>{email} 로 로그인 링크를 보냈습니다. {real ? "메일의 링크를 클릭하면 로그인됩니다." : ""}</div></div>
            {!real && <button className="btn acc" onClick={() => demo(email)}>로그인 링크 열기 (시뮬레이션)</button>}
            <button className="btn" onClick={() => { setSent(false); setErr(""); }}>← 다른 이메일로</button>
          </>
        )}
        {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 10 }}>{err}</div>}
        <div className="quick">
          <div className="qlabel">데모 빠른 로그인 {real && "(임시 · anon 조회)"}</div>
          <div className="qrow">
            <button onClick={() => demo("hmpark@81degree.com")}>관리자<small>81degree</small></button>
            <button onClick={() => demo("marketing@abib.com")}>브랜드<small>abib</small></button>
            <button onClick={() => demo("hina.creator@gmail.com")}>크리에이터<small>hina</small></button>
          </div>
        </div>
      </div>
    </div>
  );
}

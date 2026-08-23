"use client";
import { useState } from "react";
import { findAccount, saveSession, type Session } from "@/lib/auth/session";
import { sendMagicLink, signInPassword } from "@/lib/auth/supabaseAuth";
import { supabaseConfigured } from "@/lib/supabase/client";

export function Login({ onDemoLogin }: { onDemoLogin: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const real = supabaseConfigured();

  async function pwLogin() {
    if (!email.trim() || !pw) { setErr("이메일과 비밀번호를 입력해주세요"); return; }
    setBusy(true); setErr("");
    const { error } = await signInPassword(email, pw);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // 세션 변화는 page.tsx의 onAuthChange가 감지
  }

  async function magic() {
    if (!email.trim()) { setErr("이메일을 입력해주세요"); return; }
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
        <div className="sub">creator-os.81degree.com</div>
        {!sent ? (
          <>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input id="email" type="email" placeholder="name@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && real) magic(); }} />
            </div>
            <button className="btn acc" disabled={busy} onClick={() => real ? magic() : (email.trim() ? setSent(true) : setErr("이메일을 입력해주세요"))}>
              {busy ? "전송 중…" : "로그인 링크 전송 (매직링크)"}
            </button>
            {real && <>
              <div className="divider">또는 비밀번호</div>
              <div className="field"><input type="password" placeholder="비밀번호" value={pw}
                onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") pwLogin(); }} /></div>
              <button className="btn" disabled={busy} onClick={pwLogin}>비밀번호로 로그인</button>
            </>}
            {!real && <><div className="divider">또는</div>
              <button className="btn" onClick={() => demo(email.trim() || "hmpark@81degree.com")}>Google로 계속</button></>}
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

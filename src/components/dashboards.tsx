"use client";
import { useState, useEffect, useCallback } from "react";
import type { Brand, BrandProduct, Creator, Content, Deal, Contract, Assignment } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Modal, Field, inp } from "./Modal";
import { ContentArchive } from "./ContentArchive";
import { Spark, MiniSpark, Donut, Bars, growthSeries, audienceOf } from "./charts";
import { fmt, kfmt, yen, engRate, monthOf, CREATOR_STATUS_LABEL, registerCreatorCodes, withCode, creatorCode } from "@/lib/format";
import { UNIT_PRICE, ALL_BRANDS, BRAND_COLOR, accounts as ACCOUNTS } from "@/lib/data/seed";
import { supabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { saveCreator, deleteCreator, patchCreator, saveDeal, deleteDeal, setDealStep, setAssignment, createDealContent, saveBrand, deleteBrand, getBrandProducts, addBrandProduct, deleteBrandProduct } from "@/lib/data/writes";

export interface Bundle {
  brands: Brand[]; creators: Creator[]; contents: Content[];
  deals: Deal[]; contracts: Contract[]; assignments: Assignment[];
}

function Kpi({ lab, val, unit, delta, dir, spark }: { lab: string; val: string | number; unit?: string; delta?: string; dir?: "up" | "down"; spark?: number[] }) {
  return (
    <div className="kpi">
      <div className="lab">{lab}</div>
      <div className="val">{val}{unit && <small> {unit}</small>}</div>
      {delta && <div className={`delta ${dir}`}>{dir === "up" ? "▲" : "▼"} {delta}</div>}
      {spark && <div className="spark"><MiniSpark data={spark} /></div>}
    </div>
  );
}
const Placeholder = ({ name }: { name: string }) => (
  <div className="placeholder">{name} — 화면 구현 예정 (프로토타입 참고)</div>
);
const statusPill = (s: Creator["status"]) => {
  const cls = s === "active" ? "p-ok" : s === "preparing" ? "p-acc" : "p-plan";
  return <span className={`pill ${cls}`}><span className="d" />{CREATOR_STATUS_LABEL[s]}</span>;
};
const md = (dt?: string) => dt ? `${+dt.slice(5, 7)}/${+dt.slice(8, 10)}` : "—";

function Ring({ p, label }: { p: number; label: string }) {
  return <div className="ring" style={{ ["--p" as string]: p }}><b>{label}</b></div>;
}
const SPK = { views: [62, 58, 70, 66, 80, 88, 120], reach: [40, 52, 48, 60, 58, 72, 86], eng: [21, 24, 22, 26, 25, 28, 29], save: [120, 140, 130, 180, 210, 260, 311], fol: [131, 132, 133, 135, 136, 138, 140] };

const STAGES: [keyof Content["sched"], string][] = [["plan", "기획"], ["shoot", "촬영"], ["edit", "편집"], ["upload", "업로드"]];
function ScheduleRows({ items }: { items: Content[] }) {
  if (!items.length) return <div className="empty">예정된 제작 일정이 없어요.</div>;
  return (<>{items.map((c) => {
    let currentSet = false;
    return (
      <div className="schedrow" key={c.id}>
        <div className="hd">
          <Avatar name={c.creatorName} size={34} radius={9} />
          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{c.product}</div><div className="s">{withCode(c.creatorName)} · {c.brandName}</div></div>
          {c.status === "uploaded" ? <span className="pill p-ok"><span className="d" />완료</span> : <span className="pill p-warn"><span className="d" />업로드 {md(c.sched.upload)}</span>}
        </div>
        <div className="sgtrack">
          {STAGES.map(([k, label]) => {
            const dt = c.sched[k]; let cls = "";
            if (c.status === "uploaded") cls = "done";
            else if (dt && dt < "2026-08-23") cls = "done";
            else if (!currentSet && dt) { cls = "now"; currentSet = true; }
            return <span key={k} className={`sgstage ${cls}`}><span className="sgk">{cls === "done" ? "✓ " : ""}{label}</span><span className="sgd">{md(dt)}</span></span>;
          })}
        </div>
      </div>
    );
  })}</>);
}

/* ── ADMIN ─────────────────────────────── */
export function AdminView({ pane, d }: { pane: string; d: Bundle }) {
  registerCreatorCodes(d.creators);
  if (pane === "a-matrix") {
    const active = d.creators.filter((c) => c.status === "active").length;
    const issues = d.creators.filter((c) => c.ig?.status === "expired" || c.ig?.status === "revoked").length;
    const asg = d.assignments.filter((a) => a.yearMonth === "2026-08");
    const totQ = asg.reduce((s, a) => s + a.quota, 0);
    const totDone = asg.reduce((s, a) => s + d.contents.filter((c) => c.brandId === a.brandId && c.creatorName === a.creatorId && c.status === "uploaded" && monthOf(c) === "2026-08").length, 0);
    const crs = [...new Set(asg.map((a) => a.creatorId))];
    const cellStyle = (r: number) => r >= 1 ? ["var(--success-weak)", "var(--success)"] : r > 0 ? ["var(--warning-weak)", "var(--warning)"] : ["var(--critical-weak)", "var(--critical)"];
    const sched = d.contents.filter((c) => c.status === "planned").sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    return (
      <>
        <div className="grid-kpi">
          <Kpi lab="전체 이행률" val={totQ ? Math.round(totDone / totQ * 100) : 0} unit="%" spark={[48, 52, 55, 58, 60, 62, 63]} />
          <Kpi lab="활성 크리에이터" val={active} unit="명" />
          <Kpi lab="진행 PR 안건" val={d.deals.length} unit="건" />
          <Kpi lab="연동 이슈" val={issues} unit="계정" />
        </div>
        <div className="sec-h"><h2>이행률 매트릭스</h2><span className="hint">완료 / 배정</span></div>
        <div className="tablewrap"><table><thead><tr><th>브랜드 \ 크리에이터</th>{crs.map((c) => <th key={c} style={{ textAlign: "center" }}>{creatorCode(c) && <div style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600 }}>{creatorCode(c)}</div>}{c}</th>)}</tr></thead><tbody>
          {(d.brands.length ? d.brands.map((x) => x.name) : ALL_BRANDS).map((b) => (<tr key={b}><td><span className="chip"><span className="sw" style={{ background: d.brands.find((x) => x.name === b)?.color ?? BRAND_COLOR[b] ?? "var(--surface-3)" }} />{b}</span></td>
            {crs.map((cName) => {
              const a = asg.find((x) => x.brandId === b && x.creatorId === cName);
              if (!a) return <td key={cName} className="mx" style={{ color: "var(--faint)" }}>·</td>;
              const done = d.contents.filter((c) => c.brandId === b && c.creatorName === cName && c.status === "uploaded" && monthOf(c) === "2026-08").length;
              const [bg, fg] = cellStyle(a.quota ? done / a.quota : 0);
              return <td key={cName} className="mx"><span className="cell" style={{ background: bg, color: fg }}>{done}/{a.quota}</span></td>;
            })}
          </tr>))}
        </tbody></table></div>
        <div className="sec-h"><h2>제작 일정 (전체)</h2><span className="hint"><span className="synced">🔄 단일 원본 동기화</span></span></div>
        <ScheduleRows items={sched} />
      </>
    );
  }
  if (pane === "a-roster") return <RosterTable creators={d.creators} contents={d.contents} full />;
  if (pane === "a-brands") return <BrandAdmin d={d} />;
  if (pane === "a-assign") return <AssignEditor d={d} />;
  if (pane === "a-deals") return <DealList deals={d.deals} contents={d.contents} creators={d.creators} />;
  if (pane === "a-revenue") return <RevenueTable d={d} />;
  if (pane === "a-cost") return <CostTable creators={d.creators} />;
  if (pane === "a-insights") return <Insights creators={d.creators} contents={d.contents} />;
  if (pane === "a-accounts") return <AccountsTable creators={d.creators} brands={d.brands} />;
  if (pane === "a-archive") return <ContentArchive contents={d.contents} />;
  if (pane === "a-conn") return <ConnTable creators={d.creators} />;
  if (pane === "a-risk") return <RiskList d={d} />;
  return <Placeholder name={pane} />;
}

function RosterTable({ creators, full, contents }: { creators: Creator[]; full?: boolean; contents?: Content[] }) {
  const [, setTick] = useState(0);
  const [edit, setEdit] = useState<Creator | null | undefined>(undefined); // undefined=닫힘, null=추가
  const [detail, setDetail] = useState<Creator | null>(null);
  const [bulk, setBulk] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"code" | "followers" | "name" | "status">("code");
  const codeNum = (c: Creator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const list = [...creators].sort((a, b) => {
    if (sortBy === "followers") return (b.followers ?? 0) - (a.followers ?? 0);
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "status") return (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || codeNum(a) - codeNum(b);
    return codeNum(a) - codeNum(b) || (a.pic ?? 0) - (b.pic ?? 0); // code
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = list.length > 0 && list.every((c) => sel.has(c.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(list.map((c) => c.id)));
  async function bulkDelete() {
    const targets = list.filter((c) => sel.has(c.id));
    if (!targets.length) return;
    if (!confirm(`선택한 ${targets.length}명의 크리에이터를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      for (const c of targets) { await deleteCreator(c.id); const i = creators.indexOf(c); if (i >= 0) creators.splice(i, 1); }
      setSel(new Set()); setTick((t) => t + 1);
    } catch (e) { alert("삭제 실패: " + (e as Error).message); setTick((t) => t + 1); }
  }
  const nActive = creators.filter((c) => c.status === "active").length;
  const nPreparing = creators.filter((c) => c.status === "preparing").length;
  const nHold = creators.filter((c) => c.status === "on_hold").length;
  return (<>
    {full && <div className="sec-h" style={{ marginTop: 0 }}><h2>크리에이터 관리</h2>
      <span style={{ display: "flex", gap: 8 }}>
        {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>선택 삭제 ({sel.size})</button>}
        <button className="btn" onClick={() => setBulk(true)}>일괄 등록</button>
        <button className="btn acc" onClick={() => setEdit(null)}>+ 크리에이터 추가</button>
      </span></div>}
    {full && <div className="grid-kpi" style={{ marginBottom: 16 }}>
      <Kpi lab="전체" val={String(creators.length)} />
      <Kpi lab="활동중" val={String(nActive)} />
      <Kpi lab="계약준비" val={String(nPreparing)} />
      <Kpi lab="보류" val={String(nHold)} />
    </div>}
    {full && <div className="filterbar">
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">번호순</option>
        <option value="followers">팔로워순</option>
        <option value="name">이름순</option>
        <option value="status">상태순</option>
      </select>
      <span className="count">{list.length}명</span>
    </div>}
    <div className="tablewrap"><table><thead><tr>
      {full && <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" /></th>}
      <th>번호</th><th>크리에이터</th><th>SNS</th><th>팔로워</th><th>상태</th><th>카테고리</th>{full && <><th>월 계약수량</th><th></th></>}
    </tr></thead><tbody>
      {list.map((c) => (
        <tr key={c.id} style={full && sel.has(c.id) ? { background: "var(--accent-weak)" } : undefined}>
          {full && <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.name} 선택`} /></td>}
          <td className="num" style={{ color: "var(--faint)", fontWeight: 600 }}>{c.code ?? "—"}</td>
          <td><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar creator={c} size={28} radius={8} />
            {full ? <b style={{ cursor: "pointer", color: "var(--accent-ink)", textDecoration: "underline", textUnderlineOffset: 2 }} onClick={() => setDetail(c)}>{c.name}</b> : <b>{c.name}</b>}</span></td>
          <td><SnsBadges c={c} /></td>
          <td className="num">{fmt(c.followers)}</td>
          <td>{statusPill(c.status)}</td>
          <td>{c.category ?? "—"}</td>
          {full && <><td className="num">{c.monthlyQuota ?? "—"}</td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setDetail(c)}>상세</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setEdit(c)}>수정</button></td></>}
        </tr>
      ))}
    </tbody></table></div>
    {edit !== undefined && <CreatorEditModal creator={edit} all={creators} onClose={() => setEdit(undefined)} onSaved={() => setTick((t) => t + 1)} />}
    {detail && <CreatorDetailModal creator={detail} contents={contents ?? []} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}
    {bulk && <BulkCreatorModal all={creators} onClose={() => setBulk(false)} onSaved={() => setTick((t) => t + 1)} />}
  </>);
}

function BulkCreatorModal({ all, onClose, onSaved }: { all: Creator[]; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(0);
  const rows = text.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((s) => s.trim()));
  const valid = rows.filter((r) => r[0]);
  async function run() {
    if (!valid.length) { setErr("등록할 행이 없습니다"); return; }
    setBusy(true); setErr(""); setOk(0);
    let n = Math.max(0, ...all.map((c) => { const m = c.code?.match(/\d+/); return m ? +m[0] : 0; }));
    let pic = Math.max(0, ...all.map((c) => c.pic ?? 0));
    try {
      for (const r of valid) {
        n++; pic++;
        const followers = +(r[2] ?? "").replace(/[^0-9]/g, "") || 0;
        const baseFee = r[4] ? +r[4].replace(/[^0-9]/g, "") || null : null;
        const c: Creator = {
          id: "", code: "CC" + String(n).padStart(3, "0"), pic, name: r[0], aliases: [], handle: r[1] || "",
          followers, status: "active", category: r[3] || undefined, fixedCost: 0, baseFee,
          sns: {}, rates: { reels: 0, secondary: 0, offline: 0, etc: 0 }, monthlyQuota: null,
        };
        const saved = await saveCreator({ ...c, id: c.name || "new-" + pic }, true);
        all.push(saved); setOk((v) => v + 1);
      }
      onSaved(); onClose();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return (
    <Modal title="크리에이터 일괄 등록" onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>취소</button>
        <button className="btn acc" disabled={busy || !valid.length} onClick={run}>{busy ? `등록 중… (${ok}/${valid.length})` : `${valid.length}명 등록`}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 8 }}>
        스프레드시트에서 복사해 붙여넣으세요 (한 줄에 한 명, 탭 또는 콤마 구분). 고유번호(CC)는 자동 부여됩니다.<br />
        순서: <b>이름 · 인스타핸들 · 팔로워 · 카테고리 · 기본보수(¥)</b> — 이름 외에는 비워도 됩니다.
      </div>
      <textarea style={{ ...inp, minHeight: 180, fontFamily: "var(--mono)", fontSize: 12.5 }}
        placeholder={"merumi\t@merumichandayo\t50000\t뷰티\t250000\nrico\t@rico\t32000\t라이프\t200000"}
        value={text} onChange={(e) => setText(e.target.value)} />
      <div className="note" style={{ marginTop: 8 }}>인식된 행: <b className="num">{valid.length}</b>명</div>
      {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function DRow({ k, v }: { k: string; v?: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
    <span style={{ color: "var(--faint)", minWidth: 128, flexShrink: 0 }}>{k}</span>
    <span style={{ flex: 1, wordBreak: "break-word" }}>{v ?? "—"}</span></div>;
}
function CreatorDetailModal({ creator: c, contents, onClose, onEdit }: { creator: Creator; contents: Content[]; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<"info" | "insight">("info");
  const [ai, setAi] = useState<{ t: string; s: string }[] | null>(null);
  const mine = contents.filter((x) => x.creatorName === c.name);
  const uploaded = mine.filter((x) => x.status === "uploaded");
  const totalViews = uploaded.reduce((s, x) => s + (x.views || 0), 0);
  const series = growthSeries(c.name, c.followers);
  const pct = ((series[series.length - 1] - series[0]) / series[0]) * 100;
  const aud = audienceOf(c.name);
  const ups = uploaded.filter((x) => x.views > 0);
  const avgEng = ups.length ? ups.reduce((s, x) => s + parseFloat(engRate(x)), 0) / ups.length : 0;
  function runAI() {
    const cards: { t: string; s: string }[] = [];
    if (pct >= 40) cards.push({ t: "성장 가속 중", s: `최근 12주 팔로워 +${pct.toFixed(0)}%. 상위 성장세, 현재 포맷 유지·시리즈화 권장.` });
    else if (pct >= 15) cards.push({ t: "안정적 성장", s: `+${pct.toFixed(0)}% 성장. 업로드 빈도를 늘리면 곡선을 끌어올릴 수 있습니다.` });
    else cards.push({ t: "성장 정체", s: `+${pct.toFixed(0)}%. 새 훅·주제 실험, 트렌드 오디오 활용 권장.` });
    if (ups.length) { const best = [...ups].sort((a, b) => parseFloat(engRate(b)) - parseFloat(engRate(a)))[0]; cards.push({ t: "베스트 콘텐츠", s: `'${best.product}'가 참여율 ${engRate(best)}로 최고. 유사 포맷 반복 추천.` }); }
    cards.push({ t: "오디언스 제안", s: `주 시청층 여성 ${aud.female}%·${aud.ages.slice().sort((a, b) => b[1] - a[1])[0][0]}, ${aud.regions[0][0]} 중심. 해당 층 주제 강화.` });
    setAi(cards);
  }
  return (
    <Modal title="크리에이터 상세" onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>닫기</button><button className="btn acc" onClick={onEdit}>수정</button></>}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Avatar creator={c} name={c.name} size={56} radius={15} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{c.code ? <span style={{ color: "var(--faint)", fontWeight: 600, marginRight: 6 }}>{c.code}</span> : null}{c.name} {statusPill(c.status)}</div>
          <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 3 }}>{c.handle} · 팔로워 {fmt(c.followers)} · {c.category ?? "—"}</div>
          <div style={{ marginTop: 6 }}><SnsBadges c={c} /></div>
        </div>
      </div>
      {c.intro && <div className="note" style={{ marginBottom: 14 }}>{c.intro}</div>}
      <div className="segmented" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button className={`btn sm ${tab === "info" ? "acc" : ""}`} onClick={() => setTab("info")}>정보</button>
        <button className={`btn sm ${tab === "insight" ? "acc" : ""}`} onClick={() => setTab("insight")}>인사이트</button>
      </div>
      {tab === "info" ? <>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "0 0 4px" }}>기본 정보</div>
        <DRow k="한자 이름" v={c.nameKanji} />
        <DRow k="영문 이름" v={c.nameEn} />
        <DRow k="영문 주소" v={c.addressEn} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "14px 0 4px" }}>계약·정산 정보</div>
        <DRow k="구분" v={c.entityType === "corporation" ? "법인" : "개인"} />
        <DRow k="이메일" v={c.email} />
        <DRow k="전화번호" v={c.phone} />
        <DRow k="주소" v={c.address} />
        <DRow k="은행계좌" v={c.bankAccount} />
        <DRow k="인보이스 등록번호" v={c.invoiceRegNo} />
        <DRow k="원천징수" v={c.withholding == null ? "—" : c.withholding ? "대상 (10.21%)" : "대상외"} />
        <DRow k="계약기간" v={c.contractDate || c.contractEnd ? `${c.contractDate ?? "—"} ~ ${c.contractEnd ?? "—"}` : undefined} />
        <DRow k="기본보수 (세전/월)" v={c.baseFee != null ? yen(c.baseFee) : undefined} />
        <DRow k="지급사이클" v={c.payCycle} />
        <DRow k="월 계약 수량" v={c.monthlyQuota != null ? `${c.monthlyQuota}건` : undefined} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "14px 0 4px" }}>PR 단가</div>
        <DRow k="릴스 1건당" v={yen(c.rates.reels)} />
        <DRow k="2차 활용" v={yen(c.rates.secondary)} />
        <DRow k="오프라인 PR" v={yen(c.rates.offline)} />
      </> : <>
        <div className="grid-kpi" style={{ marginBottom: 14 }}>
          <Kpi lab="팔로워" val={fmt(c.followers)} delta={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% (12주)`} dir={pct >= 0 ? "up" : "down"} spark={series.map((v) => v / 1000)} />
          <Kpi lab="순증 (12주)" val={`+${fmt(series[series.length - 1] - series[0])}`} />
          <Kpi lab="평균 참여율" val={avgEng.toFixed(1)} unit="%" />
          <Kpi lab="업로드" val={uploaded.length} unit="건" />
        </div>
        <div className="card pad" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ margin: "0 0 6px" }}><h2>팔로워 추이</h2><span className="hint">{c.handle} · 최근 12주</span></div>
          <div style={{ marginTop: 8 }}><Spark data={series} /></div>
        </div>
        <div className="card pad" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>✨ AI 성장 코치</h2><button className="btn acc" onClick={runAI}>분석 실행</button></div>
          {!ai ? <div className="note">'분석 실행'을 누르면 성장률·아카이브 콘텐츠를 분석해 피드백과 추천을 제공합니다.</div>
            : ai.map((f, i) => <div key={i} className="ai-card"><span className="ic">★</span><div><div className="t">{f.t}</div><div className="s">{f.s}</div></div></div>)}
        </div>
        <div className="sec-h" style={{ margin: "0 0 10px" }}><h2>콘텐츠 아카이브</h2><span className="hint">{c.handle}</span></div>
        <ContentArchive contents={mine} showCreator={false} />
      </>}
    </Modal>
  );
}

/* ── 브랜드 관리 ───── */
function BrandAdmin({ d }: { d: Bundle }) {
  const [, setTick] = useState(0);
  const [edit, setEdit] = useState<Brand | null | undefined>(undefined);
  const [products, setProducts] = useState<Brand | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"code" | "name" | "period" | "amount">("code");
  const codeNum = (b: Brand) => { const m = b.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const list = [...d.brands].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "period") return (a.contractStart ?? "9999").localeCompare(b.contractStart ?? "9999");
    if (sortBy === "amount") return (b.monthlyAmount ?? 0) - (a.monthlyAmount ?? 0);
    return codeNum(a) - codeNum(b) || a.name.localeCompare(b.name); // code
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = list.length > 0 && list.every((b) => sel.has(b.id));
  async function bulkDelete() {
    const targets = list.filter((b) => sel.has(b.id));
    if (!targets.length || !confirm(`선택한 ${targets.length}개 브랜드를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try { for (const b of targets) { await deleteBrand(b.id); const i = d.brands.indexOf(b); if (i >= 0) d.brands.splice(i, 1); } setSel(new Set()); setTick((t) => t + 1); }
    catch (e) { alert("삭제 실패: " + (e as Error).message); setTick((t) => t + 1); }
  }
  const period = (b: Brand) => b.contractStart || b.contractEnd ? `${b.contractStart ?? "—"} ~ ${b.contractEnd ?? "—"}` : "—";
  return (<>
    <div className="sec-h" style={{ marginTop: 0 }}><h2>브랜드 관리</h2>
      <span style={{ display: "flex", gap: 8 }}>
        {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>선택 삭제 ({sel.size})</button>}
        <button className="btn acc" onClick={() => setEdit(null)}>+ 브랜드 추가</button>
      </span></div>
    <div className="filterbar">
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">번호순</option>
        <option value="name">알파벳순</option>
        <option value="period">계약기간순</option>
        <option value="amount">월 계약금액순</option>
      </select>
      <span className="count">{list.length}개</span>
    </div>
    {!list.length ? <div className="placeholder">등록된 브랜드가 없어요. ‘+ 브랜드 추가’로 시작하세요.</div> :
      <div className="tablewrap"><table><thead><tr>
        <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map((b) => b.id)))} aria-label="전체 선택" /></th>
        <th>번호</th><th>브랜드</th><th>월 수량</th><th>월 계약금액</th><th>계약기간</th><th>도메인</th><th></th>
      </tr></thead><tbody>
        {list.map((b) => (
          <tr key={b.id} style={sel.has(b.id) ? { background: "var(--accent-weak)" } : undefined}>
            <td><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} aria-label={`${b.name} 선택`} /></td>
            <td className="num" style={{ color: "var(--faint)", fontWeight: 600 }}>{b.code ?? "—"}</td>
            <td><span className="chip"><span className="sw" style={{ background: b.color ?? BRAND_COLOR[b.name] ?? "var(--surface-3)" }} /><b>{b.name}</b></span></td>
            <td className="num">{b.monthlyQuota != null ? `${b.monthlyQuota}건` : "—"}</td>
            <td className="num">{b.monthlyAmount != null ? yen(b.monthlyAmount) : "—"}</td>
            <td className="num" style={{ color: "var(--muted)" }}>{period(b)}</td>
            <td style={{ color: "var(--muted)" }}>{b.domainAllowlist?.length ? b.domainAllowlist.join(", ") : "—"}</td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setProducts(b)}>상품</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setEdit(b)}>수정</button></td>
          </tr>
        ))}
      </tbody></table></div>}
    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>브랜드를 추가하면 배정 관리·PR 안건·계정 초대의 브랜드 선택에도 자동 반영됩니다. ‘상품’에서 월별 PR 상품 리스트를 관리하세요.</div>
    {edit !== undefined && <BrandEditModal brand={edit} all={d.brands} onClose={() => setEdit(undefined)} onSaved={() => setTick((t) => t + 1)} />}
    {products && <BrandProductsModal brand={products} brands={d.brands} onClose={() => setProducts(null)} />}
  </>);
}

function BrandEditModal({ brand, all, onClose, onSaved }: { brand: Brand | null; all: Brand[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !brand;
  const nextCode = "BR" + String(Math.max(0, ...all.map((b) => { const m = b.code?.match(/\d+/); return m ? +m[0] : 0; })) + 1).padStart(3, "0");
  const [f, setF] = useState<Brand>(brand ? { ...brand } : { id: "", code: nextCode, name: "", aliases: [], color: "#22B24E", domainAllowlist: [] });
  const up = (k: keyof Brand, v: unknown) => setF((s) => ({ ...s, [k]: v } as Brand));
  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  async function save() {
    if (!f.name.trim()) { alert("브랜드명을 입력해주세요"); return; }
    try {
      const ff = { ...f, code: normalizeCode(f.code, "BR") };
      if (brand) { const saved = await saveBrand(ff, false); Object.assign(brand, saved); }
      else { const saved = await saveBrand({ ...ff, id: ff.name }, true); all.push(saved); }
      onSaved(); onClose();
    } catch (e) { alert("저장 실패: " + (e as Error).message); }
  }
  async function del() {
    if (!brand) return;
    if (!confirm(`'${brand.name}' 브랜드를 삭제할까요? 연결된 계약/배정이 있으면 영향이 있을 수 있습니다.`)) return;
    try { await deleteBrand(brand.id); const i = all.indexOf(brand); if (i >= 0) all.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert("삭제 실패: " + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? "브랜드 추가" : "브랜드 수정"} onClose={onClose}
      footer={<>{!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>삭제</button>}
        <button className="btn" onClick={onClose}>취소</button><button className="btn acc" onClick={save}>저장</button></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0 14px", alignItems: "end" }}>
        <Field label="고유번호 (BR번호)"><input style={inp} placeholder="BR001" value={f.code ?? ""} onChange={(e) => up("code", e.target.value)} onBlur={(e) => up("code", normalizeCode(e.target.value, "BR"))} /></Field>
        <Field label="브랜드명"><input style={inp} placeholder="예: abib" value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
        <Field label="색상"><input type="color" style={{ ...inp, width: 56, padding: 4, height: 40 }} value={f.color ?? "#22B24E"} onChange={(e) => up("color", e.target.value)} /></Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "6px 0 8px" }}>계약 정보</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="계약 시작월"><input style={inp} type="month" value={f.contractStart ?? ""} onChange={(e) => up("contractStart", e.target.value)} /></Field>
        <Field label="계약 종료월"><input style={inp} type="month" value={f.contractEnd ?? ""} onChange={(e) => up("contractEnd", e.target.value)} /></Field>
        <Field label="월 콘텐츠 계약 수량"><input style={inp} type="number" value={f.monthlyQuota ?? ""} onChange={(e) => up("monthlyQuota", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label="월간 계약 금액 (¥)"><input style={inp} type="number" value={f.monthlyAmount ?? ""} onChange={(e) => up("monthlyAmount", e.target.value === "" ? null : +e.target.value)} /></Field>
      </div>
      <Field label="별칭 (쉼표로 구분)"><input style={inp} placeholder="아비브, ABIB" value={f.aliases?.join(", ") ?? ""} onChange={(e) => up("aliases", toList(e.target.value))} /></Field>
      <Field label="로그인 이메일 도메인 (쉼표로 구분)"><input style={inp} placeholder="abib.com" value={f.domainAllowlist?.join(", ") ?? ""} onChange={(e) => up("domainAllowlist", toList(e.target.value))} /></Field>
      <div style={{ fontSize: 12, color: "var(--faint)" }}>도메인을 넣으면 해당 브랜드 담당자가 그 이메일로 가입/로그인 시 자동으로 이 브랜드에 매칭됩니다.</div>
    </Modal>
  );
}

function BrandProductsModal({ brand, brands, onClose }: { brand: Brand; brands: Brand[]; onClose: () => void }) {
  const [month, setMonth] = useState("2026-08");
  const [items, setItems] = useState<BrandProduct[]>([]);
  const [name, setName] = useState(""); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { getBrandProducts(brand.name, month, brands).then(setItems).catch(() => setItems([])); }, [brand.name, month, brands]);
  useEffect(() => { load(); }, [load]);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { await addBrandProduct(brand.name, month, name.trim(), url.trim(), brands); setName(""); setUrl(""); load(); }
    catch (e) { alert("추가 실패: " + (e as Error).message); }
    setBusy(false);
  }
  async function del(id: string) { try { await deleteBrandProduct(id); load(); } catch (e) { alert("삭제 실패: " + (e as Error).message); } }
  return (
    <Modal title={`${brand.name} · PR 상품 리스트`} onClose={onClose} width={560}
      footer={<button className="btn acc" onClick={onClose}>완료</button>}>
      <div className="filterbar" style={{ marginBottom: 12 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.replace("-", ". ")}</option>)}</select>
        <span className="count">{items.length}개</span>
      </div>
      {!items.length ? <div className="placeholder" style={{ padding: "18px 0" }}>이 달 등록된 상품이 없어요.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface-2)", borderRadius: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                {p.url && <a href={p.url} target="_blank" rel="noopener" style={{ fontSize: 11.5, color: "var(--accent-ink)", wordBreak: "break-all" }}>{p.url}</a>}
              </div>
              <button className="btn" style={{ padding: "5px 9px", fontSize: 11.5, color: "var(--critical)", borderColor: "var(--critical)" }} onClick={() => del(p.id)}>삭제</button>
            </div>
          ))}
        </div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
        <input style={inp} placeholder="상품명" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inp} placeholder="상품 URL (선택)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn acc" disabled={busy || !name.trim()} onClick={add}>추가</button>
      </div>
    </Modal>
  );
}

const SNS_URL: Record<string, (h: string) => string> = {
  ig: (h) => "https://instagram.com/" + h.replace(/^@/, ""),
  youtube: (h) => "https://youtube.com/@" + h.replace(/^@/, ""),
  tiktok: (h) => "https://tiktok.com/@" + h.replace(/^@/, ""),
  x: (h) => "https://x.com/" + h.replace(/^@/, ""),
  line: (h) => "https://line.me/ti/p/~" + h.replace(/^@/, ""),
};
function SnsBadge({ k, disp, val }: { k: string; disp: string; val?: string }) {
  if (!val) return null;
  return <a href={SNS_URL[k](val)} target="_blank" rel="noopener" title={val}
    style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 5px", borderRadius: 5, background: k === "ig" ? "var(--accent-weak)" : "var(--surface-3)", color: k === "ig" ? "var(--accent-ink)" : "var(--muted)", textDecoration: "none", marginRight: 4, display: "inline-block" }}>{disp}</a>;
}
function SnsBadges({ c }: { c: Creator }) {
  return (<span style={{ whiteSpace: "nowrap" }}>
    <SnsBadge k="ig" disp="IG" val={c.handle} />
    <SnsBadge k="youtube" disp="YT" val={c.sns.youtube} />
    <SnsBadge k="tiktok" disp="TT" val={c.sns.tiktok} />
    <SnsBadge k="x" disp="X" val={c.sns.x} />
    <SnsBadge k="line" disp="LINE" val={c.sns.line} />
  </span>);
}

// 고유번호 형식 통일: 숫자만/소문자 입력 → prefix + 3자리 (예: "2" → "CC002", brand는 "BR002")
function normalizeCode(v?: string | null, prefix = "CC"): string | null {
  if (!v || !v.trim()) return null;
  const m = v.match(/\d+/);
  return m ? prefix + m[0].padStart(3, "0") : v.trim().toUpperCase();
}
function CreatorEditModal({ creator, all, onClose, onSaved }: { creator: Creator | null; all: Creator[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !creator;
  const nextCode = "CC" + String(Math.max(0, ...all.map((c) => { const m = c.code?.match(/\d+/); return m ? +m[0] : 0; })) + 1).padStart(3, "0");
  const [f, setF] = useState<Creator>(creator ? { ...creator, sns: { ...creator.sns }, rates: { ...creator.rates } } : {
    id: "", code: nextCode, pic: Math.max(0, ...all.map((c) => c.pic ?? 0)) + 1, name: "", aliases: [], handle: "", followers: 0,
    status: "active", fixedCost: 0, sns: {}, rates: { reels: 0, secondary: 0, offline: 0, etc: 0 }, monthlyQuota: null,
  });
  const up = (k: keyof Creator, v: unknown) => setF((s) => ({ ...s, [k]: v } as Creator));
  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const rd = new FileReader(); rd.onload = () => up("photoUrl", rd.result as string); rd.readAsDataURL(file);
  }
  async function save() {
    try {
      const ff = { ...f, code: normalizeCode(f.code) };
      if (creator) { const saved = await saveCreator(ff, false); Object.assign(creator, saved); }
      else { const saved = await saveCreator({ ...ff, id: ff.name || "new-" + ff.pic }, true); all.push(saved); }
      onSaved(); onClose();
    } catch (e) { alert("저장 실패: " + (e as Error).message); }
  }
  async function del() {
    if (!creator) return;
    try { await deleteCreator(creator.id); const i = all.indexOf(creator); if (i >= 0) all.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert("삭제 실패: " + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? "크리에이터 추가" : "크리에이터 수정"} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>삭제</button>}
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn acc" onClick={save}>저장</button>
      </>}>
      <Field label="프로필 사진">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar creator={f} name={f.name} size={56} radius={15} />
          <label className="btn" style={{ cursor: "pointer" }}>사진 업로드<input type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} /></label>
          {f.photoUrl && <button className="btn" onClick={() => up("photoUrl", null)}>제거</button>}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="고유번호 (CC번호)"><input style={inp} placeholder="CC001 (숫자만 입력해도 자동 변환)" value={f.code ?? ""} onChange={(e) => up("code", e.target.value)} onBlur={(e) => up("code", normalizeCode(e.target.value))} /></Field>
        <Field label="크리에이터명"><input style={inp} value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
        <Field label="한자(일본어) 이름"><input style={inp} placeholder="瀬戸川芽瑠" value={f.nameKanji ?? ""} onChange={(e) => up("nameKanji", e.target.value)} /></Field>
        <Field label="영문 이름"><input style={inp} placeholder="Merumi Setokawa" value={f.nameEn ?? ""} onChange={(e) => up("nameEn", e.target.value)} /></Field>
        <Field label="인스타 핸들"><input style={inp} value={f.handle ?? ""} onChange={(e) => up("handle", e.target.value)} /></Field>
        <Field label="팔로워"><input style={inp} type="number" value={f.followers} onChange={(e) => up("followers", +e.target.value)} /></Field>
        <Field label="상태"><select style={inp} value={f.status} onChange={(e) => up("status", e.target.value)}><option value="active">활동중</option><option value="preparing">계약준비</option><option value="on_hold">보류</option></select></Field>
        <Field label="주력 카테고리"><input style={inp} value={f.category ?? ""} onChange={(e) => up("category", e.target.value)} /></Field>
        <Field label="콘텐츠 톤"><input style={inp} value={f.tone ?? ""} onChange={(e) => up("tone", e.target.value)} /></Field>
        <Field label="월 계약 수량"><input style={inp} type="number" value={f.monthlyQuota ?? ""} onChange={(e) => up("monthlyQuota", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label="월 고정비"><input style={inp} type="number" value={f.fixedCost} onChange={(e) => up("fixedCost", +e.target.value)} /></Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>추가 SNS</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {(["youtube", "tiktok", "x", "line"] as const).map((k) => (
          <Field key={k} label={k === "x" ? "X" : k}><input style={inp} value={f.sns[k] ?? ""} onChange={(e) => setF((s) => ({ ...s, sns: { ...s.sns, [k]: e.target.value } }))} /></Field>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>PR 단가 (¥)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {(["reels", "secondary", "offline", "etc"] as const).map((k) => (
          <Field key={k} label={{ reels: "릴스 1건당", secondary: "2차 활용", offline: "오프라인 PR", etc: "기타" }[k]}>
            <input style={inp} type="number" value={f.rates[k]} onChange={(e) => setF((s) => ({ ...s, rates: { ...s.rates, [k]: +e.target.value } }))} /></Field>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>계약·정산 정보 <span style={{ color: "var(--faint)", fontWeight: 400 }}>(민감정보)</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="이메일"><input style={inp} type="email" value={f.email ?? ""} onChange={(e) => up("email", e.target.value)} /></Field>
        <Field label="전화번호"><input style={inp} value={f.phone ?? ""} onChange={(e) => up("phone", e.target.value)} /></Field>
      </div>
      <Field label="주소"><input style={inp} value={f.address ?? ""} onChange={(e) => up("address", e.target.value)} /></Field>
      <Field label="영문 주소"><input style={inp} placeholder="English address" value={f.addressEn ?? ""} onChange={(e) => up("addressEn", e.target.value)} /></Field>
      <Field label="은행계좌"><input style={inp} value={f.bankAccount ?? ""} onChange={(e) => up("bankAccount", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="인보이스 등록번호 (T번호)"><input style={inp} placeholder="T0000000000000" value={f.invoiceRegNo ?? ""} onChange={(e) => up("invoiceRegNo", e.target.value)} /></Field>
        <Field label="구분"><select style={inp} value={f.entityType ?? "individual"} onChange={(e) => up("entityType", e.target.value)}><option value="individual">개인</option><option value="corporation">법인</option></select></Field>
        <Field label="계약 시작일"><input style={inp} type="date" value={f.contractDate ?? ""} onChange={(e) => up("contractDate", e.target.value)} /></Field>
        <Field label="계약 종료일"><input style={inp} type="date" value={f.contractEnd ?? ""} onChange={(e) => up("contractEnd", e.target.value)} /></Field>
        <Field label="기본보수 (세전/월, ¥)"><input style={inp} type="number" value={f.baseFee ?? ""} onChange={(e) => up("baseFee", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label="지급사이클"><input style={inp} placeholder="월말마감 익월 10일 지급" value={f.payCycle ?? ""} onChange={(e) => up("payCycle", e.target.value)} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "2px 0 4px" }}>
        <input type="checkbox" checked={f.withholding ?? false} onChange={(e) => up("withholding", e.target.checked)} /> 원천징수 대상 (개인사업자, 10.21%)
      </label>
    </Modal>
  );
}

function ConnTable({ creators }: { creators: Creator[] }) {
  const [, setTick] = useState(0);
  const [conn, setConn] = useState<Creator | null>(null);
  const list = creators.filter((c) => c.status === "active" || c.ig);
  return (<>
    <div className="card pad" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>연동 방법 (4단계)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, fontSize: 12.5, color: "var(--muted)" }}>
        {["① 연동 요청 발송", "② Instagram 로그인·동의", "③ 토큰 저장 (활성)", "④ 자동 수집 시작"].map((s) => (
          <div key={s} style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 9 }}>{s}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>※ Instagram 비즈니스/크리에이터 계정 + Facebook 페이지 연결 필요 · 토큰 60일 만료</div>
    </div>
    <div className="tablewrap"><table><thead><tr>
      <th>크리에이터</th><th>IG 핸들</th><th>연동일</th><th>상태</th><th></th>
    </tr></thead><tbody>
      {list.map((c) => {
        const s = c.ig?.status;
        const [cls, lab] = s === "active" ? ["p-ok", "연동됨"] : s === "expired" ? ["p-warn", "토큰 만료"] : s === "revoked" ? ["p-plan", "연동 해제"] : ["p-plan", "미연동"];
        return (<tr key={c.id}><td><b>{c.name}</b></td><td className="num" style={{ color: "var(--muted)" }}>{c.handle}</td>
          <td className="num" style={{ color: "var(--muted)" }}>{c.ig?.linkedAt ?? "—"}</td>
          <td><span className={`pill ${cls}`}><span className="d" />{lab}</span></td>
          <td style={{ textAlign: "right" }}><button className={`btn ${s === "active" ? "" : "acc"}`} style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setConn(c)}>{s === "active" ? "재연동" : "연동하기"}</button></td></tr>);
      })}
    </tbody></table></div>
    {conn && <ConnModal creator={conn} onClose={() => setConn(null)} onDone={() => setTick((t) => t + 1)} />}
  </>);
}

function ConnModal({ creator, onClose, onDone }: { creator: Creator; onClose: () => void; onDone: () => void }) {
  const [stage, setStage] = useState<1 | 2>(1);
  function approve() {
    creator.ig = { status: "active", linkedAt: "2026-08-23", expiresAt: "2026-10-22" };
    onDone(); onClose();
  }
  return (
    <Modal title="Instagram 계정 연동" onClose={onClose} width={440}>
      <div className="note" style={{ color: "var(--faint)", fontSize: 12.5, marginBottom: 14 }}>{creator.name} · {creator.handle}</div>
      {stage === 1 ? (
        <>
          <div style={{ background: "var(--surface-2)", borderRadius: 11, padding: "14px 16px", fontSize: 13 }}>
            <b>연동 요청 링크를 크리에이터에게 발송</b>
            <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>크리에이터가 링크를 열어 본인 Instagram 계정으로 직접 허용합니다.</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose}>연동 요청 발송</button>
            <button className="btn acc" onClick={() => setStage(2)}>지금 연동 (시뮬레이션)</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, margin: "0 auto 12px", background: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)" }} />
            <b style={{ fontSize: 15 }}>creatorOS가 접근을 요청합니다</b>
            <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 4 }}>{creator.handle}</div>
          </div>
          <div style={{ background: "var(--surface-2)", borderRadius: 11, padding: "14px 16px", fontSize: 13 }}>
            <b style={{ display: "block", marginBottom: 8 }}>요청 권한</b>
            {["프로필·팔로워 정보 조회", "게시물(릴스)·미디어 조회", "인사이트(조회·도달·저장) 조회"].map((p) => (
              <div key={p} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12.5 }}><span style={{ color: "var(--accent-ink)" }}>✓</span>{p}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose}>거부</button>
            <button className="btn acc" onClick={approve}>Instagram으로 허용</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// 브랜드 계약 단가(월금액/월수량) — 없으면 UNIT_PRICE 폴백. 브랜드가 매출·배정의 단일 원본.
export function brandUnitPrice(brand: Brand | undefined): number {
  return brand?.monthlyQuota && brand?.monthlyAmount ? brand.monthlyAmount / brand.monthlyQuota : UNIT_PRICE;
}
// 크리에이터 월 인건비: 기본보수(baseFee) 우선, 없으면 고정비(fixedCost)
export const monthlyCost = (c: Creator): number => (c.baseFee != null ? c.baseFee : (c.fixedCost || 0));

function RevenueTable({ d }: { d: Bundle }) {
  const live = d.deals.filter((x) => x.step >= 4);
  const comp = (x: Deal) => Math.round(x.fee * x.shareCompany / 100);
  const ah = live.filter((x) => x.type === "ahchannel").reduce((s, x) => s + comp(x), 0);
  const cr = live.filter((x) => x.type !== "ahchannel").reduce((s, x) => s + comp(x), 0);
  const unitOf = (brandName: string) => brandUnitPrice(d.brands.find((b) => b.name === brandName));
  // ② 브랜드 월계약 = 브랜드별 월 계약금액 합 (단일 원본)
  const brandRev = d.brands.reduce((s, b) => s + (b.monthlyAmount || 0), 0);
  const fixed = d.creators.reduce((s, c) => s + monthlyCost(c), 0);
  const total = ah + brandRev + cr;
  // 크리에이터별 기여
  const per = d.creators.map((c) => {
    const ds = live.filter((x) => x.creatorName === c.name);
    const prComp = ds.reduce((s, x) => s + comp(x), 0);
    const brandAlloc = d.assignments.filter((a) => a.creatorId === c.name).reduce((s, a) => s + a.quota * unitOf(a.brandId), 0);
    const cost = monthlyCost(c);
    return { name: c.name, prComp, brandAlloc, fixed: cost, contrib: prComp + brandAlloc - cost };
  }).filter((p) => p.prComp || p.brandAlloc || p.fixed).sort((a, b) => b.contrib - a.contrib);
  return (<>
    <div className="grid-kpi">
      <Kpi lab="① ah!channel PR" val={yen(ah)} /><Kpi lab="② 브랜드 월계약" val={yen(brandRev)} />
      <Kpi lab="③ 개별 PR" val={yen(cr)} /><Kpi lab="총 매출" val={yen(total)} /><Kpi lab="순이익 (−인건비)" val={yen(total - fixed)} />
    </div>
    <div className="sec-h"><h2>크리에이터별 기여 손익</h2><span className="hint">브랜드계약 배분 + PR 회사매출 − 월 보수</span></div>
    <div className="tablewrap"><table><thead><tr>
      <th>크리에이터</th><th>브랜드계약 배분</th><th>PR 회사매출</th><th>월 보수</th><th>기여이익</th>
    </tr></thead><tbody>
      {per.map((p) => (
        <tr key={p.name}><td><b>{withCode(p.name)}</b></td><td className="num">{yen(p.brandAlloc)}</td><td className="num">{yen(p.prComp)}</td>
          <td className="num" style={{ color: "var(--muted)" }}>{yen(p.fixed)}</td>
          <td className="num" style={{ fontWeight: 600, color: p.contrib >= 0 ? "var(--accent-ink)" : "var(--critical)" }}>{yen(p.contrib)}</td></tr>
      ))}
    </tbody></table></div>
  </>);
}

/* 배정 관리 (월 · 브랜드별 크리에이터 배분) */
const ASSIGN_MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
function AssignEditor({ d }: { d: Bundle }) {
  const [, setTick] = useState(0);
  const [brand, setBrand] = useState("abib");
  const [month, setMonth] = useState("2026-08");
  const [sortBy, setSortBy] = useState<"code" | "name" | "assigned">("code");
  const [prods, setProds] = useState<BrandProduct[]>([]);
  const codeNum = (c: Creator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const qOf = (name: string) => d.assignments.find((a) => a.brandId === brand && a.creatorId === name && a.yearMonth === month)?.quota ?? 0;
  const actives = d.creators.filter((c) => c.status === "active").sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "assigned") return qOf(b.name) - qOf(a.name);
    return codeNum(a) - codeNum(b); // code
  });
  // 브랜드 계약(월수량)을 단일 원본으로 — 계약기간 내에서만 목표 적용, 없으면 contracts 폴백
  const brandObj = d.brands.find((b) => b.name === brand);
  const inPeriod = (!brandObj?.contractStart || brandObj.contractStart <= month) && (!brandObj?.contractEnd || brandObj.contractEnd >= month);
  const target = brandObj?.monthlyQuota != null && inPeriod
    ? brandObj.monthlyQuota
    : (d.contracts.find((c) => c.brandId === brand && c.yearMonth === month)?.quota ?? 0);
  const totalFor = (name: string) => d.assignments.filter((a) => a.creatorId === name && a.yearMonth === month).reduce((s, a) => s + a.quota, 0);
  const capOf = (name: string) => d.creators.find((c) => c.name === name)?.monthlyQuota ?? 0;
  const sum = actives.reduce((s, c) => s + qOf(c.name), 0);
  // 브랜드 월별 PR 상품 로드 (브랜드/월 변경 시)
  useEffect(() => { getBrandProducts(brand, month, d.brands).then(setProds).catch(() => setProds([])); }, [brand, month, d.brands]);
  function set(name: string, delta: number) {
    const a = d.assignments.find((x) => x.brandId === brand && x.creatorId === name && x.yearMonth === month);
    let finalQ = 0;
    if (a) { a.quota = Math.max(0, a.quota + delta); finalQ = a.quota; if (!a.quota) d.assignments.splice(d.assignments.indexOf(a), 1); }
    else if (delta > 0) { finalQ = delta; d.assignments.push({ id: `${brand}|${name}`, brandId: brand, creatorId: name, yearMonth: month, quota: delta }); }
    setTick((t) => t + 1);
    setAssignment(brand, name, month, finalQ, d.brands, d.creators).catch((e) => console.warn(e.message));
  }
  const diff = sum - target;
  return (<>
    <div className="filterbar">
      <select value={brand} onChange={(e) => setBrand(e.target.value)}>{(d.brands.length ? d.brands.map((x) => x.name) : ALL_BRANDS).map((b) => <option key={b} value={b}>{b}</option>)}</select>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.replace("-", ". ")}</option>)}</select>
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">번호순</option>
        <option value="name">이름순</option>
        <option value="assigned">배정 많은순</option>
      </select>
    </div>
    <div className={`assign-target ${diff === 0 ? "ok" : "over"}`}>
      <b>{brand}</b> · {month.slice(0, 4)}년 {+month.slice(5)}월 계약 <b>{target}</b>건 · 배정 합계 <b>{sum}</b>건 — {diff === 0 ? "계약과 일치" : diff > 0 ? `${diff}건 초과` : `${-diff}건 미배정`}
    </div>
    {prods.length > 0 && <div className="callout" style={{ background: "var(--surface-2)", marginBottom: 12 }}><div style={{ width: "100%" }}>
      <div className="t" style={{ fontSize: 12 }}>이 달 {brand} PR 상품 {prods.length}개</div>
      <div className="s" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {prods.map((p) => p.url
          ? <a key={p.id} href={p.url} target="_blank" rel="noopener" className="chip" style={{ textDecoration: "none" }}>{p.name} ↗</a>
          : <span key={p.id} className="chip">{p.name}</span>)}
      </div></div></div>}
    <div className="tablewrap"><table><thead><tr><th>크리에이터</th><th>{brand} 배정</th><th>완료</th><th>월 총배정/계약수량</th></tr></thead><tbody>
      {actives.map((c) => {
        const q = qOf(c.name); const tot = totalFor(c.name); const cap = capOf(c.name);
        const done = d.contents.filter((ct) => ct.brandId === brand && ct.creatorName === c.name && ct.status === "uploaded" && monthOf(ct) === month).length;
        const over = tot > cap;
        return (<tr key={c.id}><td><b>{withCode(c.name)}</b></td>
          <td><span className="qstep">
            <button onClick={() => set(c.name, -1)}>−</button>
            <input value={q} readOnly />
            <button onClick={() => set(c.name, 1)}>+</button>
          </span></td>
          <td className="num">{done}</td>
          <td className="num" style={{ color: over ? "var(--critical)" : "var(--muted)", fontWeight: over ? 600 : 400 }}>{tot}/{cap || "—"}{over ? " ⚠" : ""}</td></tr>);
      })}
    </tbody></table></div>
  </>);
}

/* 비용 관리 (단가 · 고정비 편집) */
function CostTable({ creators }: { creators: Creator[] }) {
  const [, setTick] = useState(0);
  const list = [...creators].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || (a.pic ?? 0) - (b.pic ?? 0));
  return (
    <div className="tablewrap"><table><thead><tr>
      <th>크리에이터</th><th>릴스 1건당</th><th>2차 활용</th><th>오프라인 방문 PR</th><th>월 고정비</th><th>월 예상(릴스)</th>
    </tr></thead><tbody>
      {list.map((c) => (
        <tr key={c.id}><td><b>{withCode(c.name)}</b></td>
          {(["reels", "secondary", "offline"] as const).map((k) => (
            <td key={k}><input className="rate-in" type="number" defaultValue={c.rates[k]} onChange={(e) => { c.rates[k] = +e.target.value || 0; setTick((t) => t + 1); }}
              onBlur={() => patchCreator(c.id, { rates: c.rates }).catch(() => { })} /></td>
          ))}
          <td><input className="rate-in" type="number" defaultValue={c.fixedCost} onChange={(e) => { c.fixedCost = +e.target.value || 0; setTick((t) => t + 1); }}
            onBlur={() => patchCreator(c.id, { fixed_cost: c.fixedCost }).catch(() => { })} /></td>
          <td className="num" style={{ fontWeight: 600 }}>{yen(c.rates.reels * (c.monthlyQuota ?? 0))}</td></tr>
      ))}
    </tbody></table></div>
  );
}

/* 크리에이터 인사이트 + AI 코치 */
function Insights({ creators, contents }: { creators: Creator[]; contents: Content[] }) {
  const actives = creators.filter((c) => c.status === "active");
  const [name, setName] = useState(actives[0]?.name ?? "hina");
  const [ai, setAi] = useState<{ t: string; s: string }[] | null>(null);
  const c = creators.find((x) => x.name === name)!;
  const series = growthSeries(name, c.followers);
  const pct = ((series[series.length - 1] - series[0]) / series[0] * 100);
  const aud = audienceOf(name);
  const ups = contents.filter((x) => x.creatorName === name && x.status === "uploaded" && x.views > 0);
  const avgEng = ups.length ? ups.reduce((s, x) => s + parseFloat(engRate(x)), 0) / ups.length : 0;
  const sel = { fontFamily: "var(--body)", fontSize: 13, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--ink)", fontWeight: 500 } as const;
  function runAI() {
    const cards: { t: string; s: string }[] = [];
    if (pct >= 40) cards.push({ t: "성장 가속 중", s: `최근 12주 팔로워 +${pct.toFixed(0)}%. 상위 성장세, 현재 포맷 유지·시리즈화 권장.` });
    else if (pct >= 15) cards.push({ t: "안정적 성장", s: `+${pct.toFixed(0)}% 성장. 업로드 빈도를 늘리면 곡선을 끌어올릴 수 있습니다.` });
    else cards.push({ t: "성장 정체", s: `+${pct.toFixed(0)}%. 새 훅·주제 실험, 트렌드 오디오 활용 권장.` });
    if (ups.length) { const best = [...ups].sort((a, b) => parseFloat(engRate(b)) - parseFloat(engRate(a)))[0]; cards.push({ t: "베스트 콘텐츠", s: `‘${best.product}’가 참여율 ${engRate(best)}로 최고. 유사 포맷 반복 추천.` }); }
    cards.push({ t: "오디언스 제안", s: `주 시청층 여성 ${aud.female}%·${aud.ages.slice().sort((a, b) => b[1] - a[1])[0][0]}, ${aud.regions[0][0]} 중심. 해당 층 주제 강화.` });
    setAi(cards);
  }
  return (<>
    <div className="filterbar"><select value={name} onChange={(e) => { setName(e.target.value); setAi(null); }}>{actives.map((x) => <option key={x.id} value={x.name}>{withCode(x.name)} · {x.handle}</option>)}</select></div>
    <div className="grid-kpi">
      <Kpi lab="팔로워" val={fmt(c.followers)} delta={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% (12주)`} dir={pct >= 0 ? "up" : "down"} spark={series.map((v) => v / 1000)} />
      <Kpi lab="순증 (12주)" val={`+${fmt(series[series.length - 1] - series[0])}`} />
      <Kpi lab="평균 참여율" val={avgEng.toFixed(1)} unit="%" /><Kpi lab="업로드" val={ups.length} unit="건" />
    </div>
    <div className="two">
      <div className="card pad"><div className="sec-h" style={{ margin: "0 0 6px" }}><h2>팔로워 추이</h2><span className="hint">{c.handle} · 최근 12주</span></div><div style={{ marginTop: 8 }}><Spark data={series} /></div></div>
      <div className="card pad"><div className="sec-h" style={{ margin: "0 0 14px" }}><h2>오디언스</h2></div>
        <div className="donut-wrap"><Donut pct={aud.female} label="여성" /><div className="legend"><div className="it"><span className="sw" style={{ background: "var(--accent)" }} />여성 <b className="num">{aud.female}%</b></div><div className="it"><span className="sw" style={{ background: "var(--surface-3)" }} />남성 <b className="num">{100 - aud.female}%</b></div></div></div>
        <div className="sec-h" style={{ margin: "18px 0 8px" }}><h2>연령대</h2></div>
        <Bars items={aud.ages} />
      </div>
    </div>
    <div className="card pad" style={{ marginTop: 18 }}>
      <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>✨ AI 성장 코치</h2><button className="btn acc" onClick={runAI}>분석 실행</button></div>
      {!ai ? <div className="note">‘분석 실행’을 누르면 성장률·아카이브 콘텐츠를 분석해 피드백과 추천을 제공합니다.</div>
        : ai.map((f, i) => <div key={i} className="ai-card"><span className="ic">★</span><div><div className="t">{f.t}</div><div className="s">{f.s}</div></div></div>)}
    </div>
    <div className="sec-h" style={{ marginTop: 22 }}><h2>{withCode(name)} 콘텐츠 아카이브</h2><span className="hint">이 크리에이터의 SNS 콘텐츠</span></div>
    <ContentArchive contents={contents.filter((x) => x.creatorName === name)} showCreator={false} />
  </>);
}

/* 계정·권한 */
function AccountsTable({ creators, brands }: { creators: Creator[]; brands?: Brand[] }) {
  const [, setTick] = useState(0);
  const [invite, setInvite] = useState(false);
  const accts = ACCOUNTS;
  const ROLE: Record<string, string> = { admin: "관리자", brand: "브랜드", creator: "크리에이터" };
  const ST: Record<string, [string, string]> = { active: ["p-ok", "활성"], pending: ["p-warn", "초대중"], disabled: ["p-plan", "비활성"] };
  return (<>
    <div className="sec-h" style={{ marginTop: 0 }}><h2>계정·권한</h2><button className="btn acc" onClick={() => setInvite(true)}>+ 계정 생성</button></div>
    <div className="tablewrap"><table><thead><tr><th>이메일</th><th>역할</th><th>소속</th><th>상태</th><th>마지막 로그인</th><th></th></tr></thead><tbody>
      {accts.map((a, i) => (
        <tr key={a.email}><td><b>{a.email}</b></td><td><span className={`pill ${a.role === "admin" ? "p-ok" : "p-plan"}`}><span className="d" />{ROLE[a.role]}</span></td>
          <td>{a.role === "admin" ? "81degree" : <span className="chip">{a.scope}</span>}</td>
          <td><span className={`pill ${ST[a.status][0]}`}><span className="d" />{ST[a.status][1]}</span></td>
          <td className="num" style={{ color: "var(--muted)" }}>{a.lastLogin ?? "—"}</td>
          <td style={{ textAlign: "right" }}><button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => { a.status = a.status === "disabled" ? "active" : "disabled"; setTick((t) => t + 1); }}>{a.status === "disabled" ? "활성화" : "비활성"}</button></td></tr>
      ))}
    </tbody></table></div>
    {invite && <InviteModal creators={creators} brands={brands} onClose={() => setInvite(false)} onSaved={() => setTick((t) => t + 1)} />}
  </>);
}

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function InviteModal({ onClose, onSaved, creators, brands }: { onClose: () => void; onSaved: () => void; creators: Creator[]; brands?: Brand[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "brand" | "creator">("brand");
  const [scope, setScope] = useState("abib");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const creatorNames = creators.map((c) => c.name);
  const brandNames = brands?.length ? brands.map((b) => b.name) : ALL_BRANDS;
  const scopes = role === "admin" ? ["81degree"] : role === "brand" ? brandNames : (creatorNames.length ? creatorNames : ["hina"]);
  const finalScope = role === "admin" ? "81degree" : scope;
  async function save() {
    if (!email.trim()) { setErr("이메일을 입력해주세요"); return; }
    if (password.length < 6) { setErr("비밀번호는 6자 이상"); return; }
    if (supabaseConfigured()) {
      setBusy(true); setErr("");
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { setErr("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)"); setBusy(false); return; }
      const res = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: email.trim(), role, scope: finalScope, password }),
      });
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(j.error || "생성 실패"); return; }
      setOk(true); onSaved();
      return;
    }
    ACCOUNTS.push({ email: email.trim(), role, scope: finalScope, status: "active", lastLogin: null });
    onSaved(); onClose();
  }
  return (
    <Modal title="계정 생성" onClose={onClose} width={440}
      footer={ok ? <button className="btn acc" onClick={onClose}>완료</button>
        : <><button className="btn" onClick={onClose}>취소</button><button className="btn acc" disabled={busy} onClick={save}>{busy ? "생성 중…" : "계정 생성"}</button></>}>
      {ok ? <div>
        <div className="note" style={{ color: "var(--accent-ink)", marginBottom: 12 }}>✓ 계정 생성 완료 — 아래 정보를 담당자에게 전달하세요.</div>
        <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.9 }}>
          <div>사이트: https://cc-os.81degree.com</div>
          <div>이메일: {email}</div>
          <div>비밀번호: {password}</div>
          <div>권한: {role === "brand" ? finalScope + " 브랜드" : role === "creator" ? finalScope + " 크리에이터" : "관리자"}</div>
        </div>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(`사이트: https://cc-os.81degree.com\n이메일: ${email}\n비밀번호: ${password}`)}>복사</button>
      </div> : <>
        <Field label="이메일"><input style={inp} type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Field label="역할"><select style={inp} value={role} onChange={(e) => { setRole(e.target.value as "admin" | "brand" | "creator"); }}><option value="admin">관리자</option><option value="brand">브랜드</option><option value="creator">크리에이터</option></select></Field>
          <Field label="소속"><select style={inp} value={scope} onChange={(e) => setScope(e.target.value)} disabled={role === "admin"}>{scopes.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="비밀번호 (담당자에게 전달)">
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn sm" onClick={() => setPassword(genPassword())}>자동생성</button>
          </div>
        </Field>
        <div style={{ fontSize: 12, color: "var(--faint)" }}>이메일 발송 없이 계정 생성 + 역할·소속 자동 연결. 생성 후 이메일·비번을 담당자에게 직접 전달하세요.</div>
        {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 10 }}>{err}</div>}
      </>}
    </Modal>
  );
}

// 계약 리스크 자동 감지 (실데이터 규칙) — 슬랙/이메일 알림의 공통 소스
export interface RiskItem { level: "critical" | "warning" | "info"; t: string; s: string }
export function computeRisks(d: Bundle): RiskItem[] {
  const now = new Date();
  const todayMonth = now.toISOString().slice(0, 7);
  const daysUntil = (ds?: string | null) => ds ? Math.round((new Date(ds).getTime() - now.getTime()) / 86400000) : null;
  const risks: RiskItem[] = [];
  // 1) Instagram 연동 이슈
  for (const c of d.creators) {
    if (c.ig?.status === "expired" || c.ig?.status === "revoked")
      risks.push({ level: "critical", t: `${withCode(c.name)} — Instagram 연동 ${c.ig.status === "expired" ? "만료" : "해지"}`, s: "자동 수집 중단. 재연동 요청 필요." });
    else { const du = daysUntil(c.ig?.expiresAt); if (du != null && du <= 14) risks.push({ level: du < 0 ? "critical" : "warning", t: `${withCode(c.name)} — IG 토큰 ${du < 0 ? "만료 경과" : `만료 D-${du}`}`, s: "연동 갱신이 필요합니다." }); }
  }
  // 2) 크리에이터 계약 종료 임박 (D-30)
  for (const c of d.creators) { const du = daysUntil(c.contractEnd); if (du != null && du <= 30) risks.push({ level: du < 0 ? "critical" : "warning", t: `${withCode(c.name)} — 계약 ${du < 0 ? "만료됨" : "종료 임박"} (${c.contractEnd})`, s: du < 0 ? "재계약 또는 정리 확인 필요." : `D-${du}. 재계약 검토 권장.` }); }
  // 3) 브랜드 계약 종료월 도래
  for (const b of d.brands) { if (b.contractEnd && b.contractEnd <= todayMonth) risks.push({ level: "warning", t: `${b.name} — 브랜드 계약 종료월 (${b.contractEnd})`, s: "연장 여부 확인이 필요합니다." }); }
  // 4) 이번 달 브랜드 배정 미달
  for (const b of d.brands) {
    if (b.monthlyQuota == null) continue;
    const inPeriod = (!b.contractStart || b.contractStart <= todayMonth) && (!b.contractEnd || b.contractEnd >= todayMonth);
    if (!inPeriod) continue;
    const assigned = d.assignments.filter((a) => a.brandId === b.name && a.yearMonth === todayMonth).reduce((s, a) => s + a.quota, 0);
    if (assigned < b.monthlyQuota) risks.push({ level: "warning", t: `${b.name} — ${+todayMonth.slice(5)}월 배정 미달 (${assigned}/${b.monthlyQuota})`, s: `${b.monthlyQuota - assigned}건 미배정. 배정 관리에서 채워주세요.` });
  }
  // 5) 납기 임박·경과 PR 안건
  for (const dl of d.deals) { if (dl.step >= 5) continue; const du = daysUntil(dl.dueDate); if (du != null && du <= 3) risks.push({ level: du < 0 ? "critical" : "warning", t: `${dl.title} · ${withCode(dl.creatorName)} — 납기 ${du < 0 ? "경과" : `D-${du}`}`, s: `${dl.client} · 현재 단계: ${DEAL_STEPS[dl.step]}` }); }
  const order = { critical: 0, warning: 1, info: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
}
function RiskList({ d }: { d: Bundle }) {
  const risks = computeRisks(d);
  const color: Record<string, string> = { critical: "var(--critical)", warning: "var(--warning)", info: "var(--muted)" };
  const label: Record<string, string> = { critical: "긴급", warning: "주의", info: "정보" };
  if (!risks.length) return <div className="placeholder">현재 감지된 계약 리스크가 없습니다. ✓</div>;
  return (<>
    <div className="grid-kpi" style={{ marginBottom: 16 }}>
      <Kpi lab="전체 리스크" val={String(risks.length)} />
      <Kpi lab="긴급" val={String(risks.filter((r) => r.level === "critical").length)} />
      <Kpi lab="주의" val={String(risks.filter((r) => r.level === "warning").length)} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {risks.map((r, i) => (<div key={i} className="card pad" style={{ borderLeft: `3px solid ${color[r.level]}` }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}><span className="chip" style={{ marginRight: 8, color: color[r.level] }}>{label[r.level]}</span>{r.t}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{r.s}</div></div>))}
    </div>
  </>);
}

/* ── DEAL LIST (admin & creator 공용) ───── */
const DEAL_STEPS = ["인입", "매니저 검토", "크리에이터 협의", "의뢰사 전달", "계약 성사", "제작·업로드"];
export function DealList({ deals, contents, readonly, creators }: { deals: Deal[]; contents: Content[]; readonly?: boolean; creators?: Creator[] }) {
  const [, setTick] = useState(0);
  const [edit, setEdit] = useState<Deal | null | undefined>(undefined);
  const [invoice, setInvoice] = useState<Deal | null>(null);
  const [fStep, setFStep] = useState(""); const [fManager, setFManager] = useState(""); const [fCreator, setFCreator] = useState(""); const [q, setQ] = useState("");
  const [fMonth, setFMonth] = useState(""); const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "step">("date_desc");
  const [view, setView] = useState<"list" | "card">("list");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const STEPS = DEAL_STEPS;
  const dealDate = (d: Deal) => d.uploadDate || d.dueDate || "";
  const dealMonth = (d: Deal) => dealDate(d).slice(0, 7);
  const managers = [...new Set(deals.map((d) => d.manager).filter(Boolean))] as string[];
  const dealCreators = [...new Set(deals.map((d) => d.creatorName))];
  const months = [...new Set(deals.map(dealMonth).filter(Boolean))].sort().reverse();
  let list = deals.filter((d) =>
    (fStep === "" || d.step === +fStep) && (!fManager || d.manager === fManager) && (!fCreator || d.creatorName === fCreator) &&
    (!fMonth || dealMonth(d) === fMonth) &&
    (!q || d.title.toLowerCase().includes(q.toLowerCase()) || d.client.toLowerCase().includes(q.toLowerCase())));
  list = [...list].sort((a, b) => {
    if (sortBy === "step") return b.step - a.step;
    const da = dealDate(a), db = dealDate(b);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1; // 날짜 없으면 뒤로
    return sortBy === "date_asc" ? da.localeCompare(db) : db.localeCompare(da);
  });
  // 단계별 요약
  const counts = STEPS.map((_, i) => deals.filter((d) => d.step === i).length);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = list.length > 0 && list.every((dl) => sel.has(dl.id));
  async function bulkDelete() {
    const targets = list.filter((dl) => sel.has(dl.id));
    if (!targets.length || !confirm(`선택한 ${targets.length}건의 PR 안건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try { for (const dl of targets) { await deleteDeal(dl.id); const i = deals.indexOf(dl); if (i >= 0) deals.splice(i, 1); } setSel(new Set()); setTick((t) => t + 1); }
    catch (e) { alert("삭제 실패: " + (e as Error).message); setTick((t) => t + 1); }
  }

  return (
    <>
      {!readonly && <div className="sec-h" style={{ marginTop: 0 }}><h2>PR 안건 관리</h2>
        <span style={{ display: "flex", gap: 8 }}>
          {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>선택 삭제 ({sel.size})</button>}
          <button className="btn" onClick={() => setView(view === "list" ? "card" : "list")}>{view === "list" ? "카드 보기" : "목록 보기"}</button>
          <button className="btn acc" onClick={() => setEdit(null)}>+ 안건 추가</button>
        </span></div>}
      {!readonly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button className={`chip ${fStep === "" ? "p-acc" : ""}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setFStep("")}>전체 {deals.length}</button>
          {STEPS.map((s, i) => (
            <button key={i} className={`chip ${fStep === String(i) ? "p-acc" : ""}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setFStep(fStep === String(i) ? "" : String(i))}>{s} {counts[i]}</button>
          ))}
        </div>
      )}
      {!readonly && (
        <div className="filterbar">
          <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">전체 월</option>{months.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}월</option>)}</select>
          <select value={fManager} onChange={(e) => setFManager(e.target.value)}><option value="">전체 매니저</option>{managers.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <select value={fCreator} onChange={(e) => setFCreator(e.target.value)}><option value="">전체 크리에이터</option>{dealCreators.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date_desc">최신 날짜순</option>
            <option value="date_asc">오래된 날짜순</option>
            <option value="step">진행 단계순</option>
          </select>
          <input placeholder="안건·의뢰사 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{list.length}건</span>
        </div>
      )}
      {!list.length ? <div className="placeholder">조건에 맞는 PR 안건이 없어요.</div> :
       view === "list" ? (
        <div className="tablewrap"><table><thead><tr>
          {!readonly && <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map((dl) => dl.id)))} aria-label="전체 선택" /></th>}
          <th>안건</th><th>의뢰사</th><th>크리에이터</th><th>담당</th><th>단계</th><th>PR 비용</th><th>납기</th>{!readonly && <th></th>}
        </tr></thead><tbody>
          {list.map((dl) => (
            <tr key={dl.id} style={!readonly && sel.has(dl.id) ? { background: "var(--accent-weak)" } : undefined}>
              {!readonly && <td><input type="checkbox" checked={sel.has(dl.id)} onChange={() => toggle(dl.id)} aria-label={`${dl.title} 선택`} /></td>}
              <td><b style={{ cursor: readonly ? "default" : "pointer" }} onClick={() => !readonly && setEdit(dl)}>{dl.title}</b> <span className={`chip ${dl.type === "ahchannel" ? "p-acc" : ""}`}>{dl.type === "ahchannel" ? "ah!channel" : "개별"}</span></td>
              <td style={{ color: "var(--muted)" }}>{dl.client}</td>
              <td>{withCode(dl.creatorName)}</td>
              <td style={{ color: "var(--muted)" }}>{dl.manager}</td>
              <td><span className={`pill ${dl.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{STEPS[dl.step]}</span></td>
              <td className="num">{yen(dl.fee)}</td>
              <td className="num" style={{ color: "var(--muted)" }}>{md(dl.dueDate ?? undefined)}</td>
              {!readonly && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {dl.step < 5 && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => { dl.step++; setTick((t) => t + 1); setDealStep(dl.id, dl.step).catch(() => { }); }}>다음 →</button>}
                <button className="btn sm" onClick={() => setEdit(dl)}>수정</button>
              </td>}
            </tr>
          ))}
        </tbody></table></div>
       ) :
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {list.map((dl) => {
        const ct = dl.contentId ? contents.find((c) => c.id === dl.contentId) : null;
        return (
          <div key={dl.id} className="srow" style={{ marginBottom: 0 }}>
            {!readonly && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--faint)", marginBottom: 6 }}>
              <input type="checkbox" checked={sel.has(dl.id)} onChange={() => toggle(dl.id)} /> 선택</label>}
            <div className="hd">
              <Avatar name={dl.client} size={36} radius={9} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{dl.title} <span className={`chip ${dl.type === "ahchannel" ? "p-acc" : ""}`} style={{ marginLeft: 4 }}>{dl.type === "ahchannel" ? "ah!channel" : "개별"}</span></div>
                <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 2 }}>{dl.client} · {withCode(dl.creatorName)} · 담당 {dl.manager}</div>
              </div>
              <span className={`pill ${dl.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{STEPS[dl.step]}</span>
            </div>
            {dl.brief && <div className="callout" style={{ background: "var(--surface-2)", marginTop: 12 }}><div><div className="t" style={{ fontSize: 12 }}>요청 콘텐츠 브리핑</div><div className="s">{dl.brief}</div></div></div>}
            <div className="stepper">
              {STEPS.map((s, i) => { const cls = i < dl.step ? "done" : i === dl.step ? "now" : "";
                return <div className={`step ${cls}`} key={i}><span className="dot">{i < dl.step ? "✓" : i + 1}</span><span className="lbl">{s}</span>{i < STEPS.length - 1 && <span className="line" />}</div>; })}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 22, fontSize: 12.5 }}>
              <span>PR 비용 <b className="num">{yen(dl.fee)}</b></span>
              <span>쉐어 <b className="num">{dl.shareCompany}:{dl.shareCreator}</b></span>
              <span>납기 <b className="num">{md(dl.dueDate ?? undefined)}</b></span>
              <span>업로드 <b className="num">{md(dl.uploadDate ?? undefined)}</b></span>
            </div>
            {ct && <div className="note" style={{ marginTop: 10 }}>업로드 콘텐츠: {ct.permalink ? <a href={ct.permalink} target="_blank" rel="noopener" style={{ color: "var(--accent-ink)" }}>{ct.permalink}</a> : "—"} · 조회 <b className="num">{fmt(ct.views)}</b></div>}
            {!readonly && <div className="frow" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              {dl.step >= 4 && <button className="btn sm" onClick={() => setInvoice(dl)}>청구서</button>}
              {dl.step < 5 && <button className="btn acc sm" onClick={() => { dl.step++; setTick((t) => t + 1); setDealStep(dl.id, dl.step).catch(() => { }); }}>다음 단계 →</button>}
              <button className="btn sm" onClick={() => setEdit(dl)}>수정</button>
            </div>}
          </div>
        );
      })}
    </div>}
    {edit !== undefined && <DealEditModal deal={edit} deals={deals} contents={contents} creators={creators ?? []} onClose={() => setEdit(undefined)} onSaved={() => setTick((t) => t + 1)} />}
    {invoice && <InvoiceModal deal={invoice} onClose={() => setInvoice(null)} />}
  </>
  );
}

function InvoiceModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const compRev = Math.round(deal.fee * deal.shareCompany / 100);
  const crRev = Math.round(deal.fee * deal.shareCreator / 100);
  const no = `INV-${deal.code ?? deal.id.slice(0, 6)}`;
  return (
    <Modal title="청구서" onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>닫기</button><button className="btn acc" onClick={() => window.print()}>인쇄 / PDF 저장</button></>}>
      <div id="invoice" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 24, background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--accent)" }}>81&apos;DEGREE</div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>81degree.inc</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, fontSize: 18 }}>청구서 / INVOICE</div>
            <div className="num" style={{ fontSize: 12, color: "var(--faint)" }}>{no}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 18 }}>
          <div><span style={{ color: "var(--faint)" }}>To (의뢰사)</span><div style={{ fontWeight: 600 }}>{deal.client}</div></div>
          <div><span style={{ color: "var(--faint)" }}>발행일</span><div className="num">{deal.uploadDate || "2026-08-23"}</div></div>
          <div><span style={{ color: "var(--faint)" }}>크리에이터</span><div>{withCode(deal.creatorName)}</div></div>
          <div><span style={{ color: "var(--faint)" }}>담당</span><div>{deal.manager}</div></div>
        </div>
        <table style={{ minWidth: 0 }}><thead><tr><th>항목</th><th style={{ textAlign: "right" }}>금액</th></tr></thead>
          <tbody>
            <tr><td>{deal.title} (PR 콘텐츠 제작)</td><td className="num" style={{ textAlign: "right" }}>{yen(deal.fee)}</td></tr>
          </tbody></table>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--faint)" }}>합계 (PR 비용)</span><b className="num">{yen(deal.fee)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--faint)" }}><span>쉐어 (회사 {deal.shareCompany}% / 크리에이터 {deal.shareCreator}%)</span><span className="num">회사 {yen(compRev)} · 크리 {yen(crRev)}</span></div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--faint)" }}>
          입금 계좌 / 문의: hmpark@81degree.com · 본 청구서는 데모 샘플입니다.
        </div>
      </div>
    </Modal>
  );
}

function DealEditModal({ deal, deals, contents, creators, onClose, onSaved }: { deal: Deal | null; deals: Deal[]; contents: Content[]; creators: Creator[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !deal;
  const [f, setF] = useState<Deal>(deal ? { ...deal } : {
    id: "D-" + (100 + deals.length + 1), title: "", client: "", creatorName: creators[0]?.name ?? "hina",
    manager: "mai", source: "company_email", type: "ahchannel", fee: 1000000, shareCompany: 50, shareCreator: 50, step: 0,
  });
  const existingContent = deal?.contentId ? contents.find((c) => c.id === deal.contentId) : null;
  const [contentUrl, setContentUrl] = useState(existingContent?.permalink ?? "");
  const up = (k: keyof Deal, v: unknown) => setF((s) => ({ ...s, [k]: v } as Deal));
  async function save() {
    try {
      let target: Deal;
      if (deal) { const saved = await saveDeal(f, false, creators); Object.assign(deal, saved); target = deal; }
      else { const saved = await saveDeal(f, true, creators); deals.unshift(saved); target = saved; }
      // 완료 콘텐츠 URL 입력 시 콘텐츠 생성/링크
      if (contentUrl.trim() && !existingContent) {
        const ct = await createDealContent(target, contentUrl.trim(), creators);
        contents.push(ct); target.contentId = ct.id;
      } else if (contentUrl.trim() && existingContent) {
        existingContent.permalink = contentUrl.trim();
      }
      onSaved(); onClose();
    } catch (e) { alert("저장 실패: " + (e as Error).message); }
  }
  async function del() {
    if (!deal) return;
    try { await deleteDeal(deal.id); const i = deals.indexOf(deal); if (i >= 0) deals.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert("삭제 실패: " + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? "PR 안건 추가" : "PR 안건 수정"} onClose={onClose}
      footer={<>{!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>삭제</button>}
        <button className="btn" onClick={onClose}>취소</button><button className="btn acc" onClick={save}>저장</button></>}>
      <Field label="안건명"><input style={inp} value={f.title} onChange={(e) => up("title", e.target.value)} /></Field>
      <Field label="요청사 콘텐츠 브리핑"><textarea style={{ ...inp, minHeight: 64 }} value={f.brief ?? ""} onChange={(e) => up("brief", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="안건 유형"><select style={inp} value={f.type} onChange={(e) => up("type", e.target.value)}><option value="ahchannel">ah!channel 인입</option><option value="creator">크리에이터 개별</option></select></Field>
        <Field label="의뢰 회사"><input style={inp} value={f.client} onChange={(e) => up("client", e.target.value)} /></Field>
        <Field label="크리에이터"><select style={inp} value={f.creatorName} onChange={(e) => up("creatorName", e.target.value)}>{creators.map((c) => <option key={c.id} value={c.name}>{withCode(c.name)}</option>)}</select></Field>
        <Field label="담당 매니저"><select style={inp} value={f.manager} onChange={(e) => up("manager", e.target.value)}><option value="mai">mai</option><option value="yuta">yuta</option></select></Field>
        <Field label="인입 경로"><select style={inp} value={f.source} onChange={(e) => up("source", e.target.value)}><option value="creator_email">크리에이터 이메일</option><option value="creator_dm">인스타 DM</option><option value="company_email">회사 이메일</option></select></Field>
        <Field label="PR 비용 (¥)"><input style={inp} type="number" value={f.fee} onChange={(e) => up("fee", +e.target.value)} /></Field>
        <Field label="회사 쉐어 (%)"><input style={inp} type="number" value={f.shareCompany} onChange={(e) => up("shareCompany", +e.target.value)} /></Field>
        <Field label="크리에이터 쉐어 (%)"><input style={inp} type="number" value={f.shareCreator} onChange={(e) => up("shareCreator", +e.target.value)} /></Field>
        <Field label="진행 단계"><select style={inp} value={f.step} onChange={(e) => up("step", +e.target.value)}>{DEAL_STEPS.map((s, i) => <option key={i} value={i}>{i + 1}. {s}</option>)}</select></Field>
        <Field label="납기일"><input style={inp} type="date" value={f.dueDate ?? ""} onChange={(e) => up("dueDate", e.target.value)} /></Field>
        <Field label="업로드 일자"><input style={inp} type="date" value={f.uploadDate ?? ""} onChange={(e) => up("uploadDate", e.target.value)} /></Field>
      </div>
      <Field label="완료 콘텐츠 URL (permalink)">
        <input style={inp} placeholder="https://www.instagram.com/reel/..." value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} />
      </Field>
      <div style={{ fontSize: 12, color: "var(--faint)" }}>업로드된 콘텐츠 URL을 넣으면 아카이브에 자동 등록되고 안건에 연결됩니다.</div>
    </Modal>
  );
}

/* ── BRAND ─────────────────────────────── */
export function BrandView({ pane, d, scope }: { pane: string; d: Bundle; scope: string }) {
  registerCreatorCodes(d.creators);
  const rows = d.contents.filter((c) => c.brandId === scope && c.status === "uploaded" && c.views > 0);
  if (pane === "b-dash") {
    const tv = rows.reduce((s, c) => s + c.views, 0), tr = rows.reduce((s, c) => s + c.reach, 0), ts = rows.reduce((s, c) => s + c.saves, 0);
    const engAvg = rows.length ? (rows.reduce((s, c) => s + parseFloat(engRate(c)), 0) / rows.length).toFixed(1) : "0";
    const upcoming = d.contents.filter((c) => c.brandId === scope && c.status === "planned")
      .sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    // 계약 진척 (배정 대비 완료)
    const bAsg = d.assignments.filter((a) => a.brandId === scope && a.yearMonth === "2026-08");
    const bQ = bAsg.reduce((s, a) => s + a.quota, 0);
    const bDone = bAsg.reduce((s, a) => s + d.contents.filter((c) => c.brandId === scope && c.creatorName === a.creatorId && c.status === "uploaded" && monthOf(c) === "2026-08").length, 0);
    const byCr: Record<string, number> = {};
    rows.forEach((c) => { byCr[c.creatorName] = (byCr[c.creatorName] ?? 0) + c.views; });
    const sched = d.contents.filter((c) => c.brandId === scope && (c.status === "planned" || monthOf(c) === "2026-08")).sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    return (<>
      <div className="banner">✦ 자동 수집 기준 · 확정 성과는 게시 후 D+7 스냅샷입니다. 실시간 값과 다를 수 있어요.</div>
      <div className="grid-kpi">
        <Kpi lab="총 조회수" val={fmt(tv)} delta="18.2% vs 지난달" dir="up" spark={SPK.views} />
        <Kpi lab="총 도달" val={fmt(tr)} delta="12.4%" dir="up" spark={SPK.reach} />
        <Kpi lab="평균 참여율" val={engAvg} unit="%" delta="0.3%p" dir="up" spark={SPK.eng} />
        <Kpi lab="저장 합계" val={fmt(ts)} spark={SPK.save} />
      </div>
      <div className="two">
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>업로드 예정</h2><span className="hint">마감 임박순</span></div>
          <div className="list">
            {upcoming.slice(0, 5).map((c, i) => (
              <div className="li" key={c.id}><Avatar name={c.creatorName} size={34} radius={9} />
                <div className="main"><div className="t">{c.product}</div><div className="s">{withCode(c.creatorName)} · {c.brandName}</div></div>
                <div className="r"><span className={`pill ${i < 2 ? "p-warn" : "p-plan"}`}><span className="d" />{["D-2", "D-4", "D-6", "D-8", "D-9"][i] ?? "D-9"}</span></div></div>
            ))}
            {!upcoming.length && <div className="empty" style={{ border: 0 }}>예정 콘텐츠 없음</div>}
          </div>
        </div>
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 14px" }}><h2>이번 달 계약 진척</h2></div>
          <div className="ring-wrap" style={{ marginBottom: 18 }}>
            <Ring p={bQ ? Math.round(bDone / bQ * 100) : 0} label={`${bDone}/${bQ}`} />
            <div><div style={{ fontWeight: 600 }}>{bQ}건 배정 중 {bDone}건 게시</div>
              <div className="note">남은 {Math.max(0, bQ - bDone)}건 · 8월 배정 기준</div></div>
          </div>
          <div className="list">
            {Object.entries(byCr).map(([n, v]) => (
              <div className="li" key={n}><Avatar name={n} size={34} radius={9} />
                <div className="main"><div className="t">{n}</div><div className="s">{rows.filter((c) => c.creatorName === n).length}건 게시</div></div>
                <div className="r"><div className="n">{kfmt(v)}</div><div className="u">조회</div></div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="sec-h"><h2>이번 달 제작 일정</h2><span className="hint"><span className="synced">🔄 크리에이터 입력 실시간 반영</span></span></div>
      <ScheduleRows items={sched} />
    </>);
  }
  if (pane === "b-roster") return <CreatorDirectory creators={d.creators.filter((c) => c.status === "active")} allContents={d.contents} />;
  if (pane === "b-creators") return <BrandCreatorTable rows={rows} allContents={d.contents.filter((c) => c.brandId === scope)} />;
  if (pane === "b-archive") return <ContentArchive contents={d.contents.filter((c) => c.brandId === scope)} showBrand={false} />;
  if (pane === "b-secondary") return <SecondaryList />;
  return <Placeholder name={pane} />;
}

function SecondaryList() {
  const rows = [
    { p: "ヒアルロニックブームセラム", c: "hina", scope: "광고 소재", step: 3 },
    { p: "アビブ ガムシートマスク", c: "rui", scope: "자사 SNS 리그램", step: 2 },
    { p: "ヒアルロニックブームクリーム", c: "merumi", scope: "오프라인 매장", step: 1 },
  ];
  const STEPS = ["요청", "81degree 검토", "크리에이터 동의", "승인"];
  return (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {rows.map((r, i) => (
      <div key={i} className="card pad">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={r.c} size={34} radius={9} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{r.p}</div><div style={{ color: "var(--faint)", fontSize: 12 }}>{r.c} · {r.scope}</div></div>
          <span className={`pill ${r.step >= 3 ? "p-ok" : "p-warn"}`}><span className="d" />{STEPS[r.step]}</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, fontSize: 11.5 }}>
          {STEPS.map((s, si) => (<span key={si} style={{ flex: 1, textAlign: "center", padding: "5px 4px", borderRadius: 7, background: si < r.step ? "var(--accent-weak)" : si === r.step ? "var(--accent-weak)" : "var(--surface-2)", color: si <= r.step ? "var(--accent-ink)" : "var(--faint)", fontWeight: si <= r.step ? 600 : 400 }}>{si < r.step ? "✓ " : ""}{s}</span>))}
        </div>
      </div>
    ))}
  </div>);
}

function BrandCreatorTable({ rows, allContents }: { rows: Content[]; allContents?: Content[] }) {
  const [month, setMonth] = useState("");
  const [creator, setCreator] = useState("");
  const [open, setOpen] = useState<string>("");
  const months = [...new Set(rows.map(monthOf).filter(Boolean))].sort().reverse() as string[];
  const creatorNames = [...new Set(rows.map((c) => c.creatorName))];
  let f = rows;
  if (month) f = f.filter((c) => monthOf(c) === month);
  if (creator) f = f.filter((c) => c.creatorName === creator);
  const byCr: Record<string, { v: number; s: number; cnt: number; eng: number }> = {};
  f.forEach((c) => { (byCr[c.creatorName] ??= { v: 0, s: 0, cnt: 0, eng: 0 }); const b = byCr[c.creatorName]; b.v += c.views; b.s += c.saves; b.eng += parseFloat(engRate(c)); b.cnt++; });
  const entries = Object.entries(byCr).sort((a, b) => b[1].v - a[1].v);
  return (<>
    <div className="filterbar">
      <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">전체 기간</option>{months.map((m) => <option key={m} value={m}>{+m.slice(5)}월</option>)}</select>
      <select value={creator} onChange={(e) => setCreator(e.target.value)}><option value="">모든 크리에이터</option>{creatorNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      <span className="count">{entries.length}명</span>
    </div>
    <div className="tablewrap"><table><thead><tr>
      <th>크리에이터</th><th>게시</th><th>총 조회</th><th>평균 저장률</th><th>평균 참여율</th>
    </tr></thead><tbody>
      {entries.length ? entries.map(([n, b]) => (
        <tr key={n} style={{ cursor: "pointer" }} onClick={() => setOpen(open === n ? "" : n)} title={`${n} 콘텐츠 보기`}>
          <td><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar name={n} size={26} radius={8} /><b>{n}</b> <span style={{ color: "var(--faint)" }}>›</span></span></td>
          <td className="num">{b.cnt}</td><td className="num">{fmt(b.v)}</td>
          <td className="num">{(b.s / b.v * 100).toFixed(1)}%</td><td className="num">{(b.eng / b.cnt).toFixed(1)}%</td></tr>
      )) : <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--faint)", padding: 24 }}>데이터 없음</td></tr>}
    </tbody></table></div>
    {open && allContents && <div style={{ marginTop: 18 }}>
      <div className="sec-h"><h2>{open} · 콘텐츠</h2></div>
      <ContentArchive contents={allContents.filter((c) => c.creatorName === open)} showCreator={false} showBrand={false} />
    </div>}
  </>);
}

function CreatorDirectory({ creators, allContents }: { creators: Creator[]; allContents?: Content[] }) {
  const [cat, setCat] = useState(""); const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>("");
  const cats = [...new Set(creators.map((c) => c.category).filter(Boolean))] as string[];
  let list = [...creators].sort((a, b) => b.followers - a.followers);
  if (cat) list = list.filter((c) => c.category === cat);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.handle ?? "").toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div className="filterbar">
      <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">모든 카테고리</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <input placeholder="이름·핸들 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="count">{list.length}명</span>
    </div>
    <div className="crgrid">
      {list.map((c) => (
        <div key={c.id} className="crcard">
          <div className="top">
            <Avatar creator={c} size={46} radius={13} />
            <div style={{ minWidth: 0 }}><div className="nm">{withCode(c.name)}</div><div className="hd">{c.handle}</div></div>
            <div className="fol"><b>{kfmt(c.followers)}</b><small>팔로워</small></div>
          </div>
          <div><SnsBadges c={c} /></div>
          <div className="tags">
            {c.category && <span className="chip"><span className="sw" style={{ background: "var(--accent)" }} />{c.category}</span>}
            {c.tone && <span className="chip">{c.tone}</span>}
          </div>
          <div className="intro">{c.intro}</div>
          <div style={{ display: "flex", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => setOpen(open === c.name ? "" : c.name)}>▶ 콘텐츠 보기</button>
          </div>
        </div>
      ))}
    </div>
    {open && allContents && <div style={{ marginTop: 18 }}>
      <div className="sec-h"><h2>{open} · 콘텐츠</h2></div>
      <ContentArchive contents={allContents.filter((c) => c.creatorName === open)} showCreator={false} showBrand={false} />
    </div>}
  </>);
}

/* ── CREATOR ───────────────────────────── */
export function CreatorView({ pane, d, scope }: { pane: string; d: Bundle; scope: string }) {
  registerCreatorCodes(d.creators);
  const me = scope;
  const mine = d.contents.filter((c) => c.creatorName === me);
  if (pane === "c-growth") {
    const cr = d.creators.find((x) => x.name === me)!;
    const monthViews = mine.filter((c) => c.views).reduce((s, c) => s + c.views, 0);
    const series = growthSeries(me, cr?.followers ?? 0);
    const aud = audienceOf(me);
    const maxAge = Math.max(...aud.ages.map((a) => a[1]));
    return (<>
      <div className="grid-kpi">
        <Kpi lab="팔로워" val={fmt(cr?.followers ?? 0)} delta={`+${fmt(series[series.length - 1] - series[series.length - 4])} (30일)`} dir="up" spark={SPK.fol} />
        <Kpi lab="이번 달 조회" val={fmt(monthViews)} delta="24%" dir="up" spark={SPK.views} />
        <Kpi lab="평균 저장률" val="1.9" unit="%" delta="0.2%p" dir="up" spark={[1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.9]} />
        <Kpi lab="업로드" val={mine.filter((c) => c.status === "uploaded").length} unit="건" />
      </div>
      <div className="two">
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 6px" }}><h2>팔로워 추이</h2><span className="hint">{cr?.handle} · 최근 12주</span></div>
          <div style={{ marginTop: 8 }}><Spark data={series} /></div>
        </div>
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 14px" }}><h2>오디언스 · 성별</h2></div>
          <div className="donut-wrap"><Donut pct={aud.female} label="여성" />
            <div className="legend"><div className="it"><span className="sw" style={{ background: "var(--accent)" }} />여성 <b className="num">{aud.female}%</b></div>
              <div className="it"><span className="sw" style={{ background: "var(--surface-3)" }} />남성 <b className="num">{100 - aud.female}%</b></div></div>
          </div>
          <div className="sec-h" style={{ margin: "18px 0 8px" }}><h2>연령대</h2></div>
          <div className="bars">{aud.ages.map(([l, v]) => (<div className="bar" key={l}><span>{l}</span><div className="track"><div className="fill" style={{ width: `${v / maxAge * 100}%` }} /></div><span className="pct">{v}%</span></div>))}</div>
        </div>
      </div>
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>주요 지역</h2></div>
        <div className="row">{aud.regions.map(([r, v]) => (<span className="chip" key={r}><span className="sw" style={{ background: "var(--accent)" }} />{r} {v}%</span>))}</div>
      </div>
      <div className="sec-h"><h2>내 콘텐츠 아카이브</h2><span className="hint">최근 게시물 · 클릭하면 재생</span></div>
      <ContentArchive contents={mine} showCreator={false} showBrand={false} />
    </>);
  }
  if (pane === "c-deals") return <DealList deals={d.deals.filter((x) => x.creatorName === me)} contents={d.contents} readonly />;
  if (pane === "c-revenue") {
    const my = d.deals.filter((x) => x.creatorName === me);
    return (
      <div className="tablewrap"><table><thead><tr>
        <th>안건</th><th>유형</th><th>PR 비용</th><th>내 쉐어</th><th>내 정산</th><th>상태</th>
      </tr></thead><tbody>
        {my.map((x) => (
          <tr key={x.id}><td><b>{x.title}</b></td><td><span className="chip">{x.type === "ahchannel" ? "ah!channel" : "개별"}</span></td>
            <td className="num">{yen(x.fee)}</td><td className="num">{x.shareCreator}%</td>
            <td className="num" style={{ fontWeight: 600, color: x.step >= 4 ? "var(--accent-ink)" : "var(--muted)" }}>{yen(x.fee * x.shareCreator / 100)}</td>
            <td><span className={`pill ${x.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{x.step >= 4 ? "정산 대상" : "진행중"}</span></td></tr>
        ))}
      </tbody></table></div>
    );
  }
  if (pane === "c-content") return <ContentArchive contents={mine} showCreator={false} />;
  if (pane === "c-todo") return <CreatorTodo d={d} me={me} />;
  return <Placeholder name={pane} />;
}

function CreatorTodo({ d, me }: { d: Bundle; me: string }) {
  const asg = d.assignments.filter((a) => a.creatorId === me && a.yearMonth === "2026-08")
    .map((a) => {
      const done = d.contents.filter((c) => c.brandId === a.brandId && c.creatorName === me && c.status === "uploaded" && monthOf(c) === "2026-08").length;
      return { brand: a.brandId, q: a.quota, done };
    });
  const totalQ = asg.reduce((s, a) => s + a.q, 0), totalDone = asg.reduce((s, a) => s + a.done, 0);
  const sched = d.contents.filter((c) => c.creatorName === me && (c.status === "planned" || monthOf(c) === "2026-08"))
    .sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
  return (<>
    <div className="card pad" style={{ marginBottom: 18 }}>
      <div className="ring-wrap" style={{ marginBottom: 6 }}>
        <Ring p={totalQ ? Math.round(totalDone / totalQ * 100) : 0} label={`${totalDone}/${totalQ}`} />
        <div><div style={{ fontWeight: 600, fontSize: 15 }}>이번 달 배정 {totalQ}건 중 {totalDone}건 완료</div>
          <div className="note">남은 {Math.max(0, totalQ - totalDone)}건 · 관리자가 배정한 브랜드별 편수</div></div>
      </div>
    </div>
    <div className="sec-h"><h2>제작 일정</h2><span className="hint">기획·촬영·편집·업로드 예정일</span></div>
    <ScheduleRows items={sched} />
    <div className="sec-h"><h2>브랜드별 진행</h2></div>
    <div className="list card pad">
      {asg.map((a) => (<div className="li" key={a.brand}><Avatar name={a.brand!} size={34} radius={9} />
        <div className="main"><div className="t">{a.brand}</div><div className="s">{a.done}/{a.q} 완료</div></div>
        <div className="r"><span className={`pill ${a.done >= a.q ? "p-ok" : "p-plan"}`}><span className="d" />{a.done >= a.q ? "완료" : "진행중"}</span></div></div>))}
    </div>
  </>);
}


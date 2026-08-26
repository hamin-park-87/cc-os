"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import type { Brand, BrandProduct, Creator, Content, ContentSched, Deal, Contract, Assignment } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Modal, Field, inp } from "./Modal";
import { ContentArchive } from "./ContentArchive";
import { Spark, MiniSpark, Donut, Bars, growthSeries, audienceOf } from "./charts";
import { fmt, kfmt, yen, engRate, monthOf, CREATOR_STATUS_LABEL, registerCreatorCodes, withCode, creatorCode, localDT } from "@/lib/format";
import { UNIT_PRICE, ALL_BRANDS, BRAND_COLOR, accounts as ACCOUNTS } from "@/lib/data/seed";
import { supabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { saveCreator, deleteCreator, patchCreator, saveDeal, deleteDeal, setDealStep, setAssignment, createDealContent, saveBrand, deleteBrand, getBrandProducts, addBrandProduct, deleteBrandProduct, getProductAssignments, setProductAssignment, getSecondaryRequests, createSecondaryRequest, setSecondaryStatus, setCreatorConsent, tagContentBrand, getAccounts, type AccountRow, setBrandMonthly, createPlannedContent, updateContentSchedule, updateDealSchedule, deleteContent, uploadAttachment, patchContentFields } from "@/lib/data/writes";
import type { SecondaryReq, SecondaryScope } from "@/lib/types";
import { SECONDARY_SCOPE_LABEL } from "@/lib/types";
import { isMaster, displayId } from "@/lib/roles";
import { T } from "@/lib/i18n";

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
  <div className="placeholder">{name} — {T("화면 구현 예정 (프로토타입 참고)")}</div>
);
const statusPill = (s: Creator["status"]) => {
  const cls = s === "active" ? "p-ok" : s === "preparing" ? "p-acc" : "p-plan";
  return <span className={`pill ${cls}`}><span className="d" />{CREATOR_STATUS_LABEL[s]}</span>;
};
const md = (dt?: string) => dt ? `${+dt.slice(5, 7)}/${+dt.slice(8, 10)}` : "—";

function Ring({ p, label }: { p: number; label: string }) {
  return <div className="ring" style={{ ["--p" as string]: p }}><b>{label}</b></div>;
}

const STAGES: [keyof Content["sched"], string][] = [["plan", T("기획")], ["shoot", T("촬영")], ["edit", T("편집")], ["upload", T("업로드")]];
function ScheduleRows({ items }: { items: Content[] }) {
  if (!items.length) return <div className="empty">{T("예정된 제작 일정이 없어요.")}</div>;
  return (<>{items.map((c) => {
    let currentSet = false;
    return (
      <div className="schedrow" key={c.id}>
        <div className="hd">
          <Avatar name={c.creatorName} size={34} radius={9} />
          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{c.product}</div><div className="s">{withCode(c.creatorName)} · {c.brandName}</div></div>
          {c.status === "uploaded" ? <span className="pill p-ok"><span className="d" />{T("완료")}</span> : <span className="pill p-warn"><span className="d" />{T("업로드")} {md(c.sched.upload)}</span>}
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
// 크리에이터 번호순 정렬 헬퍼 (어드민 전반 통일)
const codeRank = (code?: string | null) => { const m = code?.match(/\d+/); return m ? +m[0] : Infinity; };
const cmpCreatorByCode = (a: Creator, b: Creator) => codeRank(a.code) - codeRank(b.code) || a.name.localeCompare(b.name);
const cmpNameByCode = (a: string, b: string) => codeRank(creatorCode(a)) - codeRank(creatorCode(b)) || a.localeCompare(b);

export function AdminView({ pane, d, month, email }: { pane: string; d: Bundle; month: string; email?: string }) {
  registerCreatorCodes(d.creators);
  if (pane === "a-matrix") {
    const active = d.creators.filter((c) => c.status === "active").length;
    const issues = d.creators.filter((c) => c.ig?.status === "expired" || c.ig?.status === "revoked").length;
    const asg = d.assignments.filter((a) => a.yearMonth === month);
    const totQ = asg.reduce((s, a) => s + a.quota, 0);
    const totDone = asg.reduce((s, a) => s + d.contents.filter((c) => c.brandId === a.brandId && c.creatorName === a.creatorId && c.status === "uploaded" && monthOf(c) === month).length, 0);
    const crs = [...new Set(asg.map((a) => a.creatorId))].sort(cmpNameByCode);
    const cellStyle = (r: number) => r >= 1 ? ["var(--success-weak)", "var(--success)"] : r > 0 ? ["var(--warning-weak)", "var(--warning)"] : ["var(--critical-weak)", "var(--critical)"];
    const sched = d.contents.filter((c) => c.status === "planned").sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    return (
      <>
        <div className="grid-kpi">
          <Kpi lab={T("전체 이행률")} val={totQ ? Math.round(totDone / totQ * 100) : 0} unit="%" />
          <Kpi lab={T("활성 크리에이터")} val={active} unit={T("명")} />
          <Kpi lab={T("진행 PR 안건")} val={d.deals.length} unit={T("건")} />
          <Kpi lab={T("연동 이슈")} val={issues} unit={T("계정")} />
        </div>
        <div className="sec-h"><h2>{T("이행률 매트릭스")}</h2><span className="hint">{T("완료 / 배정")}</span></div>
        <div className="tablewrap"><table><thead><tr><th>{T("브랜드 \\ 크리에이터")}</th>{crs.map((c) => <th key={c} style={{ textAlign: "center" }}>{creatorCode(c) && <div style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600 }}>{creatorCode(c)}</div>}{c}</th>)}</tr></thead><tbody>
          {(d.brands.length ? d.brands.map((x) => x.name) : ALL_BRANDS).map((b) => (<tr key={b}><td><span className="chip"><span className="sw" style={{ background: d.brands.find((x) => x.name === b)?.color ?? BRAND_COLOR[b] ?? "var(--surface-3)" }} />{b}</span></td>
            {crs.map((cName) => {
              const a = asg.find((x) => x.brandId === b && x.creatorId === cName);
              if (!a) return <td key={cName} className="mx" style={{ color: "var(--faint)" }}>·</td>;
              const done = d.contents.filter((c) => c.brandId === b && c.creatorName === cName && c.status === "uploaded" && monthOf(c) === month).length;
              const [bg, fg] = cellStyle(a.quota ? done / a.quota : 0);
              return <td key={cName} className="mx"><span className="cell" style={{ background: bg, color: fg }}>{done}/{a.quota}</span></td>;
            })}
          </tr>))}
        </tbody></table></div>
        <div className="sec-h"><h2>{T("제작 일정 (전체)")}</h2><span className="hint"><span className="synced">🔄 {T("단일 원본 동기화")}</span></span></div>
        <ScheduleRows items={sched} />
      </>
    );
  }
  if (pane === "a-roster") return <RosterTable creators={d.creators} contents={d.contents} full />;
  if (pane === "a-brands") return <BrandAdmin d={d} month={month} />;
  if (pane === "a-secondary") return <SecondaryView mode="admin" d={d} />;
  if (pane === "a-schedule") return <ScheduleEditor d={d} includeDeals month={month} />;
  if (pane === "a-assign") return <AssignEditor d={d} month={month} />;
  if (pane === "a-deals") return <DealList deals={d.deals} contents={d.contents} creators={d.creators} />;
  if (pane === "a-revenue") return <RevenueTable d={d} month={month} />;
  if (pane === "a-cost") return <CostTable creators={d.creators} />;
  if (pane === "a-insights") return <Insights creators={d.creators} contents={d.contents} />;
  if (pane === "a-accounts") return <AccountsTable creators={d.creators} brands={d.brands} email={email} />;
  if (pane === "a-archive") return <ContentArchive contents={d.contents} tagBrands={d.brands.length ? d.brands.map((b) => b.name) : ALL_BRANDS} onTag={(c, bn) => tagContentBrand(c.id, bn, d.brands)} />;
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
    if (!confirm(`${T("선택한")} ${targets.length}${T("명의 크리에이터를 삭제할까요? 되돌릴 수 없습니다.")}`)) return;
    try {
      for (const c of targets) { await deleteCreator(c.id); const i = creators.indexOf(c); if (i >= 0) creators.splice(i, 1); }
      setSel(new Set()); setTick((t) => t + 1);
    } catch (e) { alert(T("삭제 실패: ") + (e as Error).message); setTick((t) => t + 1); }
  }
  const nActive = creators.filter((c) => c.status === "active").length;
  const nPreparing = creators.filter((c) => c.status === "preparing").length;
  const nHold = creators.filter((c) => c.status === "on_hold").length;
  return (<>
    {full && <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("크리에이터 관리")}</h2>
      <span style={{ display: "flex", gap: 8 }}>
        {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>{T("선택 삭제")} ({sel.size})</button>}
        <button className="btn" onClick={() => setBulk(true)}>{T("일괄 등록")}</button>
        <button className="btn acc" onClick={() => setEdit(null)}>+ {T("크리에이터 추가")}</button>
      </span></div>}
    {full && <div className="grid-kpi" style={{ marginBottom: 16 }}>
      <Kpi lab={T("전체")} val={String(creators.length)} />
      <Kpi lab={T("활동중")} val={String(nActive)} />
      <Kpi lab={T("계약준비")} val={String(nPreparing)} />
      <Kpi lab={T("보류")} val={String(nHold)} />
    </div>}
    {full && <div className="filterbar">
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">{T("번호순")}</option>
        <option value="followers">{T("팔로워순")}</option>
        <option value="name">{T("이름순")}</option>
        <option value="status">{T("상태순")}</option>
      </select>
      <span className="count">{list.length}{T("명")}</span>
    </div>}
    <div className="tablewrap"><table><thead><tr>
      {full && <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={T("전체 선택")} /></th>}
      <th>{T("번호")}</th><th>{T("크리에이터")}</th><th>SNS</th><th>{T("팔로워")}</th><th>{T("상태")}</th><th>{T("카테고리")}</th>{full && <><th>{T("월 계약수량")}</th><th></th></>}
    </tr></thead><tbody>
      {list.map((c) => (
        <tr key={c.id} style={full && sel.has(c.id) ? { background: "var(--accent-weak)" } : undefined}>
          {full && <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`${c.name} ${T("선택")}`} /></td>}
          <td className="num" style={{ color: "var(--faint)", fontWeight: 600 }}>{c.code ?? "—"}</td>
          <td><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar creator={c} size={28} radius={8} />
            {full ? <b style={{ cursor: "pointer", color: "var(--accent-ink)", textDecoration: "underline", textUnderlineOffset: 2 }} onClick={() => setDetail(c)}>{c.name}</b> : <b>{c.name}</b>}</span></td>
          <td><SnsBadges c={c} /></td>
          <td className="num">{fmt(c.followers)}</td>
          <td>{statusPill(c.status)}</td>
          <td>{c.category ?? "—"}</td>
          {full && <><td className="num">{c.monthlyQuota ?? "—"}</td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setDetail(c)}>{T("상세")}</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setEdit(c)}>{T("수정")}</button></td></>}
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
    if (!valid.length) { setErr(T("등록할 행이 없습니다")); return; }
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
    <Modal title={T("크리에이터 일괄 등록")} onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>{T("취소")}</button>
        <button className="btn acc" disabled={busy || !valid.length} onClick={run}>{busy ? `${T("등록 중…")} (${ok}/${valid.length})` : `${valid.length}${T("명 등록")}`}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 8 }}>
        {T("스프레드시트에서 복사해 붙여넣으세요 (한 줄에 한 명, 탭 또는 콤마 구분). 고유번호(CC)는 자동 부여됩니다.")}<br />
        {T("순서:")} <b>{T("이름 · 인스타핸들 · 팔로워 · 카테고리 · 기본보수(¥)")}</b> {T("— 이름 외에는 비워도 됩니다.")}
      </div>
      <textarea style={{ ...inp, minHeight: 180, fontFamily: "var(--mono)", fontSize: 12.5 }}
        placeholder={T("merumi\t@merumichandayo\t50000\t뷰티\t250000\nrico\t@rico\t32000\t라이프\t200000")}
        value={text} onChange={(e) => setText(e.target.value)} />
      <div className="note" style={{ marginTop: 8 }}>{T("인식된 행:")} <b className="num">{valid.length}</b>{T("명")}</div>
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
    if (pct >= 40) cards.push({ t: T("성장 가속 중"), s: `${T("최근 12주 팔로워 +")}${pct.toFixed(0)}${T("%. 상위 성장세, 현재 포맷 유지·시리즈화 권장.")}` });
    else if (pct >= 15) cards.push({ t: T("안정적 성장"), s: `+${pct.toFixed(0)}${T("% 성장. 업로드 빈도를 늘리면 곡선을 끌어올릴 수 있습니다.")}` });
    else cards.push({ t: T("성장 정체"), s: `+${pct.toFixed(0)}${T("%. 새 훅·주제 실험, 트렌드 오디오 활용 권장.")}` });
    if (ups.length) { const best = [...ups].sort((a, b) => parseFloat(engRate(b)) - parseFloat(engRate(a)))[0]; cards.push({ t: T("베스트 콘텐츠"), s: `'${best.product}'${T("가 참여율")} ${engRate(best)}${T("로 최고. 유사 포맷 반복 추천.")}` }); }
    if (aud.female >= 0 && aud.regions.length) cards.push({ t: T("오디언스 제안"), s: `${T("주 시청층 여성")} ${aud.female}%·${aud.ages.slice().sort((a, b) => b[1] - a[1])[0][0]}, ${aud.regions[0][0]} ${T("중심. 해당 층 주제 강화.")}` });
    setAi(cards);
  }
  return (
    <Modal title={T("크리에이터 상세")} onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>{T("닫기")}</button><button className="btn acc" onClick={onEdit}>{T("수정")}</button></>}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Avatar creator={c} name={c.name} size={56} radius={15} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{c.code ? <span style={{ color: "var(--faint)", fontWeight: 600, marginRight: 6 }}>{c.code}</span> : null}{c.name} {statusPill(c.status)}</div>
          <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 3 }}>{c.handle} · {T("팔로워")} {fmt(c.followers)} · {c.category ?? "—"}</div>
          <div style={{ marginTop: 6 }}><SnsBadges c={c} /></div>
        </div>
      </div>
      {c.intro && <div className="note" style={{ marginBottom: 14 }}>{c.intro}</div>}
      <div className="segmented" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button className={`btn sm ${tab === "info" ? "acc" : ""}`} onClick={() => setTab("info")}>{T("정보")}</button>
        <button className={`btn sm ${tab === "insight" ? "acc" : ""}`} onClick={() => setTab("insight")}>{T("인사이트")}</button>
      </div>
      {tab === "info" ? <>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "0 0 4px" }}>{T("기본 정보")}</div>
        <DRow k={T("한자 이름")} v={c.nameKanji} />
        <DRow k={T("영문 이름")} v={c.nameEn} />
        <DRow k={T("영문 주소")} v={c.addressEn} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "14px 0 4px" }}>{T("계약·정산 정보")}</div>
        <DRow k={T("구분")} v={c.entityType === "corporation" ? T("법인") : T("개인")} />
        <DRow k={T("이메일")} v={c.email} />
        <DRow k={T("전화번호")} v={c.phone} />
        <DRow k={T("주소")} v={c.address} />
        <DRow k={T("은행계좌")} v={c.bankAccount} />
        <DRow k={T("인보이스 등록번호")} v={c.invoiceRegNo} />
        <DRow k={T("원천징수")} v={c.withholding == null ? "—" : c.withholding ? T("대상 (10.21%)") : T("대상외")} />
        <DRow k={T("계약기간")} v={c.contractDate || c.contractEnd ? `${c.contractDate ?? "—"} ~ ${c.contractEnd ?? "—"}` : undefined} />
        <DRow k={T("기본보수 (세전/월)")} v={c.baseFee != null ? yen(c.baseFee) : undefined} />
        <DRow k={T("지급사이클")} v={c.payCycle} />
        <DRow k={T("월 계약 수량")} v={c.monthlyQuota != null ? `${c.monthlyQuota}${T("건")}` : undefined} />
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "14px 0 4px" }}>{T("PR 단가")}</div>
        <DRow k={T("릴스 1건당")} v={yen(c.rates.reels)} />
        <DRow k={T("2차 활용")} v={yen(c.rates.secondary)} />
        <DRow k={T("오프라인 PR")} v={yen(c.rates.offline)} />
      </> : <>
        <div className="grid-kpi" style={{ marginBottom: 14 }}>
          <Kpi lab={T("팔로워")} val={fmt(c.followers)} delta={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ${T("(12주)")}`} dir={pct >= 0 ? "up" : "down"} spark={series.map((v) => v / 1000)} />
          <Kpi lab={T("순증 (12주)")} val={`+${fmt(series[series.length - 1] - series[0])}`} />
          <Kpi lab={T("평균 참여율")} val={avgEng.toFixed(1)} unit="%" />
          <Kpi lab={T("업로드")} val={uploaded.length} unit={T("건")} />
        </div>
        <div className="card pad" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ margin: "0 0 6px" }}><h2>{T("팔로워 추이")}</h2><span className="hint">{c.handle} · {T("최근 12주")}</span></div>
          <div style={{ marginTop: 8 }}><Spark data={series} /></div>
        </div>
        <div className="card pad" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>✨ {T("AI 성장 코치")}</h2><button className="btn acc" onClick={runAI}>{T("분석 실행")}</button></div>
          {!ai ? <div className="note">{T("'분석 실행'을 누르면 성장률·아카이브 콘텐츠를 분석해 피드백과 추천을 제공합니다.")}</div>
            : ai.map((f, i) => <div key={i} className="ai-card"><span className="ic">★</span><div><div className="t">{f.t}</div><div className="s">{f.s}</div></div></div>)}
        </div>
        <div className="sec-h" style={{ margin: "0 0 10px" }}><h2>{T("콘텐츠 아카이브")}</h2><span className="hint">{c.handle}</span></div>
        <ContentArchive contents={mine} showCreator={false} />
      </>}
    </Modal>
  );
}

/* ── 브랜드 관리 ───── */
function BrandAdmin({ d, month: gMonth }: { d: Bundle; month: string }) {
  const [month, setMonth] = useState(gMonth);
  const [, setTick] = useState(0);
  const [edit, setEdit] = useState<Brand | null | undefined>(undefined);
  const [products, setProducts] = useState<Brand | null>(null);
  const [monthly, setMonthly] = useState<Brand | null>(null);
  const [invoice, setInvoice] = useState<Brand | null>(null);
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
    if (!targets.length || !confirm(`${T("선택한")} ${targets.length}${T("개 브랜드를 삭제할까요? 되돌릴 수 없습니다.")}`)) return;
    try { for (const b of targets) { await deleteBrand(b.id); const i = d.brands.indexOf(b); if (i >= 0) d.brands.splice(i, 1); } setSel(new Set()); setTick((t) => t + 1); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); setTick((t) => t + 1); }
  }
  const period = (b: Brand) => b.contractStart || b.contractEnd ? `${b.contractStart ?? "—"} ~ ${b.contractEnd ?? "—"}` : "—";
  return (<>
    <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("브랜드 관리")}</h2>
      <span style={{ display: "flex", gap: 8 }}>
        {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>{T("선택 삭제")} ({sel.size})</button>}
        <button className="btn acc" onClick={() => setEdit(null)}>+ {T("브랜드 추가")}</button>
      </span></div>
    <div className="filterbar">
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">{T("번호순")}</option>
        <option value="name">{T("알파벳순")}</option>
        <option value="period">{T("계약기간순")}</option>
        <option value="amount">{T("월 계약금액순")}</option>
      </select>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}</select>
      <span className="count">{list.length}{T("개")}</span>
    </div>
    {!list.length ? <div className="placeholder">{T("등록된 브랜드가 없어요. ‘+ 브랜드 추가’로 시작하세요.")}</div> :
      <div className="tablewrap"><table><thead><tr>
        <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map((b) => b.id)))} aria-label={T("전체 선택")} /></th>
        <th>{T("번호")}</th><th>{T("브랜드")}</th><th>{T("월 수량")}</th><th>{T("월 계약금액")}</th><th>{T("계약기간")}</th><th>{T("도메인")}</th><th></th>
      </tr></thead><tbody>
        {list.map((b) => {
          const mc = d.contracts.find((c) => c.brandId === b.name && c.yearMonth === month);
          const inP = (!b.contractStart || b.contractStart <= month) && (!b.contractEnd || b.contractEnd >= month);
          const mQuota = mc?.quota ?? (inP ? b.monthlyQuota : null);
          const mAmount = mc?.monthlyAmount ?? (inP ? b.monthlyAmount : null);
          return (
          <tr key={b.id} style={sel.has(b.id) ? { background: "var(--accent-weak)" } : undefined}>
            <td><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} aria-label={`${b.name} ${T("선택")}`} /></td>
            <td className="num" style={{ color: "var(--faint)", fontWeight: 600 }}>{b.code ?? "—"}</td>
            <td><span className="chip"><span className="sw" style={{ background: b.color ?? BRAND_COLOR[b.name] ?? "var(--surface-3)" }} /><b>{b.name}</b></span></td>
            <td className="num">{mQuota != null ? `${mQuota}${T("건")}` : "—"}{mc && <span style={{ color: "var(--accent-ink)", fontSize: 10, marginLeft: 4 }}>●</span>}</td>
            <td className="num">{mAmount != null ? yen(mAmount) : "—"}</td>
            <td className="num" style={{ color: "var(--muted)" }}>{period(b)}</td>
            <td style={{ color: "var(--muted)" }}>{b.domainAllowlist?.length ? b.domainAllowlist.join(", ") : "—"}</td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setInvoice(b)}>{T("인보이스")}</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setMonthly(b)}>{T("월별")}</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} onClick={() => setProducts(b)}>{T("상품")}</button>
              <button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setEdit(b)}>{T("수정")}</button></td>
          </tr>
        ); })}
      </tbody></table></div>}
    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>{T("브랜드를 추가하면 배정 관리·PR 안건·계정 초대의 브랜드 선택에도 자동 반영됩니다. ‘상품’에서 월별 PR 상품 리스트를 관리하세요.")}</div>
    {edit !== undefined && <BrandEditModal brand={edit} all={d.brands} onClose={() => setEdit(undefined)} onSaved={() => setTick((t) => t + 1)} />}
    {products && <BrandProductsModal brand={products} brands={d.brands} onClose={() => setProducts(null)} />}
    {monthly && <BrandMonthlyModal brand={monthly} d={d} onClose={() => setMonthly(null)} onSaved={() => setTick((t) => t + 1)} />}
    {invoice && <BrandInvoiceModal brand={invoice} d={d} initialMonth={month} onClose={() => setInvoice(null)} />}
  </>);
}

function BrandInvoiceModal({ brand, d, initialMonth, onClose }: { brand: Brand; d: Bundle; initialMonth: string; onClose: () => void }) {
  const [month, setMonth] = useState(initialMonth);
  const [sec, setSec] = useState<SecondaryReq[]>([]);
  useEffect(() => { getSecondaryRequests().then(setSec).catch(() => setSec([])); }, []);
  // 월 계약 (월별 우선 → 브랜드 기본값)
  const mc = d.contracts.find((c) => c.brandId === brand.name && c.yearMonth === month);
  const inPeriod = (!brand.contractStart || brand.contractStart <= month) && (!brand.contractEnd || brand.contractEnd >= month);
  const amount = mc?.monthlyAmount ?? (inPeriod ? (brand.monthlyAmount ?? 0) : 0);
  const quota = mc?.quota ?? (inPeriod ? (brand.monthlyQuota ?? 0) : 0);
  // 이 브랜드 승인 2차 활용 (해당 월 or 기간 미지정)
  const secItems = sec.filter((r) => r.status === "approved" && r.brandName === brand.name
    && (!r.periodStart || String(r.periodStart).slice(0, 7) === month));
  const secTotal = secItems.reduce((s, r) => s + r.fee, 0);
  const grand = amount + secTotal;
  const no = `INV-${month}-01`;
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(2)}`;
  // 인보이스 라인: 월 계약 + 2차 활용 (Qty / Unit Price / Amount)
  const lines: { desc: string; qty: number; unit: number }[] = [
    { desc: `${month} ${T("콘텐츠 월 계약")}`, qty: quota || 1, unit: quota ? Math.round(amount / quota) : amount },
    ...secItems.map((r) => ({ desc: `2차 활용 · ${r.product}`, qty: 1, unit: r.fee })),
  ];
  const th: React.CSSProperties = { background: "#1a1a1a", color: "#fff", padding: "7px 10px", fontSize: 12, textAlign: "left", fontWeight: 600 };
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)" };
  const rowL = (k: string, v: string) => <div style={{ display: "flex", fontSize: 12 }}><div style={{ width: 150, color: "var(--faint)", padding: "3px 0" }}>{k}</div><div style={{ flex: 1, padding: "3px 0" }}>{v}</div></div>;
  return (
    <Modal title={T("브랜드 인보이스")} onClose={onClose} width={640}
      footer={<><button className="btn" onClick={onClose}>{T("닫기")}</button><button className="btn acc" onClick={() => window.print()}>{T("인쇄 / PDF 저장")}</button></>}>
      <div className="filterbar" style={{ marginBottom: 12 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}</select>
      </div>
      <div id="invoice" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 28, background: "#fff", color: "#111" }}>
        <div style={{ textAlign: "center", fontSize: 26, fontWeight: 700, letterSpacing: 1, marginBottom: 18 }}>INVOICE</div>
        {/* 발신 + 인보이스 정보 */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>81degree Inc. <span style={{ color: "var(--accent)" }}>81°</span></div>
            <div>MIEUX Shibuya Building 8F, 5-3 Maruyama-cho,</div>
            <div>Shibuya-ku, Tokyo, Japan</div>
            <div>Tel: +81-80-4209-7555</div>
            <div>tehyoku@81degree.com | www.81degree.com</div>
          </div>
          <div style={{ fontSize: 12, minWidth: 200 }}>
            {rowL("Invoice No.", no)}{rowL("Date", dateStr)}{rowL("Currency", "JPY (¥)")}
          </div>
        </div>
        {/* BILL TO */}
        <div style={{ background: "#1a1a1a", color: "#fff", padding: "5px 10px", fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>BILL TO</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "10px 0 16px", fontSize: 12, lineHeight: 1.7 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{brand.billCompany || brand.name}</div>
            <div>{brand.billAddress || "—"}</div>
            <div>Tel: {brand.billTel || "—"}{brand.billRep ? ` | Rep: ${brand.billRep}` : ""}</div>
            {brand.billRegNo && <div>Biz Reg No: {brand.billRegNo}</div>}
          </div>
          <div style={{ minWidth: 200 }}>{rowL("Terms", "Upon receipt")}{rowL("Payment", "Int'l wire transfer")}</div>
        </div>
        {/* 항목 테이블 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 4 }}>
          <thead><tr><th style={th}>Description</th><th style={{ ...th, textAlign: "center", width: 60 }}>Qty</th><th style={{ ...th, textAlign: "right", width: 110 }}>Unit Price</th><th style={{ ...th, textAlign: "right", width: 120 }}>Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => <tr key={i}><td style={td}>{l.desc}</td><td style={{ ...td, textAlign: "center" }}>{l.qty}</td><td style={{ ...td, textAlign: "right" }}>{fmt(l.unit)}</td><td style={{ ...td, textAlign: "right" }}>{fmt(l.qty * l.unit)}</td></tr>)}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", background: "#1a1a1a", color: "#fff", padding: "8px 10px", fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          <span>AMOUNT DUE</span><span className="num">{yen(grand)}</span>
        </div>
        {/* PAYMENT INFORMATION */}
        <div style={{ background: "#1a1a1a", color: "#fff", padding: "5px 10px", fontSize: 12, fontWeight: 600, letterSpacing: 1, marginTop: 16 }}>PAYMENT INFORMATION</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.9, padding: "8px 0" }}>
          {rowL("Account Holder", "81DEGREE INC.")}
          {rowL("Bank Name", "SHINHAN BANK JAPAN (SBJ Bank)")}
          {rowL("Branch", "Tokyo Business Dept.")}
          {rowL("Account No.", "10010076602")}
          {rowL("SWIFT / BIC", "SHBKJPJX")}
          {rowL("Bank Address", "Mita Belliu Bldg, 4F, 36-7, Shiba 5-Chome, Minato-ku, Tokyo, Japan")}
          {rowL("Beneficiary Address", "MIEUX Shibuya Building 8F, 5-3 Maruyama-cho, Shibuya-ku, Tokyo, Japan")}
          {rowL("E-mail", "sbj_8092@sbjbank.co.jp, tehyoku@81degree.com")}
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>Please email the remittance slip to the address above when the transfer is made.</div>
        <div style={{ textAlign: "right", marginTop: 20, fontSize: 12 }}>
          <div style={{ color: "#555" }}>Authorized by</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Park Hamin</div>
          <div style={{ color: "#555" }}>CEO, 81degree Inc.</div>
        </div>
      </div>
    </Modal>
  );
}

function BrandMonthlyModal({ brand, d, onClose, onSaved }: { brand: Brand; d: Bundle; onClose: () => void; onSaved: () => void }) {
  const [, setT2] = useState(0);
  const cOf = (m: string) => d.contracts.find((c) => c.brandId === brand.name && c.yearMonth === m);
  async function set(m: string, quota: number, amount: number) {
    // 메모리 갱신
    const existing = d.contracts.find((c) => c.brandId === brand.name && c.yearMonth === m);
    if (quota <= 0 && amount <= 0) { if (existing) d.contracts.splice(d.contracts.indexOf(existing), 1); }
    else if (existing) { existing.quota = quota; existing.monthlyAmount = amount; }
    else d.contracts.push({ id: `${brand.name}|${m}`, brandId: brand.name, yearMonth: m, quota, unitPrice: 0, monthlyAmount: amount });
    setT2((t) => t + 1); onSaved();
    setBrandMonthly(brand.name, m, quota, amount, d.brands).catch((e) => console.warn(e.message));
  }
  return (
    <Modal title={`${brand.name} · ${T("월별 계약 수량")}`} onClose={onClose} width={480}
      footer={<button className="btn acc" onClick={onClose}>{T("완료")}</button>}>
      <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{T("월마다 계약 수량·금액이 다르면 여기서 지정하세요. 비워두면 브랜드 기본값이 적용됩니다.")}</div>
      <div className="tablewrap"><table><thead><tr><th>{T("월")}</th><th>{T("수량")}</th><th>{T("월 계약금액 (¥)")}</th></tr></thead><tbody>
        {ASSIGN_MONTHS.map((m) => {
          const c = cOf(m);
          return <tr key={m}>
            <td className="num">{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</td>
            <td><input className="rate-in" type="number" style={{ width: 70 }} defaultValue={c?.quota ?? ""} placeholder={String(brand.monthlyQuota ?? "")}
              onBlur={(e) => set(m, +e.target.value || 0, c?.monthlyAmount ?? brand.monthlyAmount ?? 0)} /></td>
            <td><input className="rate-in" type="number" style={{ width: 120 }} defaultValue={c?.monthlyAmount ?? ""} placeholder={String(brand.monthlyAmount ?? "")}
              onBlur={(e) => set(m, c?.quota ?? brand.monthlyQuota ?? 0, +e.target.value || 0)} /></td>
          </tr>;
        })}
      </tbody></table></div>
    </Modal>
  );
}

function BrandEditModal({ brand, all, onClose, onSaved }: { brand: Brand | null; all: Brand[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !brand;
  const nextCode = "BR" + String(Math.max(0, ...all.map((b) => { const m = b.code?.match(/\d+/); return m ? +m[0] : 0; })) + 1).padStart(3, "0");
  const [f, setF] = useState<Brand>(brand ? { ...brand } : { id: "", code: nextCode, name: "", aliases: [], color: "#22B24E", domainAllowlist: [] });
  const up = (k: keyof Brand, v: unknown) => setF((s) => ({ ...s, [k]: v } as Brand));
  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  async function save() {
    if (!f.name.trim()) { alert(T("브랜드명을 입력해주세요")); return; }
    try {
      const ff = { ...f, code: normalizeCode(f.code, "BR") };
      if (brand) { const saved = await saveBrand(ff, false); Object.assign(brand, saved); }
      else { const saved = await saveBrand({ ...ff, id: ff.name }, true); all.push(saved); }
      onSaved(); onClose();
    } catch (e) { alert(T("저장 실패: ") + (e as Error).message); }
  }
  async function del() {
    if (!brand) return;
    if (!confirm(`'${brand.name}' ${T("브랜드를 삭제할까요? 연결된 계약/배정이 있으면 영향이 있을 수 있습니다.")}`)) return;
    try { await deleteBrand(brand.id); const i = all.indexOf(brand); if (i >= 0) all.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? T("브랜드 추가") : T("브랜드 수정")} onClose={onClose}
      footer={<>{!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>{T("삭제")}</button>}
        <button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" onClick={save}>{T("저장")}</button></>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0 14px", alignItems: "end" }}>
        <Field label={T("고유번호 (BR번호)")}><input style={inp} placeholder="BR001" value={f.code ?? ""} onChange={(e) => up("code", e.target.value)} onBlur={(e) => up("code", normalizeCode(e.target.value, "BR"))} /></Field>
        <Field label={T("브랜드명")}><input style={inp} placeholder={T("예: abib")} value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
        <Field label={T("색상")}><input type="color" style={{ ...inp, width: 56, padding: 4, height: 40 }} value={f.color ?? "#22B24E"} onChange={(e) => up("color", e.target.value)} /></Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "6px 0 8px" }}>{T("계약 정보")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("계약 시작월")}><input style={inp} type="month" value={f.contractStart ?? ""} onChange={(e) => up("contractStart", e.target.value)} /></Field>
        <Field label={T("계약 종료월")}><input style={inp} type="month" value={f.contractEnd ?? ""} onChange={(e) => up("contractEnd", e.target.value)} /></Field>
        <Field label={T("월 콘텐츠 계약 수량")}><input style={inp} type="number" value={f.monthlyQuota ?? ""} onChange={(e) => up("monthlyQuota", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label={T("월간 계약 금액 (¥)")}><input style={inp} type="number" value={f.monthlyAmount ?? ""} onChange={(e) => up("monthlyAmount", e.target.value === "" ? null : +e.target.value)} /></Field>
      </div>
      <Field label={T("별칭 (쉼표로 구분)")}><input style={inp} placeholder={T("아비브, ABIB")} value={f.aliases?.join(", ") ?? ""} onChange={(e) => up("aliases", toList(e.target.value))} /></Field>
      <Field label={T("로그인 이메일 도메인 (쉼표로 구분)")}><input style={inp} placeholder="abib.com" value={f.domainAllowlist?.join(", ") ?? ""} onChange={(e) => up("domainAllowlist", toList(e.target.value))} /></Field>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "6px 0 8px" }}>{T("인보이스 정보 (BILL TO)")}</div>
      <Field label={T("청구 회사명")}><input style={inp} placeholder="Four Company Inc." value={f.billCompany ?? ""} onChange={(e) => up("billCompany", e.target.value)} /></Field>
      <Field label={T("주소")}><input style={inp} placeholder="538, Eonju-ro, Gangnam-gu, Seoul, Korea 5F" value={f.billAddress ?? ""} onChange={(e) => up("billAddress", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("전화")}><input style={inp} placeholder="070-4131-5906" value={f.billTel ?? ""} onChange={(e) => up("billTel", e.target.value)} /></Field>
        <Field label={T("대표자/담당자")}><input style={inp} placeholder="Kim Minwoo" value={f.billRep ?? ""} onChange={(e) => up("billRep", e.target.value)} /></Field>
      </div>
      <Field label={T("사업자 등록번호")}><input style={inp} placeholder="232-88-00610" value={f.billRegNo ?? ""} onChange={(e) => up("billRegNo", e.target.value)} /></Field>
      <div style={{ fontSize: 12, color: "var(--faint)" }}>{T("도메인을 넣으면 해당 브랜드 담당자가 그 이메일로 가입/로그인 시 자동으로 이 브랜드에 매칭됩니다.")}</div>
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
    catch (e) { alert(T("추가 실패: ") + (e as Error).message); }
    setBusy(false);
  }
  async function del(id: string) { try { await deleteBrandProduct(id); load(); } catch (e) { alert(T("삭제 실패: ") + (e as Error).message); } }
  return (
    <Modal title={`${brand.name} · ${T("PR 상품 리스트")}`} onClose={onClose} width={560}
      footer={<button className="btn acc" onClick={onClose}>{T("완료")}</button>}>
      <div className="filterbar" style={{ marginBottom: 12 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.replace("-", ". ")}</option>)}</select>
        <span className="count">{items.length}{T("개")}</span>
      </div>
      {!items.length ? <div className="placeholder" style={{ padding: "18px 0" }}>{T("이 달 등록된 상품이 없어요.")}</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface-2)", borderRadius: 9 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                {p.url && <a href={p.url} target="_blank" rel="noopener" style={{ fontSize: 11.5, color: "var(--accent-ink)", wordBreak: "break-all" }}>{p.url}</a>}
              </div>
              <button className="btn" style={{ padding: "5px 9px", fontSize: 11.5, color: "var(--critical)", borderColor: "var(--critical)" }} onClick={() => del(p.id)}>{T("삭제")}</button>
            </div>
          ))}
        </div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
        <input style={inp} placeholder={T("상품명")} value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inp} placeholder={T("상품 URL (선택)")} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn acc" disabled={busy || !name.trim()} onClick={add}>{T("추가")}</button>
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
    } catch (e) { alert(T("저장 실패: ") + (e as Error).message); }
  }
  async function del() {
    if (!creator) return;
    try { await deleteCreator(creator.id); const i = all.indexOf(creator); if (i >= 0) all.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? T("크리에이터 추가") : T("크리에이터 수정")} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>{T("삭제")}</button>}
        <button className="btn" onClick={onClose}>{T("취소")}</button>
        <button className="btn acc" onClick={save}>{T("저장")}</button>
      </>}>
      <Field label={T("프로필 사진")}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar creator={f} name={f.name} size={56} radius={15} />
          <label className="btn" style={{ cursor: "pointer" }}>{T("사진 업로드")}<input type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} /></label>
          {f.photoUrl && <button className="btn" onClick={() => up("photoUrl", null)}>{T("제거")}</button>}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("고유번호 (CC번호)")}><input style={inp} placeholder={T("CC001 (숫자만 입력해도 자동 변환)")} value={f.code ?? ""} onChange={(e) => up("code", e.target.value)} onBlur={(e) => up("code", normalizeCode(e.target.value))} /></Field>
        <Field label={T("크리에이터명")}><input style={inp} value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
        <Field label={T("한자(일본어) 이름")}><input style={inp} placeholder="瀬戸川芽瑠" value={f.nameKanji ?? ""} onChange={(e) => up("nameKanji", e.target.value)} /></Field>
        <Field label={T("영문 이름")}><input style={inp} placeholder="Merumi Setokawa" value={f.nameEn ?? ""} onChange={(e) => up("nameEn", e.target.value)} /></Field>
        <Field label={T("인스타 핸들")}><input style={inp} value={f.handle ?? ""} onChange={(e) => up("handle", e.target.value)} /></Field>
        <Field label={T("팔로워")}><input style={inp} type="number" value={f.followers} onChange={(e) => up("followers", +e.target.value)} /></Field>
        <Field label={T("상태")}><select style={inp} value={f.status} onChange={(e) => up("status", e.target.value)}><option value="active">{T("활동중")}</option><option value="preparing">{T("계약준비")}</option><option value="on_hold">{T("보류")}</option></select></Field>
        <Field label={T("주력 카테고리")}><input style={inp} value={f.category ?? ""} onChange={(e) => up("category", e.target.value)} /></Field>
        <Field label={T("콘텐츠 톤")}><input style={inp} value={f.tone ?? ""} onChange={(e) => up("tone", e.target.value)} /></Field>
        <Field label={T("월 계약 수량")}><input style={inp} type="number" value={f.monthlyQuota ?? ""} onChange={(e) => up("monthlyQuota", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label={T("월 고정비")}><input style={inp} type="number" value={f.fixedCost} onChange={(e) => up("fixedCost", +e.target.value)} /></Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>{T("추가 SNS")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {(["youtube", "tiktok", "x", "line"] as const).map((k) => (
          <Field key={k} label={k === "x" ? "X" : k}><input style={inp} value={f.sns[k] ?? ""} onChange={(e) => setF((s) => ({ ...s, sns: { ...s.sns, [k]: e.target.value } }))} /></Field>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>{T("PR 단가 (¥)")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {(["reels", "secondary", "offline", "etc"] as const).map((k) => (
          <Field key={k} label={{ reels: T("릴스 1건당"), secondary: T("2차 활용"), offline: T("오프라인 PR"), etc: T("기타") }[k]}>
            <input style={inp} type="number" value={f.rates[k]} onChange={(e) => setF((s) => ({ ...s, rates: { ...s.rates, [k]: +e.target.value } }))} /></Field>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>{T("계약·정산 정보")} <span style={{ color: "var(--faint)", fontWeight: 400 }}>{T("(민감정보)")}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("이메일")}><input style={inp} type="email" value={f.email ?? ""} onChange={(e) => up("email", e.target.value)} /></Field>
        <Field label={T("전화번호")}><input style={inp} value={f.phone ?? ""} onChange={(e) => up("phone", e.target.value)} /></Field>
      </div>
      <Field label={T("주소")}><input style={inp} value={f.address ?? ""} onChange={(e) => up("address", e.target.value)} /></Field>
      <Field label={T("영문 주소")}><input style={inp} placeholder="English address" value={f.addressEn ?? ""} onChange={(e) => up("addressEn", e.target.value)} /></Field>
      <Field label={T("은행계좌")}><input style={inp} value={f.bankAccount ?? ""} onChange={(e) => up("bankAccount", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("인보이스 등록번호 (T번호)")}><input style={inp} placeholder="T0000000000000" value={f.invoiceRegNo ?? ""} onChange={(e) => up("invoiceRegNo", e.target.value)} /></Field>
        <Field label={T("구분")}><select style={inp} value={f.entityType ?? "individual"} onChange={(e) => up("entityType", e.target.value)}><option value="individual">{T("개인")}</option><option value="corporation">{T("법인")}</option></select></Field>
        <Field label={T("계약 시작일")}><input style={inp} type="date" value={f.contractDate ?? ""} onChange={(e) => up("contractDate", e.target.value)} /></Field>
        <Field label={T("계약 종료일")}><input style={inp} type="date" value={f.contractEnd ?? ""} onChange={(e) => up("contractEnd", e.target.value)} /></Field>
        <Field label={T("기본보수 (세전/월, ¥)")}><input style={inp} type="number" value={f.baseFee ?? ""} onChange={(e) => up("baseFee", e.target.value === "" ? null : +e.target.value)} /></Field>
        <Field label={T("지급사이클")}><input style={inp} placeholder={T("월말마감 익월 10일 지급")} value={f.payCycle ?? ""} onChange={(e) => up("payCycle", e.target.value)} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "2px 0 4px" }}>
        <input type="checkbox" checked={f.withholding ?? false} onChange={(e) => up("withholding", e.target.checked)} /> {T("원천징수 대상 (개인사업자, 10.21%)")}
      </label>
    </Modal>
  );
}

function ConnTable({ creators }: { creators: Creator[] }) {
  const [, setTick] = useState(0);
  const [conn, setConn] = useState<Creator | null>(null);
  const [syncing, setSyncing] = useState<string>("");
  const [fConn, setFConn] = useState<"" | "connected" | "none">("");
  const base = creators.filter((c) => c.status === "active" || c.ig);
  const isConnected = (c: Creator) => c.ig?.status === "active";
  const list = base
    .filter((c) => fConn === "" || (fConn === "connected" ? isConnected(c) : !isConnected(c)))
    .sort(cmpCreatorByCode);
  async function sync(c: Creator) {
    setSyncing(c.id);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { alert(T("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)")); setSyncing(""); return; }
      const res = await fetch("/api/ig/sync", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ creatorId: c.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(T("동기화 실패: ") + (j.error || res.status)); }
      else { alert(`${T("동기화 완료")} · ${T("팔로워")} ${fmt(j.followers)} · ${T("콘텐츠")} ${j.contents}${T("건")}`); window.location.reload(); return; }
    } catch (e) { alert(T("동기화 실패: ") + (e as Error).message); }
    setSyncing(""); setTick((t) => t + 1);
  }
  return (<>
    <div className="card pad" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{T("연동 방법 (4단계)")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, fontSize: 12.5, color: "var(--muted)" }}>
        {[T("① 연동 요청 발송"), T("② Instagram 로그인·동의"), T("③ 토큰 저장 (활성)"), T("④ 자동 수집 시작")].map((s) => (
          <div key={s} style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 9 }}>{s}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>{T("※ Instagram 비즈니스/크리에이터 계정 + Facebook 페이지 연결 필요 · 토큰 60일 만료")}</div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, padding: "8px 10px", background: "var(--accent-weak)", borderRadius: 8 }}>
        🔄 {T("데이터는 실시간이 아니라 ‘동기화’ 버튼을 누를 때 갱신됩니다 (수동/온디맨드). 아래 ‘마지막 동기화’ 시각을 확인하세요.")}
      </div>
    </div>
    <div className="filterbar">
      <select value={fConn} onChange={(e) => setFConn(e.target.value as typeof fConn)}>
        <option value="">{T("전체")}</option>
        <option value="connected">{T("연동됨")}</option>
        <option value="none">{T("미연동")}</option>
      </select>
      <span className="count">{list.length}{T("명")}</span>
    </div>
    <div className="tablewrap"><table><thead><tr>
      <th>{T("번호")}</th><th>{T("크리에이터")}</th><th>{T("IG 핸들")}</th><th>{T("연동일")}</th><th>{T("마지막 동기화")}</th><th>{T("상태")}</th><th></th>
    </tr></thead><tbody>
      {list.map((c) => {
        const s = c.ig?.status;
        const [cls, lab] = s === "active" ? ["p-ok", T("연동됨")] : s === "expired" ? ["p-warn", T("토큰 만료")] : s === "revoked" ? ["p-plan", T("연동 해제")] : ["p-plan", T("미연동")];
        const synced = localDT(c.ig?.lastSyncedAt);
        return (<tr key={c.id}><td className="num" style={{ color: "var(--faint)", fontWeight: 600 }}>{c.code ?? "—"}</td><td><b>{c.name}</b></td><td className="num" style={{ color: "var(--muted)" }}>{c.handle}</td>
          <td className="num" style={{ color: "var(--muted)" }}>{c.ig?.linkedAt ? String(c.ig.linkedAt).slice(0, 10) : "—"}</td>
          <td className="num" style={{ color: synced ? "var(--accent-ink)" : "var(--faint)" }}>{synced ? `✓ ${synced}` : "—"}</td>
          <td><span className={`pill ${cls}`}><span className="d" />{lab}</span></td>
          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            {s === "active" && <button className="btn acc" style={{ padding: "6px 11px", fontSize: 12, marginRight: 6 }} disabled={syncing === c.id} onClick={() => sync(c)}>{syncing === c.id ? T("동기화 중…") : T("동기화")}</button>}
            <button className={`btn ${s === "active" ? "" : "acc"}`} style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setConn(c)}>{s === "active" ? T("재연동") : T("연동하기")}</button></td></tr>);
      })}
    </tbody></table></div>
    {conn && <ConnModal creator={conn} onClose={() => setConn(null)} onDone={() => setTick((t) => t + 1)} />}
  </>);
}

function ConnModal({ creator, onClose }: { creator: Creator; onClose: () => void; onDone: () => void }) {
  const startUrl = `/api/ig/start?creator=${creator.id}`;
  const [copied, setCopied] = useState(false);
  function copyLink() {
    const full = `${window.location.origin}${startUrl}`;
    navigator.clipboard?.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <Modal title={T("Instagram 계정 연동")} onClose={onClose} width={440}
      footer={<><button className="btn" onClick={copyLink}>{copied ? T("복사됨 ✓") : T("연동 링크 복사")}</button>
        <button className="btn acc" onClick={() => { window.location.href = startUrl; }}>{T("Instagram 연동 시작")}</button></>}>
      <div className="note" style={{ color: "var(--faint)", fontSize: 12.5, marginBottom: 14 }}>{withCode(creator.name)} · {creator.handle}</div>
      <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
        <div style={{ width: 54, height: 54, borderRadius: 15, margin: "0 auto 12px", background: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)" }} />
        <b style={{ fontSize: 15 }}>{T("Instagram 프로페셔널 계정 연동")}</b>
      </div>
      <div style={{ background: "var(--surface-2)", borderRadius: 11, padding: "14px 16px", fontSize: 13 }}>
        <b style={{ display: "block", marginBottom: 8 }}>{T("요청 권한")}</b>
        {[T("프로필·팔로워 정보 조회"), T("게시물(릴스)·미디어 조회"), T("인사이트(조회·도달·저장) 조회")].map((p) => (
          <div key={p} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12.5 }}><span style={{ color: "var(--accent-ink)" }}>✓</span>{p}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 12 }}>
        {T("‘연동 시작’을 누르면 Instagram 로그인·동의 화면으로 이동합니다. 크리에이터 본인이 연동하려면 ‘연동 링크 복사’로 링크를 전달하세요.")}
      </div>
    </Modal>
  );
}

// 브랜드 계약 단가(월금액/월수량) — 없으면 UNIT_PRICE 폴백. 브랜드가 매출·배정의 단일 원본.
export function brandUnitPrice(brand: Brand | undefined): number {
  return brand?.monthlyQuota && brand?.monthlyAmount ? brand.monthlyAmount / brand.monthlyQuota : UNIT_PRICE;
}
// 크리에이터 월 인건비: 기본보수(baseFee) 우선, 없으면 고정비(fixedCost)
export const monthlyCost = (c: Creator): number => (c.baseFee != null ? c.baseFee : (c.fixedCost || 0));

function RevenueTable({ d, month }: { d: Bundle; month: string }) {
  const [secReqs, setSecReqs] = useState<SecondaryReq[]>([]);
  useEffect(() => { getSecondaryRequests().then(setSecReqs).catch(() => setSecReqs([])); }, []);
  const dealMonth = (x: Deal) => (x.uploadDate || x.dueDate || "").slice(0, 7);
  const inMonth = (x: Deal) => !dealMonth(x) || dealMonth(x) === month; // 날짜 없으면 포함
  const secApproved = secReqs.filter((r) => r.status === "approved");
  const secByCreator = (name: string) => secApproved.filter((r) => r.creatorName === name).reduce((s, r) => s + r.fee, 0);
  const secFees = secApproved.reduce((s, r) => s + r.fee, 0);
  const live = d.deals.filter((x) => x.step >= 4 && inMonth(x));
  const comp = (x: Deal) => Math.round(x.fee * x.shareCompany / 100);
  const ah = live.filter((x) => x.type === "ahchannel").reduce((s, x) => s + comp(x), 0);
  const cr = live.filter((x) => x.type !== "ahchannel").reduce((s, x) => s + comp(x), 0);
  const unitOf = (brandName: string) => brandUnitPrice(d.brands.find((b) => b.name === brandName));
  // ② 브랜드 월계약 = 이 달 브랜드 계약금액 합 (월별 계약 우선, 없으면 기본값·계약기간 내)
  const brandActive = (b: Brand) => (!b.contractStart || b.contractStart <= month) && (!b.contractEnd || b.contractEnd >= month);
  const brandMonthAmount = (b: Brand) => {
    const mc = d.contracts.find((c) => c.brandId === b.name && c.yearMonth === month);
    if (mc?.monthlyAmount != null) return mc.monthlyAmount;
    return brandActive(b) ? (b.monthlyAmount || 0) : 0;
  };
  const brandRev = d.brands.reduce((s, b) => s + brandMonthAmount(b), 0);
  const fixed = d.creators.reduce((s, c) => s + monthlyCost(c), 0);
  const total = ah + brandRev + cr + secFees;
  // 크리에이터별 기여 (이 달 배정 기준)
  const per = d.creators.map((c) => {
    const ds = live.filter((x) => x.creatorName === c.name);
    const prComp = ds.reduce((s, x) => s + comp(x), 0);
    const brandAlloc = d.assignments.filter((a) => a.creatorId === c.name && a.yearMonth === month).reduce((s, a) => s + a.quota * unitOf(a.brandId), 0);
    const sec = secByCreator(c.name);
    const cost = monthlyCost(c);
    return { name: c.name, prComp, brandAlloc, sec, fixed: cost, contrib: prComp + brandAlloc + sec - cost };
  }).filter((p) => p.prComp || p.brandAlloc || p.sec || p.fixed).sort((a, b) => cmpNameByCode(a.name, b.name));
  return (<>
    <div className="grid-kpi">
      <Kpi lab="① ah!channel PR" val={yen(ah)} /><Kpi lab={T("② 브랜드 월계약")} val={yen(brandRev)} />
      <Kpi lab={T("③ 개별 PR")} val={yen(cr)} /><Kpi lab={T("④ 2차 활용")} val={yen(secFees)} /><Kpi lab={T("총 매출")} val={yen(total)} /><Kpi lab={T("순이익 (−인건비)")} val={yen(total - fixed)} />
    </div>
    <div className="sec-h"><h2>{T("크리에이터별 기여 손익")}</h2><span className="hint">{T("브랜드계약 배분 + PR 회사매출 − 월 보수")}</span></div>
    <div className="tablewrap"><table><thead><tr>
      <th>{T("크리에이터")}</th><th>{T("브랜드계약 배분")}</th><th>{T("PR 회사매출")}</th><th>{T("2차 활용")}</th><th>{T("월 보수")}</th><th>{T("기여이익")}</th>
    </tr></thead><tbody>
      {per.map((p) => (
        <tr key={p.name}><td><b>{withCode(p.name)}</b></td><td className="num">{yen(p.brandAlloc)}</td><td className="num">{yen(p.prComp)}</td>
          <td className="num">{p.sec ? yen(p.sec) : "—"}</td>
          <td className="num" style={{ color: "var(--muted)" }}>{yen(p.fixed)}</td>
          <td className="num" style={{ fontWeight: 600, color: p.contrib >= 0 ? "var(--accent-ink)" : "var(--critical)" }}>{yen(p.contrib)}</td></tr>
      ))}
    </tbody></table></div>
  </>);
}

/* 배정 관리 (월 · 브랜드별 크리에이터 배분) */
const ASSIGN_MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
function AssignEditor({ d, month }: { d: Bundle; month: string }) {
  const [, setTick] = useState(0);
  const [brand, setBrand] = useState("abib");
  const [sortBy, setSortBy] = useState<"code" | "name" | "assigned">("code");
  const [prods, setProds] = useState<BrandProduct[]>([]);
  const [pa, setPa] = useState<Record<string, number>>({}); // `${productId}|${creatorName}` → qty
  const codeNum = (c: Creator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const qOf = (name: string) => d.assignments.find((a) => a.brandId === brand && a.creatorId === name && a.yearMonth === month)?.quota ?? 0;
  const actives = d.creators.filter((c) => c.status === "active").sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "assigned") return qOf(b.name) - qOf(a.name);
    return codeNum(a) - codeNum(b); // code
  });
  // 목표 수량: 월별 계약(contracts) 우선 → 없으면 브랜드 기본값(계약기간 내)
  const brandObj = d.brands.find((b) => b.name === brand);
  const inPeriod = (!brandObj?.contractStart || brandObj.contractStart <= month) && (!brandObj?.contractEnd || brandObj.contractEnd >= month);
  const monthContract = d.contracts.find((c) => c.brandId === brand && c.yearMonth === month);
  const target = monthContract?.quota ?? (inPeriod ? (brandObj?.monthlyQuota ?? 0) : 0);
  const totalFor = (name: string) => d.assignments.filter((a) => a.creatorId === name && a.yearMonth === month).reduce((s, a) => s + a.quota, 0);
  const capOf = (name: string) => d.creators.find((c) => c.name === name)?.monthlyQuota ?? 0;
  const sum = actives.reduce((s, c) => s + qOf(c.name), 0);
  // 브랜드 월별 PR 상품 + 상품별 배정 로드 (브랜드/월 변경 시)
  useEffect(() => { getBrandProducts(brand, month, d.brands).then(setProds).catch(() => setProds([])); }, [brand, month, d.brands]);
  useEffect(() => {
    getProductAssignments(brand, month, d.brands).then((rows) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[`${r.productId}|${r.creatorName}`] = r.qty;
      setPa(map);
    }).catch(() => setPa({}));
  }, [brand, month, d.brands]);
  const paKey = (pid: string, name: string) => `${pid}|${name}`;
  function setProdQty(pid: string, name: string, qty: number) {
    setPa((m) => { const n = { ...m }; if (qty > 0) n[paKey(pid, name)] = qty; else delete n[paKey(pid, name)]; return n; });
    setProductAssignment(pid, name, qty, d.creators).catch((e) => console.warn(e.message));
  }
  const prodTotalFor = (name: string) => prods.reduce((s, p) => s + (pa[paKey(p.id, name)] ?? 0), 0);
  const prodRowTotal = (pid: string) => actives.reduce((s, c) => s + (pa[paKey(pid, c.name)] ?? 0), 0);
  // 배정 수량만큼 제작 일정(계획 콘텐츠) 자동 생성 — 이미 있는 만큼은 건너뜀
  async function generateSchedule() {
    let created = 0;
    try {
      if (prods.length) {
        for (const p of prods) for (const c of actives) {
          const qty = pa[paKey(p.id, c.name)] ?? 0;
          const existing = d.contents.filter((x) => x.creatorName === c.name && (x.brandName === brand || x.brandId === brand) && x.product === p.name && x.status !== "canceled").length;
          for (let i = existing; i < qty; i++) { const nc = await createPlannedContent(brand, c.name, p.name, d.brands, d.creators); d.contents.push(nc); created++; }
        }
      } else {
        for (const c of actives) {
          const qty = qOf(c.name);
          const label = `${brand} ${T("콘텐츠")}`;
          const existing = d.contents.filter((x) => x.creatorName === c.name && (x.brandName === brand || x.brandId === brand) && x.status !== "canceled" && (monthOf(x) === month || x.status === "planned")).length;
          for (let i = existing; i < qty; i++) { const nc = await createPlannedContent(brand, c.name, label, d.brands, d.creators); d.contents.push(nc); created++; }
        }
      }
      setTick((t) => t + 1);
      alert(created ? `${created}${T("건의 제작 일정을 생성했습니다.")}` : T("이미 최신 상태입니다."));
    } catch (e) { alert(T("생성 실패: ") + (e as Error).message); }
  }
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
      <span className="num" style={{ alignSelf: "center", color: "var(--faint)", fontSize: 12.5 }}>{month.slice(0, 4)}. {+month.slice(5)}{T("월")}</span>
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">{T("번호순")}</option>
        <option value="name">{T("이름순")}</option>
        <option value="assigned">{T("배정 많은순")}</option>
      </select>
      <button className="btn acc" style={{ marginLeft: "auto" }} onClick={generateSchedule}>{T("제작 일정 생성")}</button>
    </div>
    <div className={`assign-target ${diff === 0 ? "ok" : "over"}`}>
      <b>{brand}</b> · {month.slice(0, 4)}{T("년")} {+month.slice(5)}{T("월 계약")} <b>{target}</b>{T("건")} · {T("배정 합계")} <b>{sum}</b>{T("건")} — {diff === 0 ? T("계약과 일치") : diff > 0 ? `${diff}${T("건 초과")}` : `${-diff}${T("건 미배정")}`}
    </div>
    {(() => {
      // 이 달 전체 매칭 이상 감지 (계약과 어긋난 브랜드·크리에이터)
      const alerts: { level: "warning" | "critical"; t: string; s: string }[] = [];
      for (const b of d.brands) {
        const mc = d.contracts.find((c) => c.brandId === b.name && c.yearMonth === month);
        const inP = (!b.contractStart || b.contractStart <= month) && (!b.contractEnd || b.contractEnd >= month);
        const q = mc?.quota ?? (inP ? b.monthlyQuota : null);
        if (q == null) continue;
        const assigned = d.assignments.filter((a) => a.brandId === b.name && a.yearMonth === month).reduce((s, a) => s + a.quota, 0);
        if (assigned < q) alerts.push({ level: "warning", t: `${b.name} — ${T("배정")} ${assigned}/${q}`, s: `${q - assigned}${T("건 미배정")}` });
        else if (assigned > q) alerts.push({ level: "critical", t: `${b.name} — ${T("배정")} ${assigned}/${q}`, s: `${T("계약 수량")} ${assigned - q}${T("건 초과")}` });
      }
      for (const c of actives) {
        const cap = c.monthlyQuota; const tot = totalFor(c.name);
        if (cap && tot > cap) alerts.push({ level: "critical", t: `${withCode(c.name)} — ${T("월 배정")} ${tot}/${cap}`, s: `${T("계약 수량")} ${tot - cap}${T("건 초과")}` });
      }
      if (!alerts.length) return null;
      const color = { warning: "var(--warning)", critical: "var(--critical)" };
      return <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>⚠ {T("계약과 어긋난 매칭")} ({alerts.length})</div>
        {alerts.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "var(--surface-2)", borderLeft: `3px solid ${color[a.level]}`, fontSize: 12.5 }}>
          <b>{a.t}</b><span style={{ color: "var(--faint)" }}>· {a.s}</span></div>)}
      </div>;
    })()}
    {prods.length > 0 && <div className="callout" style={{ background: "var(--surface-2)", marginBottom: 12 }}><div style={{ width: "100%" }}>
      <div className="t" style={{ fontSize: 12 }}>{T("이 달")} {brand} PR {T("상품")} {prods.length}{T("개")}</div>
      <div className="s" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {prods.map((p) => p.url
          ? <a key={p.id} href={p.url} target="_blank" rel="noopener" className="chip" style={{ textDecoration: "none" }}>{p.name} ↗</a>
          : <span key={p.id} className="chip">{p.name}</span>)}
      </div></div></div>}
    <div className="tablewrap"><table><thead><tr><th>{T("크리에이터")}</th><th>{brand} {T("배정")}</th><th>{T("완료")}</th><th>{T("월 총배정/계약수량")}</th></tr></thead><tbody>
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

    {prods.length > 0 && <>
      <div className="sec-h"><h2>{T("상품별 배정")}</h2><span className="hint">{T("상품 × 크리에이터 콘텐츠 수량")}</span></div>
      <div className="tablewrap"><table><thead><tr>
        <th style={{ minWidth: 160 }}>{T("상품 \\ 크리에이터")}</th>
        {actives.map((c) => <th key={c.id} style={{ textAlign: "center" }}>{creatorCode(c.name) ?? c.name}</th>)}
        <th style={{ textAlign: "center" }}>{T("합계")}</th>
      </tr></thead><tbody>
        {prods.map((p) => (
          <tr key={p.id}>
            <td>{p.url ? <a href={p.url} target="_blank" rel="noopener" style={{ color: "var(--accent-ink)" }}>{p.name}</a> : <b>{p.name}</b>}</td>
            {actives.map((c) => {
              const v = pa[paKey(p.id, c.name)] ?? 0;
              return <td key={c.id} style={{ textAlign: "center" }}>
                <input className="rate-in" style={{ width: 46, textAlign: "center", background: v ? "var(--accent-weak)" : undefined }} type="number" min={0}
                  value={v || ""} onChange={(e) => setProdQty(p.id, c.name, Math.max(0, +e.target.value || 0))} />
              </td>;
            })}
            <td className="num" style={{ textAlign: "center", fontWeight: 600 }}>{prodRowTotal(p.id)}</td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid var(--border-strong)" }}>
          <td style={{ fontWeight: 600, color: "var(--muted)" }}>{T("크리에이터 합계")}</td>
          {actives.map((c) => <td key={c.id} className="num" style={{ textAlign: "center", fontWeight: 600 }}>{prodTotalFor(c.name)}</td>)}
          <td className="num" style={{ textAlign: "center", fontWeight: 700 }}>{prods.reduce((s, p) => s + prodRowTotal(p.id), 0)}</td>
        </tr>
      </tbody></table></div>
      <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 8 }}>{T("상품별로 크리에이터가 만들 콘텐츠 수량을 입력하세요. 셀에 숫자를 넣으면 자동 저장됩니다.")}</div>
    </>}
  </>);
}

/* 제작 일정 (기획/촬영/편집/업로드) — 관리자/크리에이터 편집, 브랜드 열람 */
const SCHED_STAGES: { k: string; label: string }[] = [
  { k: "plan", label: "기획" }, { k: "shoot", label: "촬영" }, { k: "edit", label: "편집" }, { k: "upload", label: "업로드" },
];
// 오늘(로컬) YYYY-MM-DD — 지연 판정용
function localToday(): string {
  try { return new Date().toLocaleDateString("sv-SE"); } catch { return "9999-12-31"; }
}
// 통합 제작 보드 행 (전략 브랜드 콘텐츠 + 외부 PR 안건)
interface ProdRow {
  key: string; type: "brand" | "pr"; creatorName: string; label: string; target: string;
  sched: ContentSched; uploaded: boolean; permalink?: string | null; stepLabel?: string;
  content?: Content; deal?: Deal;
}
function ScheduleEditor({ d, creatorName, brandName, readonly, includeDeals, month }: { d: Bundle; creatorName?: string; brandName?: string; readonly?: boolean; includeDeals?: boolean; month?: string }) {
  const [, setTick] = useState(0);
  const [fBrand, setFBrand] = useState(""); const [fCreator, setFCreator] = useState("");
  const [fType, setFType] = useState<"" | "brand" | "pr">(""); const [fStatus, setFStatus] = useState<"" | "up" | "plan">("");
  const groupByCreator = !creatorName;
  const today = localToday();
  const curMonth = today.slice(0, 7);
  // 콘텐츠 귀속 월: 업로드=게시월, 그 외=업로드 예정월, 없으면 null(미정)
  const effMonth = (c: Content): string | null => c.status === "uploaded" ? monthOf(c) : (c.sched.upload ? c.sched.upload.slice(0, 7) : null);
  const [fMonth, setFMonth] = useState(month ?? (ASSIGN_MONTHS.includes(curMonth) ? curMonth : ASSIGN_MONTHS[0]));
  const monthOpts = Array.from(new Set([...ASSIGN_MONTHS, ...(month ? [month] : []), curMonth])).sort();
  // 해당 월에 진행해야 하는 항목: 4단계 일정 중 하나라도 그 달이면 매칭. 날짜 미설정(미정)은 항상 노출(스케줄링 필요).
  const inMonth = (s: ContentSched) => {
    if (!fMonth) return true;
    const ds = [s.plan, s.shoot, s.edit, s.upload].filter(Boolean) as string[];
    if (!ds.length) return true; // 미정
    return ds.some((dt) => dt.slice(0, 7) === fMonth);
  };
  const byId = new Map(d.contents.map((c) => [c.id, c]));

  // 1) 전략 브랜드 콘텐츠 (kind=pr)
  const rows: ProdRow[] = [];
  for (const c of d.contents) {
    if (c.kind !== "pr" || c.status === "canceled") continue;
    if (creatorName && c.creatorName !== creatorName) continue;
    if (brandName && !(c.brandName === brandName || c.brandId === brandName)) continue;
    rows.push({ key: c.id, type: "brand", creatorName: c.creatorName, label: c.product, target: c.brandName ?? "", sched: c.sched, uploaded: c.status === "uploaded", permalink: c.permalink, content: c });
  }
  // 2) 외부 PR 안건 (deals) — 관리자·크리에이터 화면만 (브랜드에는 미노출)
  if (includeDeals) {
    for (const dl of d.deals) {
      if (creatorName && dl.creatorName !== creatorName) continue;
      const linked = dl.contentId ? byId.get(dl.contentId) : undefined;
      const up = !!(dl.contentId) || (dl.step >= 5 && !!dl.uploadDate);
      const sched: ContentSched = { ...(dl.sched ?? {}) };
      if (!sched.upload && dl.uploadDate) sched.upload = dl.uploadDate;
      rows.push({ key: "deal-" + dl.id, type: "pr", creatorName: dl.creatorName, label: dl.title, target: dl.client, sched, uploaded: up, permalink: linked?.permalink ?? null, stepLabel: DEAL_STEPS[dl.step], content: linked, deal: dl });
    }
  }
  // 필터
  const items = rows.filter((r) =>
    inMonth(r.sched)
    && (!fBrand || r.target === fBrand) && (!fCreator || r.creatorName === fCreator)
    && (!fType || r.type === fType) && (!fStatus || (fStatus === "up" ? r.uploaded : !r.uploaded))
  ).sort((a, b) => {
    if (groupByCreator) { const cc = cmpNameByCode(a.creatorName, b.creatorName); if (cc) return cc; }
    if (a.type !== b.type) return a.type === "brand" ? -1 : 1;
    return (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999");
  });
  // 요약
  const total = items.length, done = items.filter((r) => r.uploaded).length;
  const delayed = items.filter((r) => !r.uploaded && r.sched.upload && r.sched.upload < today).length;
  const colSpan = 2 + SCHED_STAGES.length + 2 + (readonly ? 0 : 1);

  // 전략 브랜드 진행 현황 (배정 수량 대비) — 선택 월 기준, 일정 없어도 배정 물량 전체 노출
  const showBrandProg = fType !== "pr" && !!fMonth;
  const brandProg = showBrandProg ? d.brands
    .filter((b) => (!brandName || b.name === brandName || b.id === brandName) && (!fBrand || b.name === fBrand))
    .map((b) => {
      const inP = (!b.contractStart || b.contractStart <= fMonth) && (!b.contractEnd || b.contractEnd >= fMonth);
      const asgQ = d.assignments.filter((a) => a.brandId === b.name && a.yearMonth === fMonth).reduce((s, a) => s + a.quota, 0);
      const mc = d.contracts.find((c) => c.brandId === b.name && c.yearMonth === fMonth);
      const quota = asgQ || mc?.quota || (inP ? (b.monthlyQuota ?? 0) : 0);
      const mine = d.contents.filter((c) => c.kind === "pr" && c.status !== "canceled" && (c.brandName === b.name || c.brandId === b.name) && (() => { const em = effMonth(c); return em === fMonth || em === null; })());
      const created = mine.length, uploaded = mine.filter((c) => c.status === "uploaded").length;
      return { b, quota, created, uploaded, inprog: created - uploaded, missing: Math.max(0, quota - created) };
    })
    .filter((x) => x.quota > 0 || x.created > 0)
    .sort((a, b) => (a.b.code ?? a.b.name).localeCompare(b.b.code ?? b.b.name)) : [];
  // 배정 대비 부족분(미생성) 계획 콘텐츠 생성
  async function genMissing(bn: string) {
    let created = 0;
    try {
      const asgs = d.assignments.filter((a) => a.brandId === bn && a.yearMonth === fMonth);
      for (const a of asgs) {
        const existing = d.contents.filter((x) => x.creatorName === a.creatorId && (x.brandName === bn || x.brandId === bn) && x.status !== "canceled" && (() => { const em = effMonth(x); return em === fMonth || em === null; })()).length;
        for (let i = existing; i < a.quota; i++) { const nc = await createPlannedContent(bn, a.creatorId, `${bn} ${T("콘텐츠")}`, d.brands, d.creators); d.contents.push(nc); created++; }
      }
      setTick((t) => t + 1);
      alert(created ? `${created}${T("건의 제작 일정을 생성했습니다.")}` : T("이미 최신 상태입니다."));
    } catch (e) { alert(T("생성 실패: ") + (e as Error).message); }
  }

  function setDate(r: ProdRow, stage: string, val: string) {
    const s = { ...r.sched, [stage]: val }; r.sched = s;
    if (r.type === "brand" && r.content) {
      r.content.sched = s; if (stage === "upload") r.content.plannedDate = val;
      updateContentSchedule(r.content.id, s as Record<string, string>, r.content.status).catch(() => { });
    } else if (r.deal) {
      r.deal.sched = s; if (stage === "upload") r.deal.uploadDate = val;
      updateDealSchedule(r.deal.id, s as Record<string, string>).catch(() => { });
    }
    setTick((t) => t + 1);
  }
  function setStatus(r: ProdRow, st: string) {
    if (r.type !== "brand" || !r.content) return;
    r.content.status = st as Content["status"]; r.uploaded = st === "uploaded"; setTick((t) => t + 1);
    updateContentSchedule(r.content.id, r.content.sched as Record<string, string>, st).catch(() => { });
  }
  async function del(r: ProdRow) {
    if (!r.content || r.type !== "brand") return;
    if (!confirm(`'${r.label}' ${T("일정을 삭제할까요?")}`)) return;
    try { await deleteContent(r.content.id); const i = d.contents.indexOf(r.content); if (i >= 0) d.contents.splice(i, 1); setTick((t) => t + 1); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); }
  }
  const stIn = { fontFamily: "var(--body)", fontSize: 12.5, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" } as const;
  return (<>
    {/* 요약 */}
    <div className="grid-kpi" style={{ marginBottom: 14 }}>
      <Kpi lab={T("총 제작")} val={total} unit={T("건")} />
      <Kpi lab={T("업로드 완료")} val={done} unit={T("건")} />
      <Kpi lab={T("진행중")} val={total - done} unit={T("건")} />
      <Kpi lab={T("지연")} val={delayed} unit={T("건")} dir={delayed ? "down" : undefined} />
    </div>
    {/* 필터 */}
    <div className="filterbar">
      <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}>{monthOpts.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}<option value="">{T("전체 기간")}</option></select>
      {includeDeals && <select value={fType} onChange={(e) => setFType(e.target.value as "" | "brand" | "pr")}><option value="">{T("전체 유형")}</option><option value="brand">{T("전략 브랜드")}</option><option value="pr">{T("외부 PR")}</option></select>}
      {!brandName && <select value={fBrand} onChange={(e) => setFBrand(e.target.value)}><option value="">{T("전체 대상")}</option>{Array.from(new Set(rows.map((r) => r.target).filter(Boolean))).sort().map((t) => <option key={t} value={t}>{t}</option>)}</select>}
      {!creatorName && <select value={fCreator} onChange={(e) => setFCreator(e.target.value)}><option value="">{T("전체 크리에이터")}</option>{d.creators.sort(cmpCreatorByCode).map((c) => <option key={c.id} value={c.name}>{withCode(c.name)}</option>)}</select>}
      <select value={fStatus} onChange={(e) => setFStatus(e.target.value as "" | "up" | "plan")}><option value="">{T("전체 상태")}</option><option value="plan">{T("진행중")}</option><option value="up">{T("업로드")}</option></select>
      <span className="count">{items.length}{T("건")}</span>
    </div>
    {/* 전략 브랜드 진행 현황 */}
    {showBrandProg && brandProg.length > 0 && <div style={{ marginBottom: 14 }}>
      <div className="sec-h" style={{ margin: "0 0 8px" }}><h2 style={{ fontSize: 14 }}>{T("전략 브랜드 진행 현황")}</h2><span className="hint">{fMonth.slice(0, 4)}. {+fMonth.slice(5)}{T("월")} · {T("배정 물량 기준")}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(215px,1fr))", gap: 10 }}>
        {brandProg.map(({ b, quota, uploaded, inprog, missing }) => {
          const upPct = quota ? Math.min(100, uploaded / quota * 100) : (uploaded ? 100 : 0);
          const ipPct = quota ? Math.min(100 - upPct, inprog / quota * 100) : 0;
          return <div key={b.id} className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="chip"><span className="sw" style={{ background: b.color ?? BRAND_COLOR[b.name] ?? "var(--surface-3)" }} /><b>{b.name}</b></span>
              <span className="num" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700 }}>{uploaded}<span style={{ color: "var(--faint)" }}>/{quota || "—"}</span></span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: "var(--surface-3)", overflow: "hidden", display: "flex", marginBottom: 8 }}>
              <span style={{ width: `${upPct}%`, background: "#3fb984" }} />
              <span style={{ width: `${ipPct}%`, background: "var(--accent)" }} />
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11.5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "#3fb984", fontWeight: 600 }}>● {T("업로드")} {uploaded}</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>● {T("진행중")} {inprog}</span>
              {missing > 0 && <span style={{ color: "#d98a4a", fontWeight: 600 }}>● {T("미생성")} {missing}</span>}
              {!readonly && missing > 0 && <button className="btn sm" style={{ marginLeft: "auto", padding: "3px 8px", fontSize: 11 }} onClick={() => genMissing(b.name)}>+ {T("일정 생성")}</button>}
            </div>
          </div>;
        })}
      </div>
    </div>}
    {!items.length ? <div className="placeholder">{T("등록된 제작 일정이 없어요. 위 ‘전략 브랜드 진행 현황’에서 배정 물량을 확인하고 ‘일정 생성’으로 만들 수 있어요.")}</div> :
      <div className="tablewrap"><table><thead><tr>
        <th>{T("콘텐츠")}</th><th>{T("구분")}</th>
        {SCHED_STAGES.map((s) => <th key={s.k}>{T(s.label)}</th>)}<th>{T("상태")}</th><th>{T("콘텐츠")}</th>{!readonly && <th></th>}
      </tr></thead><tbody>
        {items.map((r, i) => {
          const newGroup = groupByCreator && r.creatorName !== (i > 0 ? items[i - 1].creatorName : null);
          const isDelay = !r.uploaded && r.sched.upload && r.sched.upload < today;
          const noDates = !r.sched.plan && !r.sched.shoot && !r.sched.edit && !r.sched.upload;
          const canEdit = !readonly;
          return (<Fragment key={r.key}>
          {newGroup && <tr><td colSpan={colSpan} style={{ background: "var(--surface-2)", fontWeight: 700, fontSize: 12.5, padding: "8px 10px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar name={r.creatorName} size={22} radius={11} />{withCode(r.creatorName)}</span>
          </td></tr>}
          <tr>
            <td style={{ paddingLeft: 22 }}><b style={{ fontSize: 13 }}>{r.label}</b>{isDelay && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: "var(--critical)" }}>{T("지연")}</span>}{noDates && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: "var(--faint)" }}>{T("일정 미정")}</span>}</td>
            <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="tag" style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: r.type === "brand" ? "color-mix(in srgb,var(--accent) 18%,transparent)" : "color-mix(in srgb,#c9793a 20%,transparent)", color: r.type === "brand" ? "var(--accent)" : "#d98a4a" }}>{r.type === "brand" ? T("전략") : T("PR")}</span>
              {r.type === "brand" ? <span className="chip"><span className="sw" style={{ background: BRAND_COLOR[r.target] ?? "var(--surface-3)" }} />{r.target}</span> : <span style={{ fontSize: 12.5 }}>{r.target}</span>}
            </span></td>
            {SCHED_STAGES.map((s) => <td key={s.k}>
              {canEdit ? <input type="date" style={{ ...stIn, cursor: "pointer" }} value={r.sched[s.k as keyof ContentSched] ?? ""} onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* noop */ } }} onChange={(e) => setDate(r, s.k, e.target.value)} />
                : <span className="num" style={{ color: r.sched[s.k as keyof ContentSched] ? "var(--ink)" : "var(--faint)" }}>{r.sched[s.k as keyof ContentSched] || "—"}</span>}
            </td>)}
            <td>{(canEdit && r.type === "brand") ? <select style={stIn} value={r.uploaded ? "uploaded" : "planned"} onChange={(e) => setStatus(r, e.target.value)}><option value="planned">{T("예정")}</option><option value="uploaded">{T("업로드")}</option></select>
              : <span className={`pill ${r.uploaded ? "p-ok" : "p-plan"}`}><span className="d" />{r.uploaded ? T("업로드") : (r.type === "pr" ? (r.stepLabel ?? T("예정")) : T("예정"))}</span>}</td>
            <td>{r.permalink ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <a className="btn sm" href={r.permalink} target="_blank" rel="noreferrer" style={{ padding: "4px 9px", fontSize: 11.5 }}>▶ {T("보기")}</a>
                {r.content && r.content.views > 0 && <span className="num" style={{ fontSize: 11.5, color: "var(--muted)" }} title={T("참여율")}>{engRate(r.content)}% · {fmt(r.content.views)}</span>}
              </span> : <span style={{ color: "var(--faint)", fontSize: 12 }}>—</span>}</td>
            {!readonly && <td style={{ textAlign: "right" }}>{r.type === "brand" ? <button className="btn" style={{ padding: "5px 9px", fontSize: 11.5, color: "var(--critical)", borderColor: "var(--critical)" }} onClick={() => del(r)}>{T("삭제")}</button> : null}</td>}
          </tr>
          </Fragment>);
        })}
      </tbody></table></div>}
    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 8 }}>{T("전략 브랜드 콘텐츠와 외부 PR 안건의 기획·촬영·편집·업로드 일정이 한 화면에 모입니다. 업로드되면 브랜드·관리자가 링크와 인게이지먼트를 바로 확인합니다.")}</div>
  </>);
}

/* 비용 관리 (단가 · 고정비 편집) */
function CostTable({ creators }: { creators: Creator[] }) {
  const [, setTick] = useState(0);
  const list = [...creators].sort(cmpCreatorByCode);
  return (
    <div className="tablewrap"><table><thead><tr>
      <th>{T("크리에이터")}</th><th>{T("릴스 1건당")}</th><th>{T("2차 활용")}</th><th>{T("오프라인 방문 PR")}</th><th>{T("월 고정비")}</th><th>{T("월 예상(릴스)")}</th>
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
  const codeNum = (c: Creator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const actives = creators.filter((c) => c.status === "active").sort((a, b) => codeNum(a) - codeNum(b) || a.name.localeCompare(b.name));
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
    if (pct >= 40) cards.push({ t: T("성장 가속 중"), s: `${T("최근 12주 팔로워 +")}${pct.toFixed(0)}${T("%. 상위 성장세, 현재 포맷 유지·시리즈화 권장.")}` });
    else if (pct >= 15) cards.push({ t: T("안정적 성장"), s: `+${pct.toFixed(0)}${T("% 성장. 업로드 빈도를 늘리면 곡선을 끌어올릴 수 있습니다.")}` });
    else cards.push({ t: T("성장 정체"), s: `+${pct.toFixed(0)}${T("%. 새 훅·주제 실험, 트렌드 오디오 활용 권장.")}` });
    if (ups.length) { const best = [...ups].sort((a, b) => parseFloat(engRate(b)) - parseFloat(engRate(a)))[0]; cards.push({ t: T("베스트 콘텐츠"), s: `‘${best.product}’${T("가 참여율")} ${engRate(best)}${T("로 최고. 유사 포맷 반복 추천.")}` }); }
    if (aud.female >= 0 && aud.regions.length) cards.push({ t: T("오디언스 제안"), s: `${T("주 시청층 여성")} ${aud.female}%·${aud.ages.slice().sort((a, b) => b[1] - a[1])[0][0]}, ${aud.regions[0][0]} ${T("중심. 해당 층 주제 강화.")}` });
    setAi(cards);
  }
  return (<>
    <div className="filterbar"><select value={name} onChange={(e) => { setName(e.target.value); setAi(null); }}>{actives.map((x) => <option key={x.id} value={x.name}>{withCode(x.name)} · {x.handle}</option>)}</select></div>
    <div className="grid-kpi">
      <Kpi lab={T("팔로워")} val={fmt(c.followers)} delta={`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ${T("(12주)")}`} dir={pct >= 0 ? "up" : "down"} spark={series.map((v) => v / 1000)} />
      <Kpi lab={T("순증 (12주)")} val={`+${fmt(series[series.length - 1] - series[0])}`} />
      <Kpi lab={T("평균 참여율")} val={avgEng.toFixed(1)} unit="%" /><Kpi lab={T("업로드")} val={ups.length} unit={T("건")} />
    </div>
    <div className="two">
      <div className="card pad"><div className="sec-h" style={{ margin: "0 0 6px" }}><h2>{T("팔로워 추이")}</h2><span className="hint">{c.handle} · {T("최근 12주")}</span></div><div style={{ marginTop: 8 }}><Spark data={series} /></div></div>
      <div className="card pad"><div className="sec-h" style={{ margin: "0 0 14px" }}><h2>{T("오디언스")}</h2></div>
        {aud.female < 0 ? <div className="note">{T("오디언스 데이터는 Instagram 인사이트 연동 후 표시됩니다.")}</div> : <>
          <div className="donut-wrap"><Donut pct={aud.female} label={T("여성")} /><div className="legend"><div className="it"><span className="sw" style={{ background: "var(--accent)" }} />{T("여성")} <b className="num">{aud.female}%</b></div><div className="it"><span className="sw" style={{ background: "var(--surface-3)" }} />{T("남성")} <b className="num">{100 - aud.female}%</b></div></div></div>
          <div className="sec-h" style={{ margin: "18px 0 8px" }}><h2>{T("연령대")}</h2></div>
          <Bars items={aud.ages} />
        </>}
      </div>
    </div>
    <div className="card pad" style={{ marginTop: 18 }}>
      <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>✨ {T("AI 성장 코치")}</h2><button className="btn acc" onClick={runAI}>{T("분석 실행")}</button></div>
      {!ai ? <div className="note">{T("‘분석 실행’을 누르면 성장률·아카이브 콘텐츠를 분석해 피드백과 추천을 제공합니다.")}</div>
        : ai.map((f, i) => <div key={i} className="ai-card"><span className="ic">★</span><div><div className="t">{f.t}</div><div className="s">{f.s}</div></div></div>)}
    </div>
    <div className="sec-h" style={{ marginTop: 22 }}><h2>{withCode(name)} {T("콘텐츠 아카이브")}</h2><span className="hint">{T("이 크리에이터의 SNS 콘텐츠")}</span></div>
    <ContentArchive contents={contents.filter((x) => x.creatorName === name)} showCreator={false} />
  </>);
}

/* 계정·권한 */
function AccountsTable({ creators, brands, email }: { creators: Creator[]; brands?: Brand[]; email?: string }) {
  const master = isMaster(email);
  const [, setTick] = useState(0);
  const [invite, setInvite] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fRole, setFRole] = useState("");
  const [pwTarget, setPwTarget] = useState<AccountRow | null>(null);
  const load = useCallback(async () => {
    if (!supabaseConfigured()) { setRows(ACCOUNTS.map((a, i) => ({ id: String(i), email: a.email, role: a.role, scope: a.scope, status: a.status, lastLogin: a.lastLogin }))); return; }
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (session) {
        const res = await fetch("/api/account/list", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) { const j = await res.json(); setRows(j.rows ?? []); return; }
      }
    } catch { /* fallback */ }
    getAccounts().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = rows.filter((a) => !fRole || a.role === fRole);
  const ROLE: Record<string, string> = { admin: T("관리자"), brand: T("브랜드"), creator: T("크리에이터") };
  const ST: Record<string, [string, string]> = { active: ["p-ok", T("활성")], pending: ["p-warn", T("초대중")], disabled: ["p-plan", T("비활성")] };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function bulkDelete() {
    const ids = [...sel];
    if (!ids.length || !confirm(`${T("선택한")} ${ids.length}${T("개 계정을 삭제할까요? 되돌릴 수 없습니다.")}`)) return;
    setBusy(true);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { alert(T("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)")); setBusy(false); return; }
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ ids }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) alert(T("삭제 실패: ") + (j.error || res.status));
      else if (j.errors?.length) alert(`${j.ok}${T("개 삭제")} · ${j.errors.join(", ")}`);
      setSel(new Set()); load();
    } catch (e) { alert(T("삭제 실패: ") + (e as Error).message); }
    setBusy(false); setTick((t) => t + 1);
  }
  return (<>
    <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("계정·권한")}</h2>
      <span style={{ display: "flex", gap: 8 }}>
        {master && sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} disabled={busy} onClick={bulkDelete}>{T("선택 삭제")} ({sel.size})</button>}
        <button className="btn" onClick={() => setBulk(true)}>{T("일괄 등록")}</button>
        <button className="btn acc" onClick={() => setInvite(true)}>+ {T("계정 생성")}</button>
      </span></div>
    {!master && <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{T("※ 계정 삭제·관리자 생성은 마스터 관리자만 가능합니다.")}</div>}
    <div className="filterbar">
      <select value={fRole} onChange={(e) => setFRole(e.target.value)}>
        <option value="">{T("전체")}</option><option value="admin">{T("관리자")}</option><option value="brand">{T("브랜드")}</option><option value="creator">{T("크리에이터")}</option>
      </select>
      <span className="count">{filtered.length}{T("명")}</span>
    </div>
    <div className="tablewrap"><table><thead><tr>
      {master && <th style={{ width: 34 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every((a) => sel.has(a.id))} onChange={() => { const all = filtered.every((a) => sel.has(a.id)); setSel(all ? new Set() : new Set(filtered.map((a) => a.id))); }} aria-label={T("전체 선택")} /></th>}
      <th>{T("이메일")}</th><th>{T("역할")}</th><th>{T("소속")}</th><th>{T("상태")}</th><th>{T("마지막 로그인")}</th><th></th>
    </tr></thead><tbody>
      {filtered.map((a) => (
        <tr key={a.id} style={master && sel.has(a.id) ? { background: "var(--accent-weak)" } : undefined}>
          {master && <td><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={a.email} /></td>}
          <td><b>{displayId(a.email)}</b></td><td><span className={`pill ${a.role === "admin" ? "p-ok" : "p-plan"}`}><span className="d" />{ROLE[a.role]}</span></td>
          <td>{a.role === "admin" ? "81degree" : <span className="chip">{a.scope}</span>}</td>
          <td><span className={`pill ${(ST[a.status] ?? ST.active)[0]}`}><span className="d" />{(ST[a.status] ?? ST.active)[1]}</span></td>
          <td className="num" style={{ color: "var(--muted)" }}>{localDT(a.lastLogin) ?? T("로그인 기록 없음")}</td>
          <td style={{ textAlign: "right" }}><button className="btn" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => setPwTarget(a)}>{T("비번 변경")}</button></td></tr>
      ))}
    </tbody></table></div>
    {!filtered.length && <div className="placeholder">{T("등록된 계정이 없어요.")}</div>}
    {invite && <InviteModal creators={creators} brands={brands} canMakeAdmin={master} onClose={() => setInvite(false)} onSaved={() => { setInvite(false); load(); }} />}
    {bulk && <BulkAccountModal creators={creators} brands={brands} canMakeAdmin={master} onClose={() => setBulk(false)} onSaved={load} />}
    {pwTarget && <PasswordModal account={pwTarget} onClose={() => setPwTarget(null)} />}
  </>);
}

function BulkAccountModal({ creators, brands, canMakeAdmin, onClose, onSaved }: { creators: Creator[]; brands?: Brand[]; canMakeAdmin?: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false); const [ok, setOk] = useState(0); const [err, setErr] = useState("");
  const parsed = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((s) => s.trim()));
  // 아이디 또는 이메일 허용. 마스터가 아니면 admin 역할 행은 제외
  const valid = parsed.filter((r) => r[0] && (canMakeAdmin || (r[1] ?? "brand") !== "admin"));
  async function run() {
    if (!valid.length) { setErr(T("등록할 행이 없습니다")); return; }
    setBusy(true); setErr(""); setOk(0);
    const { data: { session } } = await getSupabase().auth.getSession();
    if (!session) { setErr(T("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)")); setBusy(false); return; }
    for (const r of valid) {
      const [email, role = "brand", scope = "", password = genPassword()] = r;
      const finalScope = role === "admin" ? "81degree" : scope;
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ email, role, scope: finalScope, password }) });
      if (res.ok) setOk((v) => v + 1);
    }
    setBusy(false); onSaved(); onClose();
  }
  return (
    <Modal title={T("계정 일괄 등록")} onClose={onClose} width={540}
      footer={<><button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" disabled={busy || !valid.length} onClick={run}>{busy ? `${T("등록 중…")} (${ok}/${valid.length})` : `${valid.length}${T("개 등록")}`}</button></>}>
      <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 8 }}>
        {T("한 줄에 한 계정 (탭 또는 콤마 구분). 비밀번호 생략 시 자동 생성됩니다.")}<br />
        {T("순서:")} <b>{T("아이디/이메일 · 역할(admin/brand/creator) · 소속 · 비밀번호")}</b>
      </div>
      <textarea style={{ ...inp, minHeight: 160, fontFamily: "var(--mono)", fontSize: 12.5 }}
        placeholder={"abib_kim\tbrand\tabib\nmerumi\tcreator\tmerumi"}
        value={text} onChange={(e) => setText(e.target.value)} />
      <div className="note" style={{ marginTop: 8 }}>{T("인식된 행:")} <b className="num">{valid.length}</b></div>
      {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

function PasswordModal({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [pw, setPw] = useState(genPassword());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [ok, setOk] = useState(false);
  async function save() {
    if (pw.length < 6) { setErr(T("비밀번호는 6자 이상")); return; }
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { setErr(T("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)")); setBusy(false); return; }
      const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id: account.id, password: pw }) });
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(j.error || T("변경 실패")); return; }
      setOk(true);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title={T("비밀번호 변경")} onClose={onClose} width={420}
      footer={ok ? <button className="btn acc" onClick={onClose}>{T("완료")}</button>
        : <><button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" disabled={busy} onClick={save}>{busy ? T("변경 중…") : T("변경")}</button></>}>
      <div className="note" style={{ marginBottom: 12 }}>{displayId(account.email)} · {account.scope}</div>
      {ok ? <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.9 }}>
        <div style={{ color: "var(--accent-ink)", fontFamily: "var(--body)", marginBottom: 6 }}>{T("✓ 비밀번호가 변경되었습니다. 담당자에게 전달하세요.")}</div>
        <div>{T("아이디:")} {displayId(account.email)}</div>
        <div>{T("비밀번호:")} {pw}</div>
      </div> : <>
        <Field label={T("새 비밀번호")}>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn sm" onClick={() => setPw(genPassword())}>{T("자동생성")}</button>
          </div>
        </Field>
        {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 8 }}>{err}</div>}
      </>}
    </Modal>
  );
}

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function InviteModal({ onClose, onSaved, creators, brands, canMakeAdmin }: { onClose: () => void; onSaved: () => void; creators: Creator[]; brands?: Brand[]; canMakeAdmin?: boolean }) {
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
    if (!email.trim()) { setErr(T("이메일을 입력해주세요")); return; }
    if (password.length < 6) { setErr(T("비밀번호는 6자 이상")); return; }
    if (supabaseConfigured()) {
      setBusy(true); setErr("");
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { setErr(T("관리자 로그인이 필요합니다 (비밀번호로 로그인 후)")); setBusy(false); return; }
      const res = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: email.trim(), role, scope: finalScope, password }),
      });
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(j.error || T("생성 실패")); return; }
      setOk(true); onSaved();
      return;
    }
    ACCOUNTS.push({ email: email.trim(), role, scope: finalScope, status: "active", lastLogin: null });
    onSaved(); onClose();
  }
  return (
    <Modal title={T("계정 생성")} onClose={onClose} width={440}
      footer={ok ? <button className="btn acc" onClick={onClose}>{T("완료")}</button>
        : <><button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" disabled={busy} onClick={save}>{busy ? T("생성 중…") : T("계정 생성")}</button></>}>
      {ok ? <div>
        <div className="note" style={{ color: "var(--accent-ink)", marginBottom: 12 }}>{T("✓ 계정 생성 완료 — 아래 정보를 담당자에게 전달하세요.")}</div>
        <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.9 }}>
          <div>{T("사이트:")} https://cc-os.81degree.com</div>
          <div>{T("아이디:")} {email}</div>
          <div>{T("비밀번호:")} {password}</div>
          <div>{T("권한:")} {role === "brand" ? finalScope + T(" 브랜드") : role === "creator" ? finalScope + T(" 크리에이터") : T("관리자")}</div>
        </div>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(`${T("사이트:")} https://cc-os.81degree.com\n${T("아이디:")} ${email}\n${T("비밀번호:")} ${password}`)}>{T("복사")}</button>
      </div> : <>
        <Field label={T("아이디 또는 이메일")}><input style={inp} type="text" placeholder={T("아이디 (예: abib_kim)")} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Field label={T("역할")}><select style={inp} value={role} onChange={(e) => { setRole(e.target.value as "admin" | "brand" | "creator"); }}>{canMakeAdmin && <option value="admin">{T("관리자")}</option>}<option value="brand">{T("브랜드")}</option><option value="creator">{T("크리에이터")}</option></select></Field>
          <Field label={T("소속")}><select style={inp} value={scope} onChange={(e) => setScope(e.target.value)} disabled={role === "admin"}>{scopes.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        </div>
        <Field label={T("비밀번호 (담당자에게 전달)")}>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={inp} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn sm" onClick={() => setPassword(genPassword())}>{T("자동생성")}</button>
          </div>
        </Field>
        <div style={{ fontSize: 12, color: "var(--faint)" }}>{T("이메일 발송 없이 계정 생성 + 역할·소속 자동 연결. 생성 후 이메일·비번을 담당자에게 직접 전달하세요.")}</div>
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
      risks.push({ level: "critical", t: `${withCode(c.name)} — ${T("Instagram 연동")} ${c.ig.status === "expired" ? T("만료") : T("해지")}`, s: T("자동 수집 중단. 재연동 요청 필요.") });
    else { const du = daysUntil(c.ig?.expiresAt); if (du != null && du <= 14) risks.push({ level: du < 0 ? "critical" : "warning", t: `${withCode(c.name)} — IG ${T("토큰")} ${du < 0 ? T("만료 경과") : `${T("만료")} D-${du}`}`, s: T("연동 갱신이 필요합니다.") }); }
  }
  // 2) 크리에이터 계약 종료 임박 (D-30)
  for (const c of d.creators) { const du = daysUntil(c.contractEnd); if (du != null && du <= 30) risks.push({ level: du < 0 ? "critical" : "warning", t: `${withCode(c.name)} — ${T("계약")} ${du < 0 ? T("만료됨") : T("종료 임박")} (${c.contractEnd})`, s: du < 0 ? T("재계약 또는 정리 확인 필요.") : `D-${du}. ${T("재계약 검토 권장.")}` }); }
  // 3) 브랜드 계약 종료월 도래
  for (const b of d.brands) { if (b.contractEnd && b.contractEnd <= todayMonth) risks.push({ level: "warning", t: `${b.name} — ${T("브랜드 계약 종료월")} (${b.contractEnd})`, s: T("연장 여부 확인이 필요합니다.") }); }
  // 4) 이번 달 브랜드 배정 미달
  for (const b of d.brands) {
    if (b.monthlyQuota == null) continue;
    const inPeriod = (!b.contractStart || b.contractStart <= todayMonth) && (!b.contractEnd || b.contractEnd >= todayMonth);
    if (!inPeriod) continue;
    const assigned = d.assignments.filter((a) => a.brandId === b.name && a.yearMonth === todayMonth).reduce((s, a) => s + a.quota, 0);
    if (assigned < b.monthlyQuota) risks.push({ level: "warning", t: `${b.name} — ${+todayMonth.slice(5)}${T("월 배정 미달")} (${assigned}/${b.monthlyQuota})`, s: `${b.monthlyQuota - assigned}${T("건 미배정. 배정 관리에서 채워주세요.")}` });
  }
  // 5) 납기 임박·경과 PR 안건
  for (const dl of d.deals) { if (dl.step >= 5) continue; const du = daysUntil(dl.dueDate); if (du != null && du <= 3) risks.push({ level: du < 0 ? "critical" : "warning", t: `${dl.title} · ${withCode(dl.creatorName)} — ${T("납기")} ${du < 0 ? T("경과") : `D-${du}`}`, s: `${dl.client} · ${T("현재 단계:")} ${DEAL_STEPS[dl.step]}` }); }
  const order = { critical: 0, warning: 1, info: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
}
function RiskList({ d }: { d: Bundle }) {
  const risks = computeRisks(d);
  const color: Record<string, string> = { critical: "var(--critical)", warning: "var(--warning)", info: "var(--muted)" };
  const label: Record<string, string> = { critical: T("긴급"), warning: T("주의"), info: T("정보") };
  if (!risks.length) return <div className="placeholder">{T("현재 감지된 계약 리스크가 없습니다. ✓")}</div>;
  return (<>
    <div className="grid-kpi" style={{ marginBottom: 16 }}>
      <Kpi lab={T("전체 리스크")} val={String(risks.length)} />
      <Kpi lab={T("긴급")} val={String(risks.filter((r) => r.level === "critical").length)} />
      <Kpi lab={T("주의")} val={String(risks.filter((r) => r.level === "warning").length)} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {risks.map((r, i) => (<div key={i} className="card pad" style={{ borderLeft: `3px solid ${color[r.level]}` }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}><span className="chip" style={{ marginRight: 8, color: color[r.level] }}>{label[r.level]}</span>{r.t}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{r.s}</div></div>))}
    </div>
  </>);
}

/* ── DEAL LIST (admin & creator 공용) ───── */
const DEAL_STEPS = [T("인입"), T("매니저 검토"), T("크리에이터 협의"), T("의뢰사 전달"), T("계약 성사"), T("제작·업로드"), T("청구서 발행"), T("입금 확인")];
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
  // 납기 지연/임박 감지 (업로드 전 step<5 & 납기일 기준)
  const dueDays = (dl: Deal) => dl.dueDate ? Math.round((new Date(dl.dueDate).getTime() - Date.now()) / 86400000) : null;
  const atRisk = deals.filter((dl) => dl.step < 5 && dueDays(dl) != null && (dueDays(dl) as number) <= 3)
    .sort((a, b) => (dueDays(a) as number) - (dueDays(b) as number));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = list.length > 0 && list.every((dl) => sel.has(dl.id));
  async function bulkDelete() {
    const targets = list.filter((dl) => sel.has(dl.id));
    if (!targets.length || !confirm(`${T("선택한")} ${targets.length}${T("건의 PR 안건을 삭제할까요? 되돌릴 수 없습니다.")}`)) return;
    try { for (const dl of targets) { await deleteDeal(dl.id); const i = deals.indexOf(dl); if (i >= 0) deals.splice(i, 1); } setSel(new Set()); setTick((t) => t + 1); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); setTick((t) => t + 1); }
  }

  return (
    <>
      {!readonly && <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("PR 안건 관리")}</h2>
        <span style={{ display: "flex", gap: 8 }}>
          {sel.size > 0 && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} onClick={bulkDelete}>{T("선택 삭제")} ({sel.size})</button>}
          <button className="btn" onClick={() => setView(view === "list" ? "card" : "list")}>{view === "list" ? T("카드 보기") : T("목록 보기")}</button>
          <button className="btn acc" onClick={() => setEdit(null)}>+ {T("안건 추가")}</button>
        </span></div>}
      {!readonly && atRisk.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--critical)" }}>⚠ {T("납기 지연·임박 PR 안건")} ({atRisk.length})</div>
        {atRisk.map((dl) => { const du = dueDays(dl) as number; const over = du < 0;
          return <button key={dl.id} onClick={() => setEdit(dl)} style={{ textAlign: "left", display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "var(--surface-2)", borderLeft: `3px solid ${over ? "var(--critical)" : "var(--warning)"}`, fontSize: 12.5, border: 0, cursor: "pointer", width: "100%" }}>
            <b>{dl.title}</b><span style={{ color: "var(--faint)" }}>· {dl.client} · {withCode(dl.creatorName)}</span>
            <span style={{ marginLeft: "auto", color: over ? "var(--critical)" : "var(--warning)", fontWeight: 700 }}>{over ? `${T("납기 경과")} ${-du}${T("일")}` : du === 0 ? T("오늘 납기") : `D-${du}`}</span>
          </button>; })}
      </div>}
      {!readonly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button className={`chip ${fStep === "" ? "p-acc" : ""}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setFStep("")}>{T("전체")} {deals.length}</button>
          {STEPS.map((s, i) => (
            <button key={i} className={`chip ${fStep === String(i) ? "p-acc" : ""}`} style={{ cursor: "pointer", border: 0 }} onClick={() => setFStep(fStep === String(i) ? "" : String(i))}>{s} {counts[i]}</button>
          ))}
        </div>
      )}
      {!readonly && (
        <div className="filterbar">
          <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">{T("전체 월")}</option>{months.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}</select>
          <select value={fManager} onChange={(e) => setFManager(e.target.value)}><option value="">{T("전체 매니저")}</option>{managers.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <select value={fCreator} onChange={(e) => setFCreator(e.target.value)}><option value="">{T("전체 크리에이터")}</option>{dealCreators.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date_desc">{T("최신 날짜순")}</option>
            <option value="date_asc">{T("오래된 날짜순")}</option>
            <option value="step">{T("진행 단계순")}</option>
          </select>
          <input placeholder={T("안건·의뢰사 검색")} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{list.length}{T("건")}</span>
        </div>
      )}
      {!list.length ? <div className="placeholder">{T("조건에 맞는 PR 안건이 없어요.")}</div> :
       view === "list" ? (
        <div className="tablewrap"><table><thead><tr>
          {!readonly && <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={() => setSel(allChecked ? new Set() : new Set(list.map((dl) => dl.id)))} aria-label={T("전체 선택")} /></th>}
          <th>{T("안건")}</th><th>{T("의뢰사")}</th><th>{T("크리에이터")}</th><th>{T("담당")}</th><th>{T("단계")}</th><th>{T("PR 비용")}</th><th>{T("납기")}</th>{!readonly && <th></th>}
        </tr></thead><tbody>
          {list.map((dl) => (
            <tr key={dl.id} style={!readonly && sel.has(dl.id) ? { background: "var(--accent-weak)" } : undefined}>
              {!readonly && <td><input type="checkbox" checked={sel.has(dl.id)} onChange={() => toggle(dl.id)} aria-label={`${dl.title} ${T("선택")}`} /></td>}
              <td><b style={{ cursor: readonly ? "default" : "pointer" }} onClick={() => !readonly && setEdit(dl)}>{dl.title}</b> <span className={`chip ${dl.type === "ahchannel" ? "p-acc" : ""}`}>{dl.type === "ahchannel" ? "ah!channel" : T("개별")}</span></td>
              <td style={{ color: "var(--muted)" }}>{dl.client}</td>
              <td>{withCode(dl.creatorName)}</td>
              <td style={{ color: "var(--muted)" }}>{dl.manager}</td>
              <td><span className={`pill ${dl.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{STEPS[dl.step]}</span></td>
              <td className="num">{yen(dl.fee)}</td>
              <td className="num" style={{ color: "var(--muted)" }}>{md(dl.dueDate ?? undefined)}</td>
              {!readonly && <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {dl.step < 7 && <button className="btn sm" style={{ marginRight: 6 }} onClick={() => { dl.step++; setTick((t) => t + 1); setDealStep(dl.id, dl.step).catch(() => { }); }}>{T("다음")} →</button>}
                <button className="btn sm" onClick={() => setEdit(dl)}>{T("수정")}</button>
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
              <input type="checkbox" checked={sel.has(dl.id)} onChange={() => toggle(dl.id)} /> {T("선택")}</label>}
            <div className="hd">
              <Avatar name={dl.client} size={36} radius={9} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{dl.title} <span className={`chip ${dl.type === "ahchannel" ? "p-acc" : ""}`} style={{ marginLeft: 4 }}>{dl.type === "ahchannel" ? "ah!channel" : T("개별")}</span></div>
                <div style={{ color: "var(--faint)", fontSize: 12, marginTop: 2 }}>{dl.client} · {withCode(dl.creatorName)} · {T("담당")} {dl.manager}</div>
              </div>
              <span className={`pill ${dl.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{STEPS[dl.step]}</span>
            </div>
            {dl.brief && <div className="callout" style={{ background: "var(--surface-2)", marginTop: 12 }}><div><div className="t" style={{ fontSize: 12 }}>{T("요청 콘텐츠 브리핑")}</div><div className="s">{dl.brief}</div></div></div>}
            <div className="stepper">
              {STEPS.map((s, i) => { const cls = i < dl.step ? "done" : i === dl.step ? "now" : "";
                return <div className={`step ${cls}`} key={i}><span className="dot">{i < dl.step ? "✓" : i + 1}</span><span className="lbl">{s}</span>{i < STEPS.length - 1 && <span className="line" />}</div>; })}
            </div>
            <div className="row" style={{ marginTop: 12, gap: 22, fontSize: 12.5 }}>
              <span>{T("PR 비용")} <b className="num">{yen(dl.fee)}</b></span>
              <span>{T("쉐어")} <b className="num">{dl.shareCompany}:{dl.shareCreator}</b></span>
              <span>{T("납기")} <b className="num">{md(dl.dueDate ?? undefined)}</b></span>
              <span>{T("업로드")} <b className="num">{md(dl.uploadDate ?? undefined)}</b></span>
            </div>
            {ct && <div className="note" style={{ marginTop: 10 }}>{T("업로드 콘텐츠:")} {ct.permalink ? <a href={ct.permalink} target="_blank" rel="noopener" style={{ color: "var(--accent-ink)" }}>{ct.permalink}</a> : "—"} · {T("조회")} <b className="num">{fmt(ct.views)}</b></div>}
            {!readonly && <div className="frow" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              {dl.step >= 4 && <button className="btn sm" onClick={() => setInvoice(dl)}>{T("청구서")}</button>}
              {dl.step < 7 && <button className="btn acc sm" onClick={() => { dl.step++; setTick((t) => t + 1); setDealStep(dl.id, dl.step).catch(() => { }); }}>{T("다음 단계")} →</button>}
              <button className="btn sm" onClick={() => setEdit(dl)}>{T("수정")}</button>
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
  const sec = deal.secondaryFee ?? 0;
  const grand = deal.fee + sec;
  const compRev = Math.round(deal.fee * deal.shareCompany / 100);
  const crRev = Math.round(deal.fee * deal.shareCreator / 100);
  const no = `INV-${deal.code ?? deal.id.slice(0, 6)}`;
  return (
    <Modal title={T("청구서")} onClose={onClose} width={560}
      footer={<><button className="btn" onClick={onClose}>{T("닫기")}</button><button className="btn acc" onClick={() => window.print()}>{T("인쇄 / PDF 저장")}</button></>}>
      <div id="invoice" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 24, background: "var(--surface)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--accent)" }}>81&apos;DEGREE</div>
            <div style={{ fontSize: 12, color: "var(--faint)" }}>81degree.inc</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, fontSize: 18 }}>{T("청구서 / INVOICE")}</div>
            <div className="num" style={{ fontSize: 12, color: "var(--faint)" }}>{no}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 18 }}>
          <div><span style={{ color: "var(--faint)" }}>{T("To (의뢰사)")}</span><div style={{ fontWeight: 600 }}>{deal.client}</div></div>
          <div><span style={{ color: "var(--faint)" }}>{T("발행일")}</span><div className="num">{deal.uploadDate || "2026-08-23"}</div></div>
          <div><span style={{ color: "var(--faint)" }}>{T("크리에이터")}</span><div>{withCode(deal.creatorName)}</div></div>
          <div><span style={{ color: "var(--faint)" }}>{T("담당")}</span><div>{deal.manager}</div></div>
        </div>
        <table style={{ minWidth: 0 }}><thead><tr><th>{T("항목")}</th><th style={{ textAlign: "right" }}>{T("금액")}</th></tr></thead>
          <tbody>
            <tr><td>{deal.title} {T("(PR 콘텐츠 제작)")}</td><td className="num" style={{ textAlign: "right" }}>{yen(deal.fee)}</td></tr>
            {sec > 0 && <tr><td>{deal.title} {T("(2차 활용)")}</td><td className="num" style={{ textAlign: "right" }}>{yen(sec)}</td></tr>}
          </tbody></table>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, fontSize: 13 }}>
          {sec > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--faint)" }}><span>{T("PR 비용")}</span><span className="num">{yen(deal.fee)}</span></div>}
          {sec > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--faint)" }}><span>{T("2차 활용 비용")}</span><span className="num">{yen(sec)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--faint)" }}>{T("총 청구액")}</span><b className="num">{yen(grand)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--faint)" }}><span>{T("쉐어 (회사")} {deal.shareCompany}% / {T("크리에이터")} {deal.shareCreator}%)</span><span className="num">{T("회사")} {yen(compRev)} · {T("크리")} {yen(crRev)}</span></div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--faint)" }}>
          {T("입금 계좌 / 문의:")} hmpark@81degree.com · {T("본 청구서는 데모 샘플입니다.")}
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
  const [hasSecondary, setHasSecondary] = useState(deal?.secondaryFee != null);
  const [invBusy, setInvBusy] = useState(false);
  const sortedCreators = [...creators].sort(cmpCreatorByCode);
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
    } catch (e) { alert(T("저장 실패: ") + (e as Error).message); }
  }
  async function del() {
    if (!deal) return;
    try { await deleteDeal(deal.id); const i = deals.indexOf(deal); if (i >= 0) deals.splice(i, 1); onSaved(); onClose(); }
    catch (e) { alert(T("삭제 실패: ") + (e as Error).message); }
  }
  return (
    <Modal title={isNew ? T("PR 안건 추가") : T("PR 안건 수정")} onClose={onClose}
      footer={<>{!isNew && <button className="btn" style={{ color: "var(--critical)", borderColor: "var(--critical)", marginRight: "auto" }} onClick={del}>{T("삭제")}</button>}
        <button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" onClick={save}>{T("저장")}</button></>}>
      <Field label={T("안건명")}><input style={inp} value={f.title} onChange={(e) => up("title", e.target.value)} /></Field>
      <Field label={T("요청사 콘텐츠 브리핑")}><textarea style={{ ...inp, minHeight: 64 }} value={f.brief ?? ""} onChange={(e) => up("brief", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("안건 유형")}><select style={inp} value={f.type} onChange={(e) => up("type", e.target.value)}><option value="ahchannel">{T("ah!channel 인입")}</option><option value="creator">{T("크리에이터 개별")}</option></select></Field>
        <Field label={T("의뢰 회사")}><input style={inp} value={f.client} onChange={(e) => up("client", e.target.value)} /></Field>
        <Field label={T("크리에이터")}><select style={inp} value={f.creatorName} onChange={(e) => up("creatorName", e.target.value)}>{sortedCreators.map((c) => <option key={c.id} value={c.name}>{withCode(c.name)}</option>)}</select></Field>
        <Field label={T("담당 매니저")}><select style={inp} value={f.manager} onChange={(e) => up("manager", e.target.value)}><option value="mai">mai</option><option value="yuta">yuta</option></select></Field>
        <Field label={T("인입 경로")}><select style={inp} value={f.source} onChange={(e) => up("source", e.target.value)}><option value="creator_email">{T("크리에이터 이메일")}</option><option value="creator_dm">{T("인스타 DM")}</option><option value="company_email">{T("회사 이메일")}</option></select></Field>
        <Field label={T("PR 비용 (¥)")}><input style={inp} type="number" value={f.fee} onChange={(e) => up("fee", +e.target.value)} /></Field>
        <Field label={T("회사 쉐어 (%)")}><input style={inp} type="number" value={f.shareCompany} onChange={(e) => up("shareCompany", +e.target.value)} /></Field>
        <Field label={T("크리에이터 쉐어 (%)")}><input style={inp} type="number" value={f.shareCreator} onChange={(e) => up("shareCreator", +e.target.value)} /></Field>
        <Field label={T("진행 단계")}><select style={inp} value={f.step} onChange={(e) => up("step", +e.target.value)}>{DEAL_STEPS.map((s, i) => <option key={i} value={i}>{i + 1}. {s}</option>)}</select></Field>
        <Field label={T("수주일 (최초 수신)")}><input style={inp} type="date" value={f.receivedDate ?? ""} onChange={(e) => up("receivedDate", e.target.value)} /></Field>
        <Field label={T("납기일")}><input style={inp} type="date" value={f.dueDate ?? ""} onChange={(e) => up("dueDate", e.target.value)} /></Field>
        <Field label={T("업로드 일자")}><input style={inp} type="date" value={f.uploadDate ?? ""} onChange={(e) => up("uploadDate", e.target.value)} /></Field>
        <Field label={T("입금 예정일")}><input style={inp} type="date" value={f.paymentDue ?? ""} onChange={(e) => up("paymentDue", e.target.value)} /></Field>
        <Field label={T("입금일")}><input style={inp} type="date" value={f.paidDate ?? ""} onChange={(e) => up("paidDate", e.target.value)} /></Field>
      </div>
      <Field label={T("청구서 첨부")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn" style={{ cursor: "pointer" }}>{invBusy ? T("업로드 중…") : T("파일 선택")}
            <input type="file" style={{ display: "none" }} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setInvBusy(true); try { const url = await uploadAttachment(file, "invoice"); up("invoiceFile", url); } catch (err) { alert(T("업로드 실패: ") + (err as Error).message); } setInvBusy(false); }} /></label>
          {f.invoiceFile && <a href={f.invoiceFile} target="_blank" rel="noopener" style={{ color: "var(--accent-ink)", fontSize: 12.5 }}>{T("첨부된 청구서 보기")}</a>}
          {f.invoiceFile && <button className="btn sm" onClick={() => up("invoiceFile", null)}>{T("제거")}</button>}
        </div>
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "2px 0 8px" }}>
        <input type="checkbox" checked={hasSecondary} onChange={(e) => { setHasSecondary(e.target.checked); if (!e.target.checked) up("secondaryFee", null); }} /> {T("2차 활용 해당")}
      </label>
      {hasSecondary && <Field label={T("2차 활용 비용 (¥)")}>
        <input style={inp} type="number" value={f.secondaryFee ?? ""} onChange={(e) => up("secondaryFee", e.target.value === "" ? null : +e.target.value)} />
      </Field>}
      <Field label={T("완료 콘텐츠 URL (permalink)")}>
        <input style={inp} placeholder="https://www.instagram.com/reel/..." value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} />
      </Field>
      <div style={{ fontSize: 12, color: "var(--faint)" }}>{T("업로드된 콘텐츠 URL을 넣으면 아카이브에 자동 등록되고 안건에 연결됩니다.")}</div>
    </Modal>
  );
}

/* ── BRAND ─────────────────────────────── */
export function BrandView({ pane, d, scope }: { pane: string; d: Bundle; scope: string }) {
  registerCreatorCodes(d.creators);
  const month = "2026-08";
  const rows = d.contents.filter((c) => c.brandId === scope && c.status === "uploaded" && c.views > 0);
  if (pane === "b-dash") {
    const tv = rows.reduce((s, c) => s + c.views, 0), tr = rows.reduce((s, c) => s + c.reach, 0), ts = rows.reduce((s, c) => s + c.saves, 0);
    const engAvg = rows.length ? (rows.reduce((s, c) => s + parseFloat(engRate(c)), 0) / rows.length).toFixed(1) : "0";
    const upcoming = d.contents.filter((c) => c.brandId === scope && c.status === "planned")
      .sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    // 계약 진척 (배정 대비 완료)
    const bAsg = d.assignments.filter((a) => a.brandId === scope && a.yearMonth === month);
    const bQ = bAsg.reduce((s, a) => s + a.quota, 0);
    const bDone = bAsg.reduce((s, a) => s + d.contents.filter((c) => c.brandId === scope && c.creatorName === a.creatorId && c.status === "uploaded" && monthOf(c) === month).length, 0);
    const byCr: Record<string, number> = {};
    rows.forEach((c) => { byCr[c.creatorName] = (byCr[c.creatorName] ?? 0) + c.views; });
    const sched = d.contents.filter((c) => c.brandId === scope && (c.status === "planned" || monthOf(c) === month)).sort((a, b) => (a.sched.upload ?? "9999").localeCompare(b.sched.upload ?? "9999"));
    return (<>
      <div className="banner">{T("✦ 자동 수집 기준 · 확정 성과는 게시 후 D+7 스냅샷입니다. 실시간 값과 다를 수 있어요.")}</div>
      <div className="grid-kpi">
        <Kpi lab={T("총 조회수")} val={fmt(tv)} />
        <Kpi lab={T("총 도달")} val={fmt(tr)} />
        <Kpi lab={T("평균 참여율")} val={engAvg} unit="%" />
        <Kpi lab={T("저장 합계")} val={fmt(ts)} />
      </div>
      <div className="two">
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 12px" }}><h2>{T("업로드 예정")}</h2><span className="hint">{T("마감 임박순")}</span></div>
          <div className="list">
            {upcoming.slice(0, 5).map((c, i) => (
              <div className="li" key={c.id}><Avatar name={c.creatorName} size={34} radius={9} />
                <div className="main"><div className="t">{c.product}</div><div className="s">{withCode(c.creatorName)} · {c.brandName}</div></div>
                <div className="r"><span className={`pill ${i < 2 ? "p-warn" : "p-plan"}`}><span className="d" />{["D-2", "D-4", "D-6", "D-8", "D-9"][i] ?? "D-9"}</span></div></div>
            ))}
            {!upcoming.length && <div className="empty" style={{ border: 0 }}>{T("예정 콘텐츠 없음")}</div>}
          </div>
        </div>
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 14px" }}><h2>{T("이번 달 계약 진척")}</h2></div>
          <div className="ring-wrap" style={{ marginBottom: 18 }}>
            <Ring p={bQ ? Math.round(bDone / bQ * 100) : 0} label={`${bDone}/${bQ}`} />
            <div><div style={{ fontWeight: 600 }}>{bQ}{T("건 배정 중")} {bDone}{T("건 게시")}</div>
              <div className="note">{T("남은")} {Math.max(0, bQ - bDone)}{T("건 · 8월 배정 기준")}</div></div>
          </div>
          <div className="list">
            {Object.entries(byCr).map(([n, v]) => (
              <div className="li" key={n}><Avatar name={n} size={34} radius={9} />
                <div className="main"><div className="t">{n}</div><div className="s">{rows.filter((c) => c.creatorName === n).length}{T("건 게시")}</div></div>
                <div className="r"><div className="n">{kfmt(v)}</div><div className="u">{T("조회")}</div></div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="sec-h"><h2>{T("이번 달 제작 일정")}</h2><span className="hint"><span className="synced">🔄 {T("크리에이터 입력 실시간 반영")}</span></span></div>
      <ScheduleRows items={sched} />
    </>);
  }
  if (pane === "b-roster") return <CreatorDirectory creators={d.creators.filter((c) => c.status === "active")} allContents={d.contents} />;
  if (pane === "b-creators") return <BrandCreatorTable rows={rows} allContents={d.contents.filter((c) => c.brandId === scope)} />;
  if (pane === "b-archive") return <RemoteContentArchive />;
  if (pane === "b-secondary") return <SecondaryView mode="brand" d={d} scope={scope} />;
  if (pane === "b-assign") return <BrandAssignView d={d} scope={scope} />;
  if (pane === "b-schedule") return <ScheduleEditor d={d} brandName={scope} readonly />;
  return <Placeholder name={pane} />;
}

/* 2차 활용 워크플로우 (관리자/브랜드/크리에이터 공용) */
const SEC_STEPS = ["requested", "reviewing", "creator_confirming", "approved"];
const secStep = (s: string) => Math.max(0, SEC_STEPS.indexOf(s));
function SecondaryView({ mode, d, scope }: { mode: "admin" | "brand" | "creator"; d: Bundle; scope?: string }) {
  const [rows, setRows] = useState<SecondaryReq[]>([]);
  const [newReq, setNewReq] = useState(false);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { getSecondaryRequests().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const STEP_LABELS = [T("요청"), T("81degree 검토"), T("크리에이터 동의"), T("승인")];
  async function act(id: string, fn: () => Promise<void>) { setBusy(id); try { await fn(); load(); } catch (e) { alert(T("처리 실패: ") + (e as Error).message); } setBusy(""); }
  return (<>
    {(mode === "brand" || mode === "admin") && <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("2차 활용 신청")}</h2><button className="btn acc" onClick={() => setNewReq(true)}>+ {T("2차 활용 신청")}</button></div>}
    {!rows.length ? <div className="placeholder">{mode === "brand" ? T("신청한 2차 활용이 없어요. 콘텐츠를 선택해 신청하세요.") : T("2차 활용 신청 내역이 없어요.")}</div> :
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => {
          const step = secStep(r.status);
          const rejected = r.status === "rejected";
          return (
            <div key={r.id} className="card pad">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={r.creatorName} size={34} radius={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.product}</div>
                  <div style={{ color: "var(--faint)", fontSize: 12 }}>{withCode(r.creatorName)} · {r.brandName} · {T(SECONDARY_SCOPE_LABEL[r.scope])}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontWeight: 600 }}>{yen(r.fee)}</div>
                  <span className={`pill ${rejected ? "p-plan" : step >= 3 ? "p-ok" : "p-warn"}`} style={{ marginTop: 4 }}><span className="d" />{rejected ? T("반려") : STEP_LABELS[step]}</span>
                </div>
              </div>
              {!rejected && <div style={{ display: "flex", gap: 6, marginTop: 12, fontSize: 11.5 }}>
                {STEP_LABELS.map((s, si) => (<span key={si} style={{ flex: 1, textAlign: "center", padding: "5px 4px", borderRadius: 7, background: si <= step ? "var(--accent-weak)" : "var(--surface-2)", color: si <= step ? "var(--accent-ink)" : "var(--faint)", fontWeight: si <= step ? 600 : 400 }}>{si < step ? "✓ " : ""}{s}</span>))}
              </div>}
              {/* 역할별 액션 */}
              <div className="frow" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
                {r.permalink && <a href={r.permalink} target="_blank" rel="noopener" className="btn sm">{T("콘텐츠 보기")}</a>}
                {mode === "creator" && !r.creatorConsentedAt && !rejected && r.status !== "approved" &&
                  <button className="btn acc sm" disabled={busy === r.id} onClick={() => act(r.id, () => setCreatorConsent(r.id))}>{T("동의")}</button>}
                {mode === "admin" && !rejected && r.status !== "approved" && <>
                  {r.status === "requested" && <button className="btn sm" disabled={busy === r.id} onClick={() => act(r.id, () => setSecondaryStatus(r.id, "reviewing"))}>{T("검토 시작")}</button>}
                  <button className="btn sm" style={{ color: "var(--critical)", borderColor: "var(--critical)" }} disabled={busy === r.id} onClick={() => act(r.id, () => setSecondaryStatus(r.id, "rejected"))}>{T("반려")}</button>
                  <button className="btn acc sm" disabled={busy === r.id || !r.creatorConsentedAt} title={!r.creatorConsentedAt ? T("크리에이터 동의 후 승인 가능") : ""} onClick={() => act(r.id, () => setSecondaryStatus(r.id, "approved"))}>{T("승인")}</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>}
    {newReq && <SecondaryRequestModal d={d} mode={mode} brandName={scope ?? ""} onClose={() => setNewReq(false)} onSaved={load} />}
  </>);
}

function SecondaryRequestModal({ d, mode, brandName, onClose, onSaved }: { d: Bundle; mode: "admin" | "brand" | "creator"; brandName: string; onClose: () => void; onSaved: () => void }) {
  const isAdmin = mode === "admin";
  const [brand, setBrand] = useState(isAdmin ? (d.brands[0]?.name ?? brandName) : brandName);
  // 관리자: 전체 콘텐츠 중 선택 / 브랜드: 자기 브랜드 콘텐츠만
  const brandContents = isAdmin ? d.contents : d.contents.filter((c) => c.brandName === brandName || c.brandId === brandName);
  const [contentId, setContentId] = useState(brandContents[0]?.id ?? "");
  const [scope, setScope] = useState<SecondaryScope>("ad_creative");
  const [channels, setChannels] = useState("");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const content = brandContents.find((c) => c.id === contentId);
  const creator = d.creators.find((c) => c.name === content?.creatorName);
  const fee = creator?.rates.secondary ?? 0;
  const targetBrand = isAdmin ? brand : brandName;
  async function save() {
    if (!contentId) { alert(T("콘텐츠를 선택해주세요")); return; }
    setBusy(true);
    try {
      await createSecondaryRequest(contentId, targetBrand, scope, channels.split(",").map((s) => s.trim()).filter(Boolean), fee, start || null, end || null, d.brands);
      onSaved(); onClose();
    } catch (e) { alert(T("신청 실패: ") + (e as Error).message); }
    setBusy(false);
  }
  return (
    <Modal title={T("2차 활용 신청")} onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>{T("취소")}</button><button className="btn acc" disabled={busy || !contentId} onClick={save}>{T("신청")}</button></>}>
      {!brandContents.length ? <div className="placeholder">{T("신청 가능한 브랜드 콘텐츠가 없어요.")}</div> : <>
        {isAdmin && <Field label={T("브랜드")}><select style={inp} value={brand} onChange={(e) => setBrand(e.target.value)}>{d.brands.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}</select></Field>}
        <Field label={T("콘텐츠")}><select style={inp} value={contentId} onChange={(e) => setContentId(e.target.value)}>{brandContents.map((c) => <option key={c.id} value={c.id}>{c.product} · {c.creatorName}</option>)}</select></Field>
        <Field label={T("활용 범위")}><select style={inp} value={scope} onChange={(e) => setScope(e.target.value as SecondaryScope)}>{(Object.keys(SECONDARY_SCOPE_LABEL) as SecondaryScope[]).map((k) => <option key={k} value={k}>{T(SECONDARY_SCOPE_LABEL[k])}</option>)}</select></Field>
        <Field label={T("활용 채널 (쉼표로 구분)")}><input style={inp} placeholder="Instagram, 매장 사이니지" value={channels} onChange={(e) => setChannels(e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Field label={T("활용 시작일")}><input style={inp} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label={T("활용 종료일")}><input style={inp} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="callout" style={{ background: "var(--accent-weak)" }}><div style={{ width: "100%" }}>
          <div className="t" style={{ fontSize: 12 }}>{T("예상 2차 활용 비용")}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--accent-ink)" }}>{yen(fee)}</div>
          <div className="s" style={{ fontSize: 11.5 }}>{withCode(content?.creatorName ?? "")} {T("2차 활용 단가 기준 · 승인 시 정산에 반영")}</div>
        </div></div>
      </>}
    </Modal>
  );
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
      <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">{T("전체 기간")}</option>{months.map((m) => <option key={m} value={m}>{+m.slice(5)}{T("월")}</option>)}</select>
      <select value={creator} onChange={(e) => setCreator(e.target.value)}><option value="">{T("모든 크리에이터")}</option>{creatorNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
      <span className="count">{entries.length}{T("명")}</span>
    </div>
    <div className="tablewrap"><table><thead><tr>
      <th>{T("크리에이터")}</th><th>{T("게시")}</th><th>{T("총 조회")}</th><th>{T("평균 저장률")}</th><th>평균 참여율</th>
    </tr></thead><tbody>
      {entries.length ? entries.map(([n, b]) => (
        <tr key={n} style={{ cursor: "pointer" }} onClick={() => setOpen(open === n ? "" : n)} title={`${n} ${T("콘텐츠 보기")}`}>
          <td><span style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar name={n} size={26} radius={8} /><b>{n}</b> <span style={{ color: "var(--faint)" }}>›</span></span></td>
          <td className="num">{b.cnt}</td><td className="num">{fmt(b.v)}</td>
          <td className="num">{(b.s / b.v * 100).toFixed(1)}%</td><td className="num">{(b.eng / b.cnt).toFixed(1)}%</td></tr>
      )) : <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--faint)", padding: 24 }}>{T("데이터 없음")}</td></tr>}
    </tbody></table></div>
    {open && allContents && <div style={{ marginTop: 18 }}>
      <div className="sec-h"><h2>{open} · {T("콘텐츠")}</h2></div>
      <ContentArchive contents={allContents.filter((c) => c.creatorName === open)} showCreator={false} showBrand={false} />
    </div>}
  </>);
}

function CreatorDirectory({ creators, allContents }: { creators: Creator[]; allContents?: Content[] }) {
  const [cat, setCat] = useState(""); const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"code" | "followers" | "name">("code");
  const [detail, setDetail] = useState<Creator | null>(null);
  const codeNum = (c: Creator) => { const m = c.code?.match(/\d+/); return m ? +m[0] : Infinity; };
  const cats = [...new Set(creators.map((c) => c.category).filter(Boolean))] as string[];
  let list = [...creators].sort((a, b) => {
    if (sortBy === "followers") return b.followers - a.followers;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return codeNum(a) - codeNum(b) || a.name.localeCompare(b.name);
  });
  if (cat) list = list.filter((c) => c.category === cat);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.handle ?? "").toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div className="filterbar">
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
        <option value="code">{T("번호순")}</option><option value="followers">{T("팔로워순")}</option><option value="name">{T("이름순")}</option>
      </select>
      <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">{T("모든 카테고리")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <input placeholder={T("이름·핸들 검색")} value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="count">{list.length}{T("명")}</span>
    </div>
    <div className="crgrid">
      {list.map((c) => (
        <div key={c.id} className="crcard" style={{ cursor: "pointer" }} onClick={() => setDetail(c)}>
          <div className="top">
            <Avatar creator={c} size={46} radius={13} />
            <div style={{ minWidth: 0, flex: 1 }}><div className="nm">{withCode(c.name)}</div><div className="hd">{c.handle}</div></div>
            <div className="fol" style={{ textAlign: "right", flexShrink: 0 }}><b style={{ display: "block", fontSize: 16 }}>{fmt(c.followers)}</b><small style={{ color: "var(--faint)" }}>{T("팔로워")}</small></div>
          </div>
          <div><SnsBadges c={c} /></div>
          <div className="tags">
            {c.category && <span className="chip"><span className="sw" style={{ background: "var(--accent)" }} />{c.category}</span>}
            {c.tone && <span className="chip">{c.tone}</span>}
          </div>
          {c.intro && <div className="intro">{c.intro}</div>}
          <div style={{ display: "flex", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: "auto", color: "var(--accent-ink)", fontSize: 12.5, fontWeight: 600 }}>{T("프로필·콘텐츠 보기")} →</div>
        </div>
      ))}
    </div>
    {detail && <CreatorPublicModal creator={detail} contents={(allContents ?? []).filter((c) => c.creatorName === detail.name)} onClose={() => setDetail(null)} />}
  </>);
}

// 브랜드: 콘텐츠 배정 및 관리 (월별/크리에이터별 · 배정·진행·업로드·인게이지먼트)
function BrandAssignView({ d, scope }: { d: Bundle; scope: string }) {
  const [month, setMonth] = useState("2026-08");
  const [fCreator, setFCreator] = useState("");
  const [detail, setDetail] = useState<Creator | null>(null);
  const mine = d.contents.filter((c) => c.brandId === scope || c.brandName === scope);
  const asg = d.assignments.filter((a) => a.brandId === scope && a.yearMonth === month);
  let names = [...new Set([...asg.map((a) => a.creatorId), ...mine.filter((c) => monthOf(c) === month || c.status === "planned").map((c) => c.creatorName)])];
  if (fCreator) names = names.filter((n) => n === fCreator);
  names.sort(cmpNameByCode);
  const allCreators = [...new Set([...d.assignments.filter((a) => a.brandId === scope).map((a) => a.creatorId), ...mine.map((c) => c.creatorName)])].sort(cmpNameByCode);
  const totalQ = asg.reduce((s, a) => s + a.quota, 0);
  const totalDone = mine.filter((c) => c.status === "uploaded" && monthOf(c) === month).length;
  return (<>
    <div className="filterbar">
      <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}</select>
      <select value={fCreator} onChange={(e) => setFCreator(e.target.value)}><option value="">{T("전체 크리에이터")}</option>{allCreators.map((n) => <option key={n} value={n}>{withCode(n)}</option>)}</select>
      <span className="count">{names.length}{T("명")}</span>
    </div>
    <div className="grid-kpi" style={{ marginBottom: 18 }}>
      <Kpi lab={T("이번 달 배정")} val={totalQ} unit={T("건")} />
      <Kpi lab={T("완료")} val={totalDone} unit={T("건")} />
      <Kpi lab={T("진행률")} val={totalQ ? Math.round(totalDone / totalQ * 100) : 0} unit="%" />
    </div>
    {!names.length ? <div className="placeholder">{T("이 달 배정된 크리에이터가 없어요.")}</div> :
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {names.map((name) => {
          const q = asg.find((a) => a.creatorId === name)?.quota ?? 0;
          const items = mine.filter((c) => c.creatorName === name && (monthOf(c) === month || c.status === "planned"));
          const done = items.filter((c) => c.status === "uploaded").length;
          return (
            <div key={name} className="card pad">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Avatar name={name} size={38} radius={10} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{withCode(name)}</div>
                  <div style={{ color: "var(--faint)", fontSize: 12 }}>{T("배정")} {q}{T("건")} · {T("완료")} {done}{T("건")}</div></div>
                <button className="btn sm" onClick={() => { const cr = d.creators.find((x) => x.name === name); if (cr) setDetail(cr); }}>{T("프로필")}</button>
                <span className={`pill ${done >= q && q > 0 ? "p-ok" : "p-plan"}`}><span className="d" />{done >= q && q > 0 ? T("완료") : T("진행중")}</span>
              </div>
              {!items.length ? <div className="note">{T("등록된 콘텐츠가 없어요.")}</div> :
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((c) => (
                    <div key={c.id} style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13 }}>{c.product}</div>
                        {c.status === "uploaded" && <div style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{T("조회")} <b className="num">{fmt(c.views)}</b> · {T("참여율")} <b className="num">{engRate(c)}</b></div>}
                        <span className={`pill ${c.status === "uploaded" ? "p-ok" : "p-plan"}`} style={{ flexShrink: 0 }}><span className="d" />{c.status === "uploaded" ? T("업로드") : T("예정")}</span>
                        {c.permalink && <a className="btn sm" href={c.permalink} target="_blank" rel="noopener" style={{ flexShrink: 0 }}>{T("보러가기")}</a>}
                      </div>
                      {/* 제작 단계 타임라인 */}
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {SCHED_STAGES.map((s) => {
                          const dt = c.sched?.[s.k as keyof typeof c.sched];
                          const isUp = s.k === "upload" && c.status === "uploaded";
                          return <div key={s.k} style={{ flex: "1 1 90px", minWidth: 84, padding: "5px 8px", borderRadius: 7, background: dt ? "var(--accent-weak)" : "var(--surface-3)", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600 }}>{isUp ? "✓ " : ""}{T(s.label)}</div>
                            <div className="num" style={{ fontSize: 11.5, color: dt ? "var(--accent-ink)" : "var(--faint)" }}>{dt || "—"}</div>
                          </div>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>}
            </div>
          );
        })}
      </div>}
    {detail && <CreatorPublicModal creator={detail} contents={d.contents.filter((c) => c.creatorName === detail.name)} onClose={() => setDetail(null)} />}
  </>);
}

// 서버(포트폴리오 API)로 연동 콘텐츠를 불러와 아카이브 표시 — 브랜드도 크리에이터 콘텐츠 열람 가능
function RemoteContentArchive({ name, showCreator = true, showBrand = true }: { name?: string; showCreator?: boolean; showBrand?: boolean }) {
  const [rows, setRows] = useState<Content[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        if (!session) { setRows([]); return; }
        const res = await fetch(`/api/creator/portfolio${name ? `?name=${encodeURIComponent(name)}` : ""}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json().catch(() => ({ rows: [] }));
        setRows(j.rows ?? []);
      } catch { setRows([]); }
    })();
  }, [name]);
  if (rows === null) return <div className="placeholder">{T("불러오는 중…")}</div>;
  return <ContentArchive contents={rows} showCreator={showCreator} showBrand={showBrand} />;
}

// 브랜드/외부용 크리에이터 상세 (PII 제외 — 프로필·인게이지먼트·콘텐츠)
function CreatorPublicModal({ creator: c, onClose }: { creator: Creator; contents?: Content[]; onClose: () => void }) {
  const [contents, setContents] = useState<Content[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/creator/portfolio?name=${encodeURIComponent(c.name)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json().catch(() => ({ rows: [] }));
        setContents(j.rows ?? []);
      } catch { /* ignore */ }
    })();
  }, [c.name]);
  const ups = contents.filter((x) => x.status === "uploaded" && x.views > 0);
  const totalViews = ups.reduce((s, x) => s + x.views, 0);
  const avgEng = ups.length ? (ups.reduce((s, x) => s + parseFloat(engRate(x)), 0) / ups.length).toFixed(1) : "0";
  return (
    <Modal title={T("크리에이터 프로필")} onClose={onClose} width={620}
      footer={<button className="btn acc" onClick={onClose}>{T("닫기")}</button>}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Avatar creator={c} name={c.name} size={56} radius={15} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{c.code ? <span style={{ color: "var(--faint)", fontWeight: 600, marginRight: 6 }}>{c.code}</span> : null}{c.name}</div>
          <div style={{ color: "var(--faint)", fontSize: 12.5, marginTop: 3 }}>{c.handle} · {T("팔로워")} {fmt(c.followers)} · {c.category ?? "—"}</div>
          <div style={{ marginTop: 6 }}><SnsBadges c={c} /></div>
        </div>
      </div>
      {c.intro && <div className="note" style={{ marginBottom: 14 }}>{c.intro}</div>}
      <div className="grid-kpi" style={{ marginBottom: 16 }}>
        <Kpi lab={T("팔로워")} val={fmt(c.followers)} />
        <Kpi lab={T("업로드")} val={ups.length} unit={T("건")} />
        <Kpi lab={T("누적 조회")} val={fmt(totalViews)} />
        <Kpi lab={T("평균 참여율")} val={avgEng} unit="%" />
      </div>
      <div className="sec-h" style={{ margin: "0 0 10px" }}><h2>{T("콘텐츠 아카이브")}</h2></div>
      <ContentArchive contents={contents} showCreator={false} />
    </Modal>
  );
}

/* ── CREATOR ───────────────────────────── */
export function CreatorView({ pane, d, scope }: { pane: string; d: Bundle; scope: string }) {
  registerCreatorCodes(d.creators);
  const me = scope;
  const mine = d.contents.filter((c) => c.creatorName === me);
  // 마감 임박/지연 리마인드 (인앱)
  const dU = (ds?: string | null) => ds ? Math.round((new Date(ds).getTime() - Date.now()) / 86400000) : null;
  const rem: { label: string; du: number }[] = [];
  d.deals.filter((x) => x.creatorName === me && x.step < 5).forEach((x) => { const du = dU(x.dueDate); if (du != null && du <= 3) rem.push({ label: `PR ${x.title}`, du }); });
  mine.filter((c) => c.kind === "pr" && c.status === "planned").forEach((c) => { const du = dU(c.sched?.upload); if (du != null && du <= 3) rem.push({ label: c.product, du }); });
  rem.sort((a, b) => a.du - b.du);
  const remBanner = rem.length ? (
    <div style={{ padding: "12px 14px", borderRadius: 11, background: "var(--critical-weak)", borderLeft: "3px solid var(--critical)", marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--critical)", marginBottom: 6 }}>⏰ {T("마감 임박·지연 알림")} ({rem.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rem.slice(0, 6).map((r, i) => <div key={i} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
          <span>{r.label}</span>
          <b style={{ color: r.du < 0 ? "var(--critical)" : "var(--warning)" }}>{r.du < 0 ? `${T("납기 경과")} ${-r.du}${T("일")}` : r.du === 0 ? T("오늘 마감") : `D-${r.du}`}</b>
        </div>)}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>{T("‘이번 달 할 일’에서 일정을 확인하고 업로드를 완료하세요.")}</div>
    </div>
  ) : null;
  if (pane === "c-growth") {
    const cr = d.creators.find((x) => x.name === me)!;
    const monthViews = mine.filter((c) => c.views).reduce((s, c) => s + c.views, 0);
    const series = growthSeries(me, cr?.followers ?? 0);
    const aud = audienceOf(me);
    const maxAge = Math.max(1, ...aud.ages.map((a) => a[1]));
    const ups2 = mine.filter((c) => c.status === "uploaded" && c.views > 0);
    const avgSave = ups2.length ? (ups2.reduce((s, c) => s + (c.saves / c.views * 100), 0) / ups2.length).toFixed(1) : "0";
    return (<>
      {remBanner}
      <div className="grid-kpi">
        <Kpi lab={T("팔로워")} val={fmt(cr?.followers ?? 0)} spark={series.map((v) => v / 1000)} />
        <Kpi lab={T("이번 달 조회")} val={fmt(monthViews)} />
        <Kpi lab={T("평균 저장률")} val={avgSave} unit="%" />
        <Kpi lab={T("업로드")} val={mine.filter((c) => c.status === "uploaded").length} unit={T("건")} />
      </div>
      <div className="two">
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 6px" }}><h2>{T("팔로워 추이")}</h2><span className="hint">{cr?.handle} · {T("최근 12주")}</span></div>
          <div style={{ marginTop: 8 }}><Spark data={series} /></div>
        </div>
        <div className="card pad">
          <div className="sec-h" style={{ margin: "0 0 14px" }}><h2>{T("오디언스 · 성별")}</h2></div>
          {aud.female < 0 ? <div className="note">{T("오디언스 데이터는 Instagram 인사이트 연동 후 표시됩니다.")}</div> : <>
            <div className="donut-wrap"><Donut pct={aud.female} label={T("여성")} />
              <div className="legend"><div className="it"><span className="sw" style={{ background: "var(--accent)" }} />{T("여성")} <b className="num">{aud.female}%</b></div>
                <div className="it"><span className="sw" style={{ background: "var(--surface-3)" }} />{T("남성")} <b className="num">{100 - aud.female}%</b></div></div>
            </div>
            <div className="sec-h" style={{ margin: "18px 0 8px" }}><h2>{T("연령대")}</h2></div>
            <div className="bars">{aud.ages.map(([l, v]) => (<div className="bar" key={l}><span>{l}</span><div className="track"><div className="fill" style={{ width: `${v / maxAge * 100}%` }} /></div><span className="pct">{v}%</span></div>))}</div>
          </>}
        </div>
      </div>
      <div className="sec-h"><h2>{T("내 콘텐츠 아카이브")}</h2><span className="hint">{T("최근 게시물 · 클릭하면 재생")}</span></div>
      <ContentArchive contents={mine} showCreator={false} showBrand={false} />
    </>);
  }
  if (pane === "c-deals") return <DealList deals={d.deals.filter((x) => x.creatorName === me)} contents={d.contents} readonly />;
  if (pane === "c-revenue") {
    const my = d.deals.filter((x) => x.creatorName === me);
    return (
      <div className="tablewrap"><table><thead><tr>
        <th>{T("안건")}</th><th>{T("유형")}</th><th>{T("PR 비용")}</th><th>{T("내 쉐어")}</th><th>{T("내 정산")}</th><th>{T("상태")}</th>
      </tr></thead><tbody>
        {my.map((x) => (
          <tr key={x.id}><td><b>{x.title}</b></td><td><span className="chip">{x.type === "ahchannel" ? "ah!channel" : T("개별")}</span></td>
            <td className="num">{yen(x.fee)}</td><td className="num">{x.shareCreator}%</td>
            <td className="num" style={{ fontWeight: 600, color: x.step >= 4 ? "var(--accent-ink)" : "var(--muted)" }}>{yen(x.fee * x.shareCreator / 100)}</td>
            <td><span className={`pill ${x.step >= 4 ? "p-ok" : "p-plan"}`}><span className="d" />{x.step >= 4 ? T("정산 대상") : T("진행중")}</span></td></tr>
        ))}
      </tbody></table></div>
    );
  }
  if (pane === "c-content") return <ContentArchive contents={mine} showCreator={false} />;
  if (pane === "c-secondary") return <SecondaryView mode="creator" d={d} scope={me} />;
  if (pane === "c-profile") return <CreatorProfile d={d} me={me} />;
  if (pane === "c-todo") return (<>{remBanner}<CreatorTodo d={d} me={me} /></>);
  return <Placeholder name={pane} />;
}

function CreatorProfile({ d, me }: { d: Bundle; me: string }) {
  const creator = d.creators.find((c) => c.name === me);
  const [f, setF] = useState<Creator | null>(creator ? { ...creator, sns: { ...creator.sns }, rates: { ...creator.rates } } : null);
  const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false); const [err, setErr] = useState("");
  if (!f || !creator) return <div className="placeholder">{T("연결된 크리에이터 정보가 없습니다.")}</div>;
  const up = (k: keyof Creator, v: unknown) => { setF((s) => ({ ...s!, [k]: v })); setOk(false); };
  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const rd = new FileReader(); rd.onload = () => up("photoUrl", rd.result as string); rd.readAsDataURL(file);
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) { setErr(T("로그인이 필요합니다")); setBusy(false); return; }
      const payload = {
        name_kanji: f!.nameKanji, name_en: f!.nameEn, handle: f!.handle, photo_url: f!.photoUrl ?? null,
        category: f!.category, tone: f!.tone, intro: f!.intro, sns: f!.sns,
        email: f!.email, phone: f!.phone, address: f!.address, address_en: f!.addressEn,
        bank_account: f!.bankAccount, invoice_reg_no: f!.invoiceRegNo, entity_type: f!.entityType,
      };
      const res = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setErr(j.error || T("저장 실패")); return; }
      Object.assign(creator!, f!); setOk(true);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const ro = (label: string, val: React.ReactNode) => <Field label={label}><div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 9, fontSize: 13, color: "var(--muted)" }}>{val ?? "—"}</div></Field>;
  return (<div style={{ maxWidth: 680 }}>
    <div className="sec-h" style={{ marginTop: 0 }}><h2>{T("내 프로필 관리")}</h2>
      <button className="btn acc" disabled={busy} onClick={save}>{busy ? T("저장 중…") : ok ? T("저장됨 ✓") : T("저장")}</button></div>
    <div className="card pad">
      <Field label={T("프로필 사진")}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar creator={f} name={f.name} size={56} radius={15} />
          <label className="btn" style={{ cursor: "pointer" }}>{T("사진 업로드")}<input type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} /></label>
          {f.photoUrl && <button className="btn" onClick={() => up("photoUrl", null)}>{T("제거")}</button>}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {ro(T("고유번호 (CC번호)"), f.code)}
        {ro(T("크리에이터명"), f.name)}
        <Field label={T("한자(일본어) 이름")}><input style={inp} value={f.nameKanji ?? ""} onChange={(e) => up("nameKanji", e.target.value)} /></Field>
        <Field label={T("영문 이름")}><input style={inp} value={f.nameEn ?? ""} onChange={(e) => up("nameEn", e.target.value)} /></Field>
        <Field label={T("인스타 핸들")}><input style={inp} value={f.handle ?? ""} onChange={(e) => up("handle", e.target.value)} /></Field>
        {ro(T("팔로워"), fmt(f.followers))}
        <Field label={T("주력 카테고리")}><input style={inp} value={f.category ?? ""} onChange={(e) => up("category", e.target.value)} /></Field>
        <Field label={T("콘텐츠 톤")}><input style={inp} value={f.tone ?? ""} onChange={(e) => up("tone", e.target.value)} /></Field>
      </div>
      <Field label={T("소개")}><textarea style={{ ...inp, minHeight: 60 }} value={f.intro ?? ""} onChange={(e) => up("intro", e.target.value)} /></Field>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "4px 0 8px" }}>{T("추가 SNS")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {(["youtube", "tiktok", "x", "line"] as const).map((k) => (
          <Field key={k} label={k === "x" ? "X" : k}><input style={inp} value={f.sns[k] ?? ""} onChange={(e) => setF((s) => ({ ...s!, sns: { ...s!.sns, [k]: e.target.value } }))} /></Field>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "8px 0 8px" }}>{T("연락처·정산 (본인 입력)")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("이메일")}><input style={inp} type="email" value={f.email ?? ""} onChange={(e) => up("email", e.target.value)} /></Field>
        <Field label={T("전화번호")}><input style={inp} value={f.phone ?? ""} onChange={(e) => up("phone", e.target.value)} /></Field>
      </div>
      <Field label={T("주소")}><input style={inp} value={f.address ?? ""} onChange={(e) => up("address", e.target.value)} /></Field>
      <Field label={T("영문 주소")}><input style={inp} value={f.addressEn ?? ""} onChange={(e) => up("addressEn", e.target.value)} /></Field>
      <Field label={T("은행계좌")}><input style={inp} value={f.bankAccount ?? ""} onChange={(e) => up("bankAccount", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label={T("인보이스 등록번호 (T번호)")}><input style={inp} value={f.invoiceRegNo ?? ""} onChange={(e) => up("invoiceRegNo", e.target.value)} /></Field>
        <Field label={T("구분")}><select style={inp} value={f.entityType ?? "individual"} onChange={(e) => up("entityType", e.target.value)}><option value="individual">{T("개인")}</option><option value="corporation">{T("법인")}</option></select></Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "8px 0 8px" }}>{T("계약 정보 (회사 관리 · 읽기전용)")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        {ro(T("계약기간"), f.contractDate || f.contractEnd ? `${f.contractDate ?? "—"} ~ ${f.contractEnd ?? "—"}` : "—")}
        {ro(T("기본보수 (세전/월)"), f.baseFee != null ? yen(f.baseFee) : "—")}
        {ro(T("월 계약 수량"), f.monthlyQuota != null ? `${f.monthlyQuota}${T("건")}` : "—")}
        {ro(T("릴스 1건당"), yen(f.rates.reels))}
      </div>
      {err && <div style={{ color: "var(--critical)", fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 10 }}>{T("※ 계약·보수·단가·번호는 회사가 관리합니다. 본인 정보(이름·연락처·계좌·SNS·사진)를 직접 입력·수정하세요.")}</div>
    </div>
  </div>);
}

function CreatorTodo({ d, me }: { d: Bundle; me: string }) {
  const [month, setMonth] = useState("2026-08");
  const [, setTick] = useState(0);
  const brandsAsg = d.assignments.filter((a) => a.creatorId === me && a.yearMonth === month);
  const myContentsFor = (brand: string) => d.contents.filter((c) => c.creatorName === me && (c.brandName === brand || c.brandId === brand) && (monthOf(c) === month || c.status === "planned"));
  const totalQ = brandsAsg.reduce((s, a) => s + a.quota, 0);
  const totalDone = d.contents.filter((c) => c.creatorName === me && c.status === "uploaded" && monthOf(c) === month && c.kind === "pr").length;
  const stIn = { fontFamily: "var(--body)", fontSize: 12.5, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)" } as const;
  function setDate(c: Content, stage: string, val: string) { c.sched = { ...c.sched, [stage]: val }; if (stage === "upload") c.plannedDate = val; setTick((t) => t + 1); updateContentSchedule(c.id, c.sched as Record<string, string>, c.status).catch(() => { }); }
  function setStatus(c: Content, st: string) { c.status = st as Content["status"]; setTick((t) => t + 1); updateContentSchedule(c.id, c.sched as Record<string, string>, st).catch(() => { }); }
  function setUrl(c: Content, val: string) { c.permalink = val; setTick((t) => t + 1); patchContentFields(c.id, { permalink: val || null }).catch(() => { }); }
  const openCal = (e: React.MouseEvent<HTMLInputElement>) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* noop */ } };
  async function genShort(brand: string, qty: number) {
    const items = myContentsFor(brand);
    try { for (let i = items.length; i < qty; i++) { const nc = await createPlannedContent(brand, me, `${brand} ${T("콘텐츠")} ${i + 1}`, d.brands, d.creators); d.contents.push(nc); } setTick((t) => t + 1); }
    catch (e) { alert(T("생성 실패: ") + (e as Error).message); }
  }
  async function addOne(brand: string) { try { const items = myContentsFor(brand); const nc = await createPlannedContent(brand, me, `${brand} ${T("콘텐츠")} ${items.length + 1}`, d.brands, d.creators); d.contents.push(nc); setTick((t) => t + 1); } catch (e) { alert(T("생성 실패: ") + (e as Error).message); } }
  async function del(c: Content) { if (!confirm(`'${c.product}' ${T("삭제할까요?")}`)) return; try { await deleteContent(c.id); const i = d.contents.indexOf(c); if (i >= 0) d.contents.splice(i, 1); setTick((t) => t + 1); } catch (e) { alert(T("삭제 실패: ") + (e as Error).message); } }
  return (<>
    <div className="filterbar" style={{ marginBottom: 14 }}>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>{ASSIGN_MONTHS.map((m) => <option key={m} value={m}>{m.slice(0, 4)}. {+m.slice(5)}{T("월")}</option>)}</select>
    </div>
    <div className="card pad" style={{ marginBottom: 18 }}>
      <div className="ring-wrap" style={{ marginBottom: 6 }}>
        <Ring p={totalQ ? Math.round(totalDone / totalQ * 100) : 0} label={`${totalDone}/${totalQ}`} />
        <div><div style={{ fontWeight: 600, fontSize: 15 }}>{T("이번 달 배정")} {totalQ}{T("건 중")} {totalDone}{T("건 완료")}</div>
          <div className="note">{T("남은")} {Math.max(0, totalQ - totalDone)}{T("건 · 아래 브랜드별로 기획→촬영→편집→업로드를 진행하세요")}</div></div>
      </div>
    </div>
    {!brandsAsg.length ? <div className="placeholder">{T("이 달 배정된 브랜드가 없어요.")}</div> :
      brandsAsg.map((a) => {
        const brand = a.brandId; const items = myContentsFor(brand);
        const done = items.filter((c) => c.status === "uploaded").length;
        const short = a.quota - items.length;
        return (
          <div key={brand} className="card pad" style={{ marginBottom: 14 }}>
            <div className="sec-h" style={{ margin: "0 0 12px" }}>
              <h2><span className="chip" style={{ marginRight: 8 }}><span className="sw" style={{ background: BRAND_COLOR[brand] ?? "var(--surface-3)" }} />{brand}</span>{T("배정")} {a.quota}{T("건")} · {T("완료")} {done}{T("건")}</h2>
              <span style={{ display: "flex", gap: 6 }}>
                {short > 0 && <button className="btn acc sm" onClick={() => genShort(brand, a.quota)}>{T("부족분")} {short}{T("건 일정 만들기")}</button>}
                <button className="btn sm" onClick={() => addOne(brand)}>+ {T("추가")}</button>
              </span>
            </div>
            {!items.length ? <div className="note">{T("아직 콘텐츠가 없어요. ‘일정 만들기’로 시작하세요.")}</div> :
              <div className="tablewrap"><table><thead><tr>
                <th>{T("콘텐츠")}</th>{SCHED_STAGES.map((s) => <th key={s.k}>{T(s.label)}</th>)}<th>{T("상태")}</th><th></th>
              </tr></thead><tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td style={{ minWidth: 200 }}>
                      <b style={{ fontSize: 13 }}>{c.product}</b>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5 }}>
                        <input style={{ ...stIn, flex: 1, minWidth: 130 }} placeholder={T("업로드 URL 입력")} value={c.permalink ?? ""} onChange={(e) => setUrl(c, e.target.value)} />
                        {c.permalink && <a className="btn" style={{ padding: "5px 8px", fontSize: 11 }} href={c.permalink} target="_blank" rel="noopener">{T("열기")}</a>}
                      </div>
                    </td>
                    {SCHED_STAGES.map((s) => <td key={s.k}><input type="date" style={{ ...stIn, cursor: "pointer" }} value={c.sched[s.k as keyof typeof c.sched] ?? ""} onClick={openCal} onChange={(e) => setDate(c, s.k, e.target.value)} /></td>)}
                    <td><select style={stIn} value={c.status} onChange={(e) => setStatus(c, e.target.value)}><option value="planned">{T("예정")}</option><option value="uploaded">{T("업로드")}</option></select></td>
                    <td style={{ textAlign: "right" }}><button className="btn" style={{ padding: "5px 9px", fontSize: 11.5, color: "var(--critical)", borderColor: "var(--critical)" }} onClick={() => del(c)}>{T("삭제")}</button></td>
                  </tr>
                ))}
              </tbody></table></div>}
          </div>
        );
      })}
  </>);
}


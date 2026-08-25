"use client";

export function Spark({ data, w = 520, h = 120 }: { data: number[]; w?: number; h?: number }) {
  const mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1;
  const pts = data.map((v, i) => [i / (data.length - 1) * w, h - ((v - mn) / sp) * (h - 8) - 4]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M0 ${h} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${w} ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} fill="none" style={{ display: "block" }}>
      <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill="url(#spk)" />
      <path d={d} stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent)" />
    </svg>
  );
}

export function MiniSpark({ data, w = 72, h = 30 }: { data: number[]; w?: number; h?: number }) {
  const mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1;
  const pts = data.map((v, i) => [i / (data.length - 1) * w, h - ((v - mn) / sp) * (h - 6) - 3]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M0 ${h} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${w} ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs><linearGradient id="mspk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#mspk)" />
      <path d={d} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3" fill="var(--accent)" />
    </svg>
  );
}

export function Donut({ pct, label }: { pct: number; label: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--surface-3)" strokeWidth="7" />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--accent)" strokeWidth="7"
        strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25" strokeLinecap="round" />
      <text x="21" y="20" textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--ink)">{pct}%</text>
      <text x="21" y="27" textAnchor="middle" fontSize="3.6" fill="var(--faint)">{label}</text>
    </svg>
  );
}

export function Bars({ items }: { items: [string, number][] }) {
  const max = Math.max(...items.map((i) => i[1]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(([l, v]) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "60px 1fr 42px", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span>{l}</span>
          <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${v / max * 100}%`, background: "var(--accent)", borderRadius: 5 }} />
          </div>
          <span className="num" style={{ textAlign: "right", color: "var(--muted)" }}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

// 이름 기반 결정적 성장 시계열/오디언스 (프로토타입과 동일 로직)
// 실데이터 전용: 팔로워 시계열 스냅샷이 없으므로 현재값으로 평탄 (가짜 성장 곡선 제거)
export function growthSeries(_name: string, followers: number): number[] {
  return Array(13).fill(Math.round(followers || 0));
}
// 오디언스: Instagram 인사이트 연동 전에는 빈 값 (가짜 데이터 제거). female<0 = 데이터 없음.
export function audienceOf(_name: string) {
  const ages: [string, number][] = [["13–17", 0], ["18–24", 0], ["25–34", 0], ["35–44", 0], ["45+", 0]];
  return { female: -1, ages, regions: [] as [string, number][] };
}

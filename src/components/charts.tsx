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
export function growthSeries(name: string, followers: number): number[] {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); h = Math.abs(h);
  const rate = 0.03 + (h % 9) / 100;
  const arr: number[] = []; let v = followers;
  for (let i = 0; i < 13; i++) { arr.unshift(Math.round(v)); v = v / (1 + rate / 4); }
  return arr;
}
export function audienceOf(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); h = Math.abs(h);
  const female = Math.min(93, 52 + h % 38);
  let a = [4 + h % 5, 28 + h % 14, 32 + (h >> 2) % 14, 11 + (h >> 3) % 8, 3 + (h >> 4) % 5];
  const sum = a.reduce((x, y) => x + y, 0); a = a.map((v) => Math.round(v / sum * 100));
  const ages: [string, number][] = [["13–17", a[0]], ["18–24", a[1]], ["25–34", a[2]], ["35–44", a[3]], ["45+", a[4]]];
  const regions: [string, number][] = [["도쿄", 20 + h % 18], ["오사카", 12 + (h >> 1) % 9], ["서울", 6 + (h >> 2) % 9], ["후쿠오카", 5 + (h >> 3) % 5], ["나고야", 4 + (h >> 4) % 4]];
  return { female, ages, regions };
}

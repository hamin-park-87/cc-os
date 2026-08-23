// 이름 기반 생성 얼굴 아바타. 실서비스에선 creator.photoUrl(IG/Storage)로 교체.
const SKIN = ["#F3C9A8", "#EAB78E", "#D89A6E", "#F0D3B4", "#C88C5E"];
const HAIR = ["#2B2320", "#43301F", "#6B4A2A", "#141414", "#7A4B22", "#9A6B3B"];
const BG = ["#DCE7EA", "#E7DEF0", "#F0DEE8", "#DEF0E4", "#F0EAD6", "#E4E9F2"];
const SHIRT = ["#8FA3B8", "#B89A8F", "#9AB8A0", "#C0A0B0", "#A0A6C4", "#C7B189"];

export function shash(s: string): number {
  let h = 0; s = s || "";
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

export function avatarSVG(name: string): string {
  const h = shash(name);
  const skin = SKIN[h % SKIN.length], hair = HAIR[(h >> 2) % HAIR.length];
  const bg = BG[(h >> 4) % BG.length], shirt = SHIRT[(h >> 3) % SHIRT.length];
  const style = h % 3;
  const hairShape =
    style === 0 ? `<path d="M27 50 Q26 22 50 22 Q74 22 73 50 Q73 35 50 33 Q27 35 27 50 Z" fill="${hair}"/>`
    : style === 1 ? `<path d="M25 66 Q23 22 50 21 Q77 22 75 66 L67 66 Q70 40 50 38 Q30 40 33 66 Z" fill="${hair}"/>`
    : `<path d="M25 74 Q21 22 50 21 Q79 22 75 74 L65 74 Q70 44 50 42 Q30 44 35 74 Z" fill="${hair}"/>`;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="100" height="100" fill="${bg}"/>
    <path d="M20 100 Q20 73 50 73 Q80 73 80 100 Z" fill="${shirt}"/>
    <circle cx="50" cy="51" r="20" fill="${skin}"/>
    ${hairShape}
    <ellipse cx="43" cy="51" rx="2.1" ry="2.9" fill="#3A2E2A"/>
    <ellipse cx="57" cy="51" rx="2.1" ry="2.9" fill="#3A2E2A"/>
    <path d="M44 59 Q50 64 56 59" stroke="#B26A52" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

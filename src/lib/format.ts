import type { Content } from "@/lib/types";

export const fmt = (n: number) => n.toLocaleString("en-US");
export const kfmt = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K" : "" + n;
export const yen = (n: number) => "¥" + fmt(Math.round(n));
export const engRate = (c: Content) =>
  c.views ? (((c.likes + c.comments + c.saves + c.shares) / c.views) * 100).toFixed(1) + "%" : "—";
export const monthOf = (c: Content) => (c.publishedAt ? c.publishedAt.slice(0, 7) : null);
// UTC ISO → 뷰어 로컬 시각 "YYYY-MM-DD HH:mm"
export const localDT = (iso?: string | null): string | null => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString("sv-SE").slice(0, 16); }
  catch { return String(iso).slice(0, 16).replace("T", " "); }
};
export const CREATOR_STATUS_LABEL: Record<string, string> = {
  active: "활동중", preparing: "계약준비", on_hold: "보류",
};

// 크리에이터 이름 → 고유번호(CC001)·프로필사진 조회 (전역 등록 후 어디서나 사용)
const _creatorCode: Record<string, string> = {};
const _creatorPhoto: Record<string, string> = {};
export function registerCreatorCodes(creators: { name: string; code?: string | null; photoUrl?: string | null }[]) {
  for (const c of creators) {
    if (c.code) _creatorCode[c.name] = c.code;
    if (c.photoUrl) _creatorPhoto[c.name] = c.photoUrl; else delete _creatorPhoto[c.name];
  }
}
export const creatorCode = (name: string): string | undefined => _creatorCode[name];
export const creatorPhoto = (name: string): string | undefined => _creatorPhoto[name];
// "CC001 · name" 형태 라벨 (번호 없으면 이름만)
export const withCode = (name: string): string => {
  const code = _creatorCode[name];
  return code ? `${code} · ${name}` : name;
};

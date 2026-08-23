import type { Content } from "@/lib/types";

export const fmt = (n: number) => n.toLocaleString("en-US");
export const kfmt = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K" : "" + n;
export const yen = (n: number) => "¥" + fmt(Math.round(n));
export const engRate = (c: Content) =>
  c.views ? (((c.likes + c.comments + c.saves + c.shares) / c.views) * 100).toFixed(1) + "%" : "—";
export const monthOf = (c: Content) => (c.publishedAt ? c.publishedAt.slice(0, 7) : null);
export const CREATOR_STATUS_LABEL: Record<string, string> = {
  active: "활동중", preparing: "계약준비", on_hold: "보류",
};

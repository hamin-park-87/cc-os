import crypto from "crypto";

// OAuth state 서명 (creatorId 바인딩 + 위변조/재사용 방지). IG_APP_SECRET로 HMAC.
const secret = () => process.env.IG_APP_SECRET ?? "dev-secret";

export function signState(creatorId: string): string {
  const ts = Date.now();
  const payload = `${creatorId}.${ts}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyState(state: string): string | null {
  try {
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return null;
    const payload = Buffer.from(b64, "base64url").toString();
    const expect = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const [creatorId, tsStr] = payload.split(".");
    if (Date.now() - Number(tsStr) > 1000 * 60 * 15) return null; // 15분 유효
    return creatorId;
  } catch { return null; }
}

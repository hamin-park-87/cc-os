// 알림 발송: Slack Incoming Webhook + 이메일(Resend). 환경변수 없으면 no-op.
//   SLACK_WEBHOOK_URL  = Slack Incoming Webhook URL
//   RESEND_API_KEY     = Resend API 키
//   RESEND_FROM        = 발신 주소 (기본 onboarding@resend.dev)

export async function sendSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return res.ok;
  } catch { return false; }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.RESEND_FROM || "81degree <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

// Slack Bot 토큰(chat.postMessage) — 스레드 답글 가능. SLACK_BOT_TOKEN(xoxb-) 필요.
// 성공 시 메시지 ts 반환(스레드 부모로 사용), 실패 시 null.
export async function slackPost(channel: string, text: string, threadTs?: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !channel) return null;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }),
    });
    const j = await res.json();
    if (!j.ok) console.warn("[slackPost]", j.error);
    return j.ok ? (j.ts as string) : null;
  } catch (e) { console.warn("[slackPost]", (e as Error).message); return null; }
}

export const notifyConfigured = () => ({ slack: !!process.env.SLACK_WEBHOOK_URL, slackBot: !!process.env.SLACK_BOT_TOKEN, email: !!process.env.RESEND_API_KEY });

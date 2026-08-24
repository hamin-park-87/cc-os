// Instagram API with Instagram Login (Graph API) 어댑터.
// 크리에이터의 인스타 프로페셔널 계정 데이터를 graph.instagram.com에서 수집.
// 환경변수: IG_APP_ID, IG_APP_SECRET, NEXT_PUBLIC_APP_URL
import type {
  IngestProvider, ReelRaw, ContentMetric, AccountMetric, AudienceMetric, TokenHealth,
} from "./provider";

const GRAPH = "https://graph.instagram.com";
const API_VERSION = "v21.0";

export function igConfig() {
  // IG_* 또는 META_* 둘 다 허용
  const appId = process.env.IG_APP_ID ?? process.env.META_APP_ID ?? "";
  const appSecret = process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET ?? "";
  const redirectEnv = process.env.META_REDIRECT_URI ?? process.env.IG_REDIRECT_URI ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (redirectEnv ? redirectEnv.replace(/\/api\/ig\/callback\/?$/, "") : "https://cc-os.81degree.com");
  const redirectUri = redirectEnv || `${appUrl}/api/ig/callback`;
  return { appId, appSecret, appUrl, redirectUri, configured: !!(appId && appSecret) };
}

// 1) 사용자 동의 URL (연동 시작)
export function authorizeUrl(state: string) {
  const { appId, redirectUri } = igConfig();
  const scope = "instagram_business_basic,instagram_business_manage_insights";
  const p = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope, state });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

// 2) code → 단기 토큰(+user_id)
export async function exchangeCode(code: string): Promise<{ accessToken: string; userId: string }> {
  const { appId, appSecret, redirectUri } = igConfig();
  const body = new URLSearchParams({
    client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  const j = await res.json();
  if (!res.ok || j.error_message || j.error) throw new Error(j.error_message || j.error?.message || "code 교환 실패");
  return { accessToken: j.access_token, userId: String(j.user_id) };
}

// 3) 단기 → 장기 토큰(60일)
export async function longLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { appSecret } = igConfig();
  const p = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: shortToken });
  const res = await fetch(`${GRAPH}/access_token?${p.toString()}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error?.message || "장기 토큰 교환 실패");
  return { accessToken: j.access_token, expiresIn: j.expires_in ?? 5184000 };
}

// 장기 토큰 갱신 (만료 전 재발급)
export async function refreshToken(token: string): Promise<{ accessToken: string; expiresIn: number }> {
  const p = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const res = await fetch(`${GRAPH}/refresh_access_token?${p.toString()}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error?.message || "토큰 갱신 실패");
  return { accessToken: j.access_token, expiresIn: j.expires_in ?? 5184000 };
}

async function g(path: string, params: Record<string, string>) {
  const p = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${API_VERSION}/${path}?${p.toString()}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(j.error?.message || `Graph 요청 실패: ${path}`);
  return j;
}

// 계정 프로필 (username·account_type·followers·media_count)
export async function fetchProfile(token: string) {
  return g("me", { fields: "user_id,username,account_type,followers_count,follows_count,media_count", access_token: token });
}

// IngestProvider 구현 — 토큰을 클로저로 주입해 사용
export function metaProvider(token: string): IngestProvider {
  return {
    async fetchRecentReels(): Promise<ReelRaw[]> {
      const j = await g("me/media", {
        fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp",
        limit: "50", access_token: token,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (j.data ?? []).map((m: any): ReelRaw => ({
        igMediaId: m.id, permalink: m.permalink ?? "", caption: m.caption ?? "",
        // 동영상은 thumbnail_url, 이미지는 media_url
        thumbnailUrl: m.thumbnail_url || m.media_url || "", publishedAt: (m.timestamp ?? "").slice(0, 10),
      }));
    },
    async fetchContentMetrics(igMediaId: string): Promise<ContentMetric> {
      const j = await g(`${igMediaId}/insights`, { metric: "views,reach,likes,comments,saved,shares", access_token: token });
      const v: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (j.data ?? [])) v[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? 0;
      return {
        views: v.views ?? 0, reach: v.reach ?? 0, likes: v.likes ?? 0, comments: v.comments ?? 0,
        saved: v.saved ?? 0, shares: v.shares ?? 0, follows: 0, avgWatchTime: 0,
      };
    },
    async fetchAccountMetrics(): Promise<AccountMetric> {
      const p = await fetchProfile(token);
      return { followers: p.followers_count ?? 0, reach: 0, views: 0, profileViews: 0 };
    },
    async fetchAudience(igUserId: string): Promise<AudienceMetric> {
      try {
        const j = await g(`${igUserId}/insights`, {
          metric: "follower_demographics", period: "lifetime", metric_type: "total_value",
          breakdown: "age,gender", access_token: token,
        });
        return { genderAge: j.data ?? [], country: null, city: null };
      } catch { return { genderAge: null, country: null, city: null }; }
    },
    async checkTokenHealth(): Promise<TokenHealth> {
      try { await fetchProfile(token); return { status: "active" }; }
      catch { return { status: "expired" }; }
    },
  };
}

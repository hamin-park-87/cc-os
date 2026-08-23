// 수집·아카이빙 어댑터 계약. MockProvider(현재) ↔ MetaProvider(추후 Graph API).
export interface ReelRaw {
  igMediaId: string; permalink: string; caption: string; thumbnailUrl: string; publishedAt: string;
}
export interface ContentMetric {
  views: number; reach: number; likes: number; comments: number; saved: number; shares: number;
  follows: number; avgWatchTime: number;
}
export interface AccountMetric { followers: number; reach: number; views: number; profileViews: number }
export interface AudienceMetric { genderAge: unknown; country: unknown; city: unknown }
export interface TokenHealth { status: "active" | "expired" | "revoked"; expiresAt?: string }

export interface IngestProvider {
  fetchRecentReels(igUserId: string): Promise<ReelRaw[]>;        // sync_contents
  fetchContentMetrics(igMediaId: string): Promise<ContentMetric>; // sync_content_metrics
  fetchAccountMetrics(igUserId: string): Promise<AccountMetric>;   // sync_account_metrics
  fetchAudience(igUserId: string): Promise<AudienceMetric>;        // sync_audience
  checkTokenHealth(igUserId: string): Promise<TokenHealth>;        // check_token_health
}

// 영상 아카이빙: permalink → 자동 다운로드 → 우리 스토리지 → 인앱 재생.
export interface VideoArchiver {
  archive(permalink: string): Promise<{ url: string }>;
}

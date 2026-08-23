import type { IngestProvider, VideoArchiver } from "./provider";

export const mockIngest: IngestProvider = {
  async fetchRecentReels() { return []; },
  async fetchContentMetrics() {
    return { views: 0, reach: 0, likes: 0, comments: 0, saved: 0, shares: 0, follows: 0, avgWatchTime: 0 };
  },
  async fetchAccountMetrics() { return { followers: 0, reach: 0, views: 0, profileViews: 0 }; },
  async fetchAudience() { return { genderAge: {}, country: {}, city: {} }; },
  async checkTokenHealth() { return { status: "active", expiresAt: "2026-10-01" }; },
};

// Mock: 실제 다운로드 대신 permalink 를 그대로 반환 (Phase 0)
export const mockArchiver: VideoArchiver = {
  async archive(permalink: string) { return { url: permalink }; },
};

// 81'DEGREE creator-os · 도메인 타입 (DB 스키마와 1:1)

export type Role = "admin" | "brand" | "creator";
export type AccountStatus = "pending" | "active" | "disabled";
export type CreatorStatus = "active" | "preparing" | "on_hold"; // 활동중/계약준비/보류
export type ContentStatus = "planned" | "uploaded" | "canceled";
export type ContentKind = "pr" | "own" | "deal";
export type VideoStatus = "none" | "pending" | "downloading" | "ready" | "failed";
export type IgStatus = "active" | "expired" | "revoked";
export type SecondaryScope = "ad_creative" | "sns_regram" | "offline" | "web" | "other";
export type SecondaryStatus =
  | "requested" | "reviewing" | "creator_confirming" | "approved" | "rejected" | "expired";
export type DealType = "ahchannel" | "creator";
export type DealSource = "creator_email" | "creator_dm" | "company_email";

// deal.step 0~5: intake, review, negotiating, client, contracted, producing
export const DEAL_STEP_KEYS = [
  "intake", "review", "negotiating", "client", "contracted", "producing",
] as const;

export interface Brand {
  id: string;
  code?: string | null;            // 고유번호 (BR001…)
  name: string;
  aliases: string[];
  color?: string;
  domainAllowlist: string[];
  // 계약
  contractStart?: string | null;   // 계약 시작월 (YYYY-MM)
  contractEnd?: string | null;     // 계약 종료월 (YYYY-MM)
  monthlyQuota?: number | null;    // 월 콘텐츠 계약 수량
  monthlyAmount?: number | null;   // 월간 계약 금액 (¥)
  // 인보이스 BILL TO 정보
  billCompany?: string | null;     // 청구 회사명 (예: Four Company Inc.)
  billAddress?: string | null;     // 주소
  billTel?: string | null;         // 전화
  billRep?: string | null;         // 대표자/담당자
  billRegNo?: string | null;       // 사업자 등록번호
}

// 월별 브랜드 PR 상품
export interface BrandProduct {
  id: string;
  brandId: string;                 // 표시용 브랜드명
  yearMonth: string;               // YYYY-MM
  name: string;
  url?: string | null;
}

export interface CreatorSns { youtube?: string; tiktok?: string; x?: string; line?: string }
export interface CreatorRates { reels: number; secondary: number; offline: number; etc: number }
export type EntityType = "individual" | "corporation"; // 개인/법인

export interface Creator {
  id: string;
  code?: string | null;           // 고유번호 (CC001…)
  pic?: number;
  name: string;
  nameKanji?: string | null;      // 한자(일본어) 이름
  nameEn?: string | null;         // 영문 이름
  addressEn?: string | null;      // 영문 주소
  aliases: string[];
  handle?: string;
  photoUrl?: string | null;
  followers: number;
  status: CreatorStatus;
  category?: string;
  tone?: string;
  intro?: string;
  monthlyQuota?: number | null;
  fixedCost: number;
  contractDate?: string | null;   // 계약시작일
  startDate?: string | null;      // 활동시작일
  sns: CreatorSns;
  rates: CreatorRates;
  // 계약·정산 상세 (프리랜서 마스터, 민감정보 PII)
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bankAccount?: string | null;    // 은행계좌
  invoiceRegNo?: string | null;   // 인보이스 등록번호 (T번호)
  entityType?: EntityType | null; // 개인/법인
  withholding?: boolean | null;   // 원천징수 대상
  contractEnd?: string | null;    // 계약종료일
  baseFee?: number | null;        // 기본보수 (세전/월)
  payCycle?: string | null;       // 지급사이클
  // 연동
  ig?: { status: IgStatus; linkedAt?: string | null; expiresAt?: string | null; lastSyncedAt?: string | null };
}

export interface Contract { id: string; brandId: string; yearMonth: string; quota: number; unitPrice: number; monthlyAmount?: number | null }
export interface Assignment { id: string; brandId: string; creatorId: string; yearMonth: string; quota: number }

export interface ContentSched { plan?: string; shoot?: string; edit?: string; upload?: string }

export interface Content {
  id: string;
  brandId?: string | null;      // 브랜드 콘텐츠
  brandName?: string;           // 표시용 (브랜드명 또는 외부 client)
  creatorId: string;
  creatorName: string;          // 표시용
  dealId?: string | null;
  client?: string;              // 외부 PR 의뢰사
  igMediaId?: string;
  permalink?: string;
  thumbnailUrl?: string;
  caption?: string;
  product: string;
  kind: ContentKind;
  plannedDate?: string;         // M/D 또는 date
  publishedAt?: string | null;  // ISO date
  status: ContentStatus;
  matchSource?: "auto" | "manual";
  sched: ContentSched;
  videoStatus: VideoStatus;
  archivedVideoUrl?: string | null;
  // 최신 스냅샷 (편의)
  views: number; reach: number; likes: number; comments: number; saves: number; shares: number; watch?: number;
}

export interface Deal {
  id: string;
  code?: string;
  title: string;
  client: string;
  creatorName: string;
  manager?: string;
  source: DealSource;
  type: DealType;
  brief?: string;
  fee: number;
  secondaryFee?: number | null; // 2차 활용 비용
  shareCompany: number;
  shareCreator: number;
  dueDate?: string | null;
  uploadDate?: string | null;
  step: number;                 // 0~5
  contentId?: string | null;
}

export interface SecondaryRequest {
  id: string;
  product: string;
  creatorName: string;
  brandName: string;
  scope: string;
  channels: string[];
  start?: string;
  end?: string;
  fee: number;
  step: number;                 // 0~3 (요청/검토/동의/승인)
}

// 2차 활용 신청 (DB secondary_usage_requests 기반)
export interface SecondaryReq {
  id: string;
  contentId: string;
  product: string;              // 콘텐츠 상품/제목 (표시용)
  creatorName: string;          // 표시용
  brandName: string;            // 표시용
  scope: SecondaryScope;
  channels: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
  fee: number;
  status: SecondaryStatus;
  creatorConsentedAt?: string | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
}
export const SECONDARY_SCOPE_LABEL: Record<SecondaryScope, string> = {
  ad_creative: "광고 소재", sns_regram: "자사 SNS 리그램", offline: "오프라인 매장", web: "웹사이트", other: "기타",
};

export interface Account {
  email: string;
  role: Role;
  scope: string;                // 브랜드명 / 크리에이터명 / '81degree'
  status: AccountStatus;
  lastLogin?: string | null;
}

export interface Audience {
  female: number;
  ages: [string, number][];
  regions: [string, number][];
}

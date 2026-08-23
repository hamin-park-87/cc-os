import type { Brand, Creator, Content, Deal, Contract, Assignment, Account } from "@/lib/types";

export const ALL_BRANDS = ["abib", "naming", "amuse", "vidivici", "whipped"];
export const BRAND_COLOR: Record<string, string> = {
  abib: "#0E9E9A", naming: "#E0518A", amuse: "#F0A93B", vidivici: "#6C5CE7", whipped: "#F06595",
};
export const UNIT_PRICE = 500000;
export const TODAY = "2026-08-23";

export const brands: Brand[] = ALL_BRANDS.map((n) => ({
  id: n, name: n, aliases: [], color: BRAND_COLOR[n], domainAllowlist: [],
}));

const c = (o: Partial<Creator> & { name: string }): Creator => ({
  id: o.name!, aliases: [], followers: 0, status: "active", fixedCost: 0,
  sns: {}, rates: { reels: 0, secondary: 0, offline: 0, etc: 0 }, ...o,
});

export const creators: Creator[] = [
  c({ pic: 1, name: "merumi", handle: "@merumichandayo", followers: 27000, status: "active", category: "스킨케어", tone: "에디토리얼", monthlyQuota: 10, fixedCost: 100000, intro: "도쿄 기반 스킨케어·뷰티 에디토리얼 릴스. 감각적 연출과 제품 클로즈업이 강점.", sns: { tiktok: "@merumi.tt", line: "merumi_01" }, ig: { status: "active", linkedAt: "2026-05-20", expiresAt: "2026-07-19" } }),
  c({ pic: 2, name: "hina", handle: "@hinamiru", followers: 140000, status: "active", category: "데일리", tone: "데일리", monthlyQuota: 8, fixedCost: 100000, intro: "거리 인터뷰·데일리 브이로그로 20대 여성 팬층 확보. 팔로워 14만, 높은 도달률.", sns: { youtube: "@hinamiru", tiktok: "@hinamiru", x: "@hinamiru" }, ig: { status: "active", linkedAt: "2026-05-12", expiresAt: "2026-07-11" } }),
  c({ pic: 3, name: "rui", handle: "@ruiluiruilui", followers: 50000, status: "active", category: "메이크업", tone: "트렌디", monthlyQuota: 8, fixedCost: 100000, intro: "트렌디 메이크업 튜토리얼·GRWM 중심. 실사용 리뷰 신뢰도가 높음.", sns: { tiktok: "@rui.lui", x: "@ruiluirui" }, ig: { status: "expired", linkedAt: "2026-04-30" } }),
  c({ pic: 4, name: "momoco", handle: "@momo_2404", followers: 26000, status: "active", category: "스킨케어", tone: "리뷰", monthlyQuota: 15, fixedCost: 100000, intro: "스킨케어 리뷰·하울 전문. 솔직한 사용 후기로 저장률이 높음.", sns: { youtube: "@momoco", line: "momoco24" }, ig: { status: "active", linkedAt: "2026-06-01", expiresAt: "2026-07-31" } }),
  c({ pic: 5, name: "momo", handle: "@_bogsuny", followers: 18500, status: "active", category: "스킨케어", tone: "데일리", monthlyQuota: 3, fixedCost: 100000, intro: "데일리 코디·뷰티 리뷰. 자연스러운 PPL 소화력이 강점.", ig: { status: "active", linkedAt: "2026-06-10", expiresAt: "2026-08-09" } }),
  c({ pic: 6, name: "chihiro", handle: "@ichi__da", followers: 132000, status: "active", category: "리뷰", tone: "리뷰", monthlyQuota: 2, fixedCost: 100000, intro: "제품 언박싱·리뷰어. 발색·지속력 테스트 콘텐츠에 강함.", sns: { youtube: "@ichida", tiktok: "@ichi_da" }, ig: { status: "active", linkedAt: "2026-06-18", expiresAt: "2026-08-17" } }),
  c({ pic: 7, name: "momo2", handle: "@yyy__mo", followers: 28000, status: "active", fixedCost: 100000, ig: { status: "revoked", linkedAt: "2026-07-01" } }),
  c({ pic: 8, name: "noa", handle: "@noakaii", followers: 45000, status: "active", fixedCost: 100000, ig: { status: "active", linkedAt: "2026-07-05", expiresAt: "2026-09-03" } }),
  c({ pic: 9, name: "hikari", handle: "@__ohi._", followers: 22000, status: "on_hold" }),
  c({ pic: 10, name: "ami", handle: "@ami_io02", followers: 2600, status: "on_hold" }),
  c({ pic: 11, name: "seina", handle: "@28__s04", followers: 6200, status: "active", fixedCost: 100000, ig: { status: "active", linkedAt: "2026-07-10", expiresAt: "2026-09-08" } }),
  c({ pic: 12, name: "erika", handle: "@_wadaerika", followers: 100000, status: "preparing" }),
  c({ pic: 13, name: "nanako", handle: "@n.co._63", followers: 5410, status: "active", fixedCost: 100000, ig: { status: "active", linkedAt: "2026-07-15", expiresAt: "2026-09-13" } }),
  c({ pic: 14, name: "nagomi", handle: "@na__iii0614", followers: 91000, status: "on_hold" }),
  c({ pic: 15, name: "kyoka", handle: "@kyokakikukeko", followers: 74000, status: "on_hold", category: "데일리", tone: "데일리" }),
  c({ pic: 16, name: "yuika", handle: "@yuika__bn02", followers: 163000, status: "preparing" }),
  c({ pic: 17, name: "junna", handle: "@junna_hayashi", followers: 48000, status: "on_hold" }),
  c({ pic: 18, name: "rua", handle: "@_fijraa", followers: 13000, status: "active", fixedCost: 100000, ig: { status: "active", linkedAt: "2026-07-20", expiresAt: "2026-09-18" } }),
  c({ pic: 19, name: "mizuki", handle: "@mi_smile25", followers: 297000, status: "preparing" }),
];
// 기본 단가 (팔로워 규모 기준)
creators.forEach((cr) => {
  const f = cr.followers;
  const reels = f >= 150000 ? 900000 : f >= 100000 ? 700000 : f >= 40000 ? 400000 : f >= 20000 ? 250000 : 150000;
  const r10 = (n: number) => Math.round(n / 10000) * 10000;
  cr.rates = { reels, secondary: r10(reels * 0.6), offline: r10(reels * 0.9), etc: 0 };
  if (cr.monthlyQuota == null) cr.monthlyQuota = null;
});

const ct = (o: Partial<Content> & { id: string; creatorName: string; product: string }): Content => ({
  brandName: o.brandId ?? o.client ?? "", creatorId: o.creatorName!, kind: "pr", status: "planned",
  sched: {}, videoStatus: "none", views: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, ...o,
});

export const contents: Content[] = [
  ct({ id: "ct1", creatorName: "hina", brandId: "abib", product: "ヒアルロニックブームセラム", plannedDate: "7/14", publishedAt: "2026-07-16", status: "uploaded", views: 125050, reach: 86201, likes: 2526, saves: 270, comments: 8, shares: 55, watch: 9, permalink: "https://www.instagram.com/reel/DaSePDuv51z/", videoStatus: "ready" }),
  ct({ id: "ct2", creatorName: "rui", brandId: "abib", product: "アビブ ガムシートマスク", plannedDate: "8/5", publishedAt: "2026-08-07", status: "uploaded", views: 45228, reach: 22899, likes: 486, saves: 41, comments: 6, shares: 10, watch: 7, permalink: "https://www.instagram.com/reel/DZKjTlaSLHB/", videoStatus: "ready" }),
  ct({ id: "ct3", creatorName: "momo", brandId: "naming", product: "over dew glossy lip tint · LORN/BOIL", plannedDate: "7/22", publishedAt: "2026-07-24", status: "uploaded", views: 98700, reach: 71400, likes: 1980, saves: 212, comments: 34, shares: 41, watch: 8, permalink: "https://www.instagram.com/reel/DbIU1KZvj0p/", videoStatus: "ready" }),
  ct({ id: "ct4", creatorName: "merumi", brandId: "abib", product: "ヒアルロニックブームクリーム", plannedDate: "7/16", publishedAt: "2026-07-18", status: "uploaded", views: 73400, reach: 54120, likes: 1420, saves: 168, comments: 22, shares: 33, watch: 8, permalink: "https://www.instagram.com/reel/DaX9ppQ2f1z/", videoStatus: "ready" }),
  ct({ id: "ct5", creatorName: "chihiro", brandId: "vidivici", product: "브이디비디 콜라겐 크림", plannedDate: "8/8", publishedAt: "2026-08-10", status: "uploaded", views: 31200, reach: 24500, likes: 720, saves: 96, comments: 12, shares: 15, watch: 6, permalink: "https://www.instagram.com/reel/DdRt5uVn8Kc/", videoStatus: "ready" }),
  ct({ id: "ct6", creatorName: "hina", brandId: "abib", product: "아비브 수분 앰플 데일리", plannedDate: "8/9", publishedAt: "2026-08-11", status: "uploaded", views: 88400, reach: 60100, likes: 1710, saves: 190, comments: 14, shares: 28, watch: 8, permalink: "https://www.instagram.com/reel/Df1aBcD2eF3/", videoStatus: "ready" }),
  ct({ id: "ct7", creatorName: "merumi", brandId: "abib", product: "아비브 토너패드 8월", plannedDate: "8/6", publishedAt: "2026-08-08", status: "uploaded", views: 69200, reach: 50100, likes: 1290, saves: 150, comments: 18, shares: 22, watch: 7, permalink: "https://www.instagram.com/reel/Dg2bCdE3fG4/", videoStatus: "ready" }),
  ct({ id: "ct8", creatorName: "hina", brandId: "naming", product: "네이밍 톤업 선세럼", plannedDate: "8/20", status: "planned", sched: { plan: "2026-08-10", shoot: "2026-08-14", edit: "2026-08-18", upload: "2026-08-20" } }),
  ct({ id: "ct9", creatorName: "hina", brandId: "abib", product: "토너패드 리필 언박싱", plannedDate: "8/26", status: "planned", sched: { plan: "2026-08-16", shoot: "2026-08-21", edit: "2026-08-24", upload: "2026-08-26" } }),
  // 외부 PR 안건 콘텐츠
  ct({ id: "deal-102", creatorName: "hina", client: "ロート製薬", brandName: "ロート製薬", product: "ロート製薬 스킨케어 PR", kind: "deal", plannedDate: "8/20", publishedAt: "2026-08-20", status: "uploaded", views: 112400, reach: 78900, likes: 2210, saves: 240, comments: 26, shares: 44, watch: 9, permalink: "https://www.instagram.com/reel/Dh3cDeF4gH5/", videoStatus: "ready", dealId: "D-102" }),
  ct({ id: "deal-106", creatorName: "hina", client: "DAISO", brandName: "DAISO", product: "다이소 뷰티 하울", kind: "deal", plannedDate: "8/14", publishedAt: "2026-08-14", status: "uploaded", views: 96800, reach: 70200, likes: 1890, saves: 205, comments: 31, shares: 38, watch: 8, permalink: "https://www.instagram.com/reel/Di4dEfG5hI6/", videoStatus: "ready", dealId: "D-106" }),
];

export const contracts: Contract[] = ALL_BRANDS.map((b) => ({
  id: `2026-08-${b}`, brandId: b, yearMonth: "2026-08",
  quota: { abib: 5, naming: 4, amuse: 3, vidivici: 2, whipped: 2 }[b] ?? 3, unitPrice: UNIT_PRICE,
}));

const asg = (brandId: string, creatorId: string, quota: number): Assignment =>
  ({ id: `${brandId}|${creatorId}`, brandId, creatorId, yearMonth: "2026-08", quota });
export const assignments: Assignment[] = [
  asg("abib", "hina", 2), asg("abib", "merumi", 2), asg("abib", "rui", 1),
  asg("naming", "momo", 2), asg("naming", "hina", 1),
  asg("amuse", "kyoka", 2), asg("amuse", "momo", 1),
  asg("vidivici", "chihiro", 1), asg("vidivici", "hina", 1),
  asg("whipped", "rui", 1),
];

export const deals: Deal[] = [
  { id: "D-102", code: "D-102", title: "ロート製薬 스킨케어 PR", client: "ロート製薬", creatorName: "hina", manager: "yuta", source: "company_email", type: "ahchannel", fee: 2500000, shareCompany: 50, shareCreator: 50, dueDate: "2026-08-18", uploadDate: "2026-08-20", step: 5, contentId: "deal-102", brief: "신제품 세럼 사용 전/후 3주 루틴. 텍스처 클로즈업 필수, 15~30초 릴스." },
  { id: "D-106", code: "D-106", title: "다이소 뷰티 하울", client: "DAISO", creatorName: "hina", manager: "yuta", source: "creator_dm", type: "ahchannel", fee: 700000, shareCompany: 50, shareCreator: 50, dueDate: "2026-08-12", uploadDate: "2026-08-14", step: 5, contentId: "deal-106", brief: "1만원 이하 뷰티템 5종 하울. 실사용 데모 + 가성비 코멘트." },
  { id: "D-101", code: "D-101", title: "Ray Beams 가을 코디 릴스", client: "Ray Beams", creatorName: "momo", manager: "mai", source: "company_email", type: "creator", fee: 1200000, shareCompany: 50, shareCreator: 50, dueDate: "2026-08-25", uploadDate: "2026-08-28", step: 4, brief: "가을 신상 3코디 룩북. 착용샷 + 디테일컷." },
  { id: "D-105", code: "D-105", title: "무인양품 데일리 브이로그", client: "MUJI", creatorName: "merumi", manager: "mai", source: "creator_dm", type: "creator", fee: 900000, shareCompany: 50, shareCreator: 50, dueDate: "2026-08-30", step: 3, brief: "무지 수납·문구로 하루 루틴 브이로그. 과한 광고 톤 지양." },
  { id: "D-103", code: "D-103", title: "資生堂 신제품 언박싱", client: "資生堂", creatorName: "chihiro", manager: "mai", source: "company_email", type: "creator", fee: 1800000, shareCompany: 50, shareCreator: 50, dueDate: "2026-09-05", step: 2, brief: "신규 파운데이션 언박싱 + 발색/지속력 테스트." },
  { id: "D-104", code: "D-104", title: "コーセー 메이크업 튜토리얼", client: "コーセー", creatorName: "rui", manager: "yuta", source: "creator_email", type: "creator", fee: 1500000, shareCompany: 60, shareCreator: 40, dueDate: "2026-09-10", step: 1, brief: "가을 톤 데일리 메이크업 튜토리얼. 단계별 자막." },
];

export const accounts: Account[] = [
  { email: "hmpark@81degree.com", role: "admin", scope: "81degree", status: "active", lastLogin: "2026-08-23" },
  { email: "mai@81degree.com", role: "admin", scope: "81degree", status: "active", lastLogin: "2026-08-23" },
  { email: "yuta@81degree.com", role: "admin", scope: "81degree", status: "active", lastLogin: "2026-08-22" },
  { email: "marketing@abib.com", role: "brand", scope: "abib", status: "active", lastLogin: "2026-08-20" },
  { email: "pr@naming.jp", role: "brand", scope: "naming", status: "pending", lastLogin: null },
  { email: "hina.creator@gmail.com", role: "creator", scope: "hina", status: "active", lastLogin: "2026-08-19" },
  { email: "merumi.official@gmail.com", role: "creator", scope: "merumi", status: "pending", lastLogin: null },
];

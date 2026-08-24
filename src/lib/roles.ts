// 마스터 관리자: 유일하게 계정 삭제 + 관리자(admin) 계정 생성 가능.
// 나머지 관리자는 브랜드/크리에이터만 초대 가능.
export const MASTER_EMAIL = "hmpark@81degree.com";
export const isMaster = (email?: string | null) => (email ?? "").toLowerCase() === MASTER_EMAIL;

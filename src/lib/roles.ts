// 마스터 관리자: 유일하게 계정 삭제 + 관리자(admin) 계정 생성 가능.
// 나머지 관리자는 브랜드/크리에이터만 초대 가능.
export const MASTER_EMAIL = "hmpark@81degree.com";
export const isMaster = (email?: string | null) => (email ?? "").toLowerCase() === MASTER_EMAIL;

// 아이디 로그인 지원: 이메일 아닌 아이디는 내부적으로 아이디@cc-os.local 로 매핑.
export const LOCAL_DOMAIN = "cc-os.local";
export const toLoginEmail = (idOrEmail: string) => {
  const v = (idOrEmail ?? "").trim();
  return v.includes("@") ? v : `${v.toLowerCase()}@${LOCAL_DOMAIN}`;
};
// 표시용: 내부 도메인이면 도메인 떼고 아이디만
export const displayId = (email?: string | null) => {
  const v = email ?? "";
  return v.endsWith(`@${LOCAL_DOMAIN}`) ? v.slice(0, -(LOCAL_DOMAIN.length + 1)) : v;
};

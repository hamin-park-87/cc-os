import type { Brand, Creator, Content, Deal, Contract, Assignment, Account } from "@/lib/types";

// 데이터 접근 계약. Mock(현재) ↔ Supabase(추후) 를 동일 인터페이스로 교체.
export interface DataProvider {
  brands(): Promise<Brand[]>;
  creators(): Promise<Creator[]>;
  contents(): Promise<Content[]>;
  deals(): Promise<Deal[]>;
  contracts(): Promise<Contract[]>;
  assignments(): Promise<Assignment[]>;
  accounts(): Promise<Account[]>;
}

import type { DataProvider } from "./provider";
import * as seed from "./seed";

// 인메모리 Mock. Supabase 연결 전까지 앱 전체가 이 계층으로 동작.
export const mockProvider: DataProvider = {
  async brands() { return seed.brands; },
  async creators() { return seed.creators; },
  async contents() { return seed.contents; },
  async deals() { return seed.deals; },
  async contracts() { return seed.contracts; },
  async assignments() { return seed.assignments; },
  async accounts() { return seed.accounts; },
};

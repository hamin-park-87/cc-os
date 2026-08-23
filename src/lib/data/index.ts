import type { DataProvider } from "./provider";
import { mockProvider } from "./mock";
import { supabaseProvider } from "./supabase";
import { supabaseConfigured } from "@/lib/supabase/client";

// NEXT_PUBLIC_DATA_SOURCE=supabase + 키가 있으면 실 DB, 아니면 Mock.
export function getData(): DataProvider {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" && supabaseConfigured()) {
    return supabaseProvider;
  }
  return mockProvider;
}

export * as seed from "./seed";

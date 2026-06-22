"use client";

import { createBrowserClient } from "@supabase/ssr";

function requireClientEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createSupabaseClient() {
  const supabaseUrl = requireClientEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireClientEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Backward-compatible alias
export const getSupabaseBrowserClient = createSupabaseClient;

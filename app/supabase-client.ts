import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBoundedFetch } from './bounded-fetch';

type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

const env = import.meta.env as Record<string, string | boolean | undefined>;
const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
const publishableKey = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
  ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
  : typeof env.VITE_SUPABASE_ANON_KEY === 'string'
    ? env.VITE_SUPABASE_ANON_KEY.trim()
    : '';

export const supabaseConfig: PublicSupabaseConfig | null = url && publishableKey
  ? { url, publishableKey }
  : null;

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!supabaseConfig) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      global: { fetch: createBoundedFetch() },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

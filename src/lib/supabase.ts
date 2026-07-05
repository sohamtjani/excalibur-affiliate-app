import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

let supabaseConfigError: string | null = null;

export const supabase = (() => {
  try {
    const { url, anonKey } = getSupabaseEnv();
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (error) {
    supabaseConfigError =
      error instanceof Error ? error.message : 'Missing Supabase configuration.';
    return null;
  }
})();

export { supabaseConfigError };

import { createClient } from "@supabase/supabase-js";

const hostedSupabaseUrl = "https://bwmxmswnarwfaemeaxeh.supabase.co";
const hostedPublishableKey = "sb_publishable_MjFtfVUu3bGzmnUJIV9InA_XGKVSYox";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || hostedSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || hostedPublishableKey;
const forceDemoMode = import.meta.env.VITE_FORCE_DEMO === "true";

export const isSupabaseConfigured = !forceDemoMode;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

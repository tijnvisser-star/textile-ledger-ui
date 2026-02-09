import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log("SUPABASE ENV CHECK", {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKeyLen: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
  });

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

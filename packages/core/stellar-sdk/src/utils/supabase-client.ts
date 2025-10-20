import { createClient } from '@supabase/supabase-js';

const supabaseURL = process.env.SUPABASE_URL!;
const supabaseANON = process.env.SUPABASE_ANON_KEY!;

export const supabaseClient = createClient(supabaseURL, supabaseANON);

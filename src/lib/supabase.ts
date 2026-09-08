import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://stotgoylyzltzpahuglc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_sww0L_JeH4y7i0Zq5kX0Xg_ZWhJ7PsN';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

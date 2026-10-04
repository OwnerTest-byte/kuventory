import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  await supabase.auth.signInWithPassword({
    email: 'master@kuventory.com',
    password: 'MasterAdmin2026!'
  });

  const { data, error } = await supabase.from('schema_migrations').select('*');
  if (error) {
    console.log('Cannot query schema_migrations directly:', error.message);
  } else {
    console.log('Applied migrations:', data);
  }
}

check();

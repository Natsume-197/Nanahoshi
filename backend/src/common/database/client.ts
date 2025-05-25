import { createClient } from '@supabase/supabase-js';
import { Database } from '@/common/models/supabaseTypes';
import { env } from "@/common/utils/envConfig";

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration in environment variables.');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export default supabase;

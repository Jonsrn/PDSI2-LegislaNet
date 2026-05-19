const { createClient } = require('@supabase/supabase-js');

/**
 * Administrative Supabase client that uses the service key for privileged
 * backend operations that bypass row-level security.
 */
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

/**
 * Public Supabase client that uses the anonymous key for authentication flows.
 */
const supabasePublic = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = { supabaseAdmin, supabasePublic };

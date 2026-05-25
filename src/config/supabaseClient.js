const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase public client configured with the anonymous key.
 *
 * This module is intended for standard server-side operations that must respect
 * the permissions associated with the project's public Supabase key.
 *
 * @module config/supabaseClient
 */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
module.exports = supabase;

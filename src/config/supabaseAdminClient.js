const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase admin client configured with the service-role key.
 *
 * This module is intended for server-side use only because it bypasses
 * client-level authorization policies.
 *
 * @module config/supabaseAdminClient
 */
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
module.exports = supabaseAdmin;

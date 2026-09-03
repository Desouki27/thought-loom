import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Builds a Supabase client that acts as the calling user (forwards their JWT),
 * so every query is naturally scoped by the table's row-level security
 * policies — no service-role key is used anywhere in these functions.
 */
export function getUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
}

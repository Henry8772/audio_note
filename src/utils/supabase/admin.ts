import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Created on first use, not at import: `next build` loads every route module, and a build
// without the service key (Vercel Preview) must not crash on it.
let client: SupabaseClient | null = null

function admin(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return client
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_, prop) => {
    const c = admin()
    const v = Reflect.get(c, prop)
    return typeof v === 'function' ? v.bind(c) : v
  },
})

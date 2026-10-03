import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Server-side client that acts *as the signed-in user*: the Clerk session token is sent
// to Supabase, and RLS policies (see supabase/schema.sql) match rows on its `sub` claim.
//
// `token` lets a caller that already holds the session token (the page, which starts its reads and
// then streams them) hand it over, so the queries never need the request context after the page
// function has returned. Without it the token is read when each query runs, as before.
export function getDb(token?: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    accessToken: async () => (token !== undefined ? token : await (await auth()).getToken()),
  });
}

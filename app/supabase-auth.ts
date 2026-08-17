import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SUPABASE_URL = "https://ywncfltxrnrchicjwcse.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // Server components can read auth cookies but cannot always refresh them.
        }
      },
    },
  });
}

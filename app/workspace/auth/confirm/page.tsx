"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { modulesBrowserClient } from "@/lib/modules/supabase-browser";

// Invite / admin-generated links land here with the session in the URL
// fragment (#access_token=…&refresh_token=…), which only the browser can see.
// Magic links requested from /workspace/login use /workspace/auth/callback
// (PKCE code) instead.
export default function WorkspaceAuthConfirm() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    history.replaceState(null, "", window.location.pathname); // don't leave tokens in the address bar
    if (!access_token || !refresh_token) {
      // The tokens live in the URL fragment, which only the browser can read, and
      // must be consumed (and scrubbed from the address bar) exactly once - so this
      // runs in an effect and reports a bad link straight away.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(params.get("error_description") || "This sign-in link is invalid or has expired.");
      return;
    }
    modulesBrowserClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }: { error: unknown }) => {
        if (error) setError("This sign-in link is invalid or has expired.");
        else router.replace("/workspace");
      });
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        {error ? (
          <>
            <p role="alert" className="mb-4 text-gray-700">{error}</p>
            <Link href="/workspace/login" className="font-semibold text-navy hover:underline">Request a new sign-in link →</Link>
          </>
        ) : (
          <p role="status" className="text-gray-600">Signing you in…</p>
        )}
      </div>
    </main>
  );
}

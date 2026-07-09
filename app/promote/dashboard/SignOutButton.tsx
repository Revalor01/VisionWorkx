"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-2 text-xs text-promote-muted hover:text-promote-text transition-colors"
    >
      Sign out
    </button>
  );
}

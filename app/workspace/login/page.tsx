import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { modulesConfigured } from "@/lib/modules/supabase";

export const metadata: Metadata = { title: "Sign in — VisionWorkx workspace", robots: { index: false } };

export default async function WorkspaceLoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await props.searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/workspace") && !next.startsWith("//") ? next : "/workspace";
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">VisionWorkx</p>
        <h1 className="mt-1 mb-2 text-2xl font-bold text-navy-dark">Sign in to your workspace</h1>
        <p className="mb-6 text-sm text-gray-600">See your leads and form submissions, update their status and export them.</p>
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            That sign-in link didn&apos;t work or has expired. Request a new one below.
          </p>
        )}
        {modulesConfigured() ? (
          <LoginForm next={safeNext} />
        ) : (
          <p className="text-sm text-gray-600">Workspaces aren&apos;t available yet.</p>
        )}
      </div>
    </main>
  );
}

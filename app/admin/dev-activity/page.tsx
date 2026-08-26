import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import type { DevActivityLogEntry } from "@/lib/database.types";

const MACHINE_COLORS: Record<string, string> = {
  windows: "bg-blue-500/20 text-blue-300",
  mac: "bg-zinc-400/20 text-zinc-200",
};

function machineBadgeClass(machine: string): string {
  const key = machine.toLowerCase();
  if (key.includes("win")) return MACHINE_COLORS.windows;
  if (key.includes("mac")) return MACHINE_COLORS.mac;
  return "bg-purple-500/20 text-purple-300";
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DevActivityPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);
  const isRealAdmin = !authError && !!user && user.email === ADMIN_EMAIL;
  if (!isRealAdmin && !isSsoAdmin) redirect("/dashboard");

  const service = createServiceClient();
  const { data: entries, error } = await service
    .from("dev_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows: DevActivityLogEntry[] = entries ?? [];

  return (
    <div className="min-h-screen bg-[#121212]">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Vision Workx</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Dev Activity</span>
        </div>
        <a href="/admin" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Admin
        </a>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Dev Activity</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Latest pushes across machines — written by{" "}
            <code className="text-zinc-300">scripts/log-dev-activity.mjs</code> after each push.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            Failed to load: {error.message}
          </div>
        )}

        {!error && rows.length === 0 && (
          <div className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-6 text-center">
            No activity logged yet. Run <code className="text-zinc-300">node scripts/log-dev-activity.mjs &quot;summary&quot;</code> after your next push.
          </div>
        )}

        <div className="space-y-2">
          {rows.map((entry) => (
            <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${machineBadgeClass(entry.machine)}`}>
                    {entry.machine}
                  </span>
                  {entry.branch && <span className="text-xs text-zinc-500">{entry.branch}</span>}
                  {entry.commit_sha && (
                    <span className="text-xs text-zinc-500 font-mono">{entry.commit_sha.slice(0, 7)}</span>
                  )}
                  {entry.version && <span className="text-xs text-zinc-500">v{entry.version}</span>}
                </div>
                <span className="text-xs text-zinc-500" title={entry.created_at}>
                  {timeAgo(entry.created_at)}
                </span>
              </div>
              <p className="text-sm text-white mt-1.5">{entry.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

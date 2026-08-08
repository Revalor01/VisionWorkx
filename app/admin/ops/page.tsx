import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import OpsDashboard from "./OpsDashboard";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "team_MO27qs6ulec4Ev0kpSJCeYpd";

export type SupabaseProjectRow = {
  name: string;
  region: string;
  ref: string;
  bytes: number | null;
};

export type VercelProjectRow = {
  name: string;
  state: string;
  domain: string | null;
  deployedAt: string | null;
};

async function fetchSupabaseProjects(token: string): Promise<SupabaseProjectRow[]> {
  const res = await fetch("https://api.supabase.com/v1/projects", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase projects list failed: HTTP ${res.status}`);
  const projects: { name: string; region: string; ref: string }[] = await res.json();

  const sized = await Promise.all(
    projects.map(async (p) => {
      const dbRes = await fetch(`https://api.supabase.com/v1/projects/${p.ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "select pg_database_size(current_database()) as bytes;" }),
        cache: "no-store",
      });
      if (!dbRes.ok) return { ...p, bytes: null };
      const data = await dbRes.json();
      return { ...p, bytes: data?.[0]?.bytes ?? null };
    })
  );

  return sized.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
}

async function fetchVercelProjects(token: string): Promise<VercelProjectRow[]> {
  const res = await fetch(`https://api.vercel.com/v9/projects?teamId=${VERCEL_TEAM_ID}&limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vercel projects list failed: HTTP ${res.status}`);
  const data = await res.json();
  type VercelApiProject = {
    name: string;
    targets?: {
      production?: {
        alias?: string[];
        readyState?: string;
        createdAt?: number;
      };
    };
  };
  return ((data.projects ?? []) as VercelApiProject[]).map((p) => {
    const prod = p.targets?.production;
    return {
      name: p.name,
      state: prod?.readyState ?? "—",
      domain: prod?.alias?.[0] ?? null,
      deployedAt: prod?.createdAt ? new Date(prod.createdAt).toISOString() : null,
    };
  });
}

export default async function AdminOpsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) redirect("/dashboard");

  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const vercelToken = process.env.VERCEL_API_TOKEN;

  let supabaseProjects: SupabaseProjectRow[] = [];
  let supabaseError: string | null = null;
  if (mgmtToken) {
    try {
      supabaseProjects = await fetchSupabaseProjects(mgmtToken);
    } catch (err) {
      supabaseError = err instanceof Error ? err.message : String(err);
    }
  } else {
    supabaseError = "SUPABASE_MANAGEMENT_TOKEN is not configured";
  }

  let vercelProjects: VercelProjectRow[] = [];
  let vercelError: string | null = null;
  if (vercelToken) {
    try {
      vercelProjects = await fetchVercelProjects(vercelToken);
    } catch (err) {
      vercelError = err instanceof Error ? err.message : String(err);
    }
  } else {
    vercelError = "VERCEL_API_TOKEN is not configured";
  }

  return (
    <OpsDashboard
      supabaseProjects={supabaseProjects}
      supabaseError={supabaseError}
      vercelProjects={vercelProjects}
      vercelError={vercelError}
      generatedAt={new Date().toISOString()}
    />
  );
}

// Used by middleware (no supabase-js there): looks up which domains may frame
// /m/<publicId>, via PostgREST with the modules service key. Cached briefly
// per server instance so a busy embed doesn't hit the database every load.

const cache = new Map<string, { domains: string[] | null; at: number }>();
const TTL_MS = 60_000;

export async function allowedFrameDomains(publicId: string): Promise<string[] | null> {
  if (!/^m_[0-9a-f]{18}$/.test(publicId)) return null;
  const hit = cache.get(publicId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.domains;

  const url = process.env.MODULES_SUPABASE_URL ?? process.env.NEXT_PUBLIC_MODULES_SUPABASE_URL;
  const key = process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/vw_modules?public_id=eq.${publicId}&select=vw_workspaces!inner(domains)`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { vw_workspaces: { domains: string[] } }[];
    const domains = rows[0]?.vw_workspaces?.domains ?? null;
    cache.set(publicId, { domains, at: Date.now() });
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    return domains;
  } catch {
    return null;
  }
}

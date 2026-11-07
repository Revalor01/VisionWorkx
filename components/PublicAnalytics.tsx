"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

// Cloudflare Web Analytics, on public marketing pages only. Never on client-site modules
// (/m, /b), private links (/try/<token>) or signed-in pages. /try is left out because it
// moves straight to a /try/<token> link.
// spa:false stops the beacon following in-app navigation off these pages.
const PUBLIC_PATHS = ["/", "/start", "/web-app-vs-web-page"];
const isPublic = (path: string) => PUBLIC_PATHS.includes(path);

export default function PublicAnalytics() {
  const pathname = usePathname();
  if (!isPublic(pathname)) return null;
  return (
    <Script
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon='{"token": "23ca60e4008c4e20b5d4655f851af8a2", "spa": false}'
      strategy="afterInteractive"
    />
  );
}

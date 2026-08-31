import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Link-preview / crawler UAs. These fire once per link (Facebook renders
// a preview card, Slack/iMessage/etc. unfurl) and would otherwise inflate
// click counts massively — log them but flag is_bot so reads can exclude.
const BOT_UA =
  /facebookexternalhit|facebookcatalog|twitterbot|slackbot|linkedinbot|whatsapp|telegrambot|discordbot|googlebot|bingbot|applebot|pinterest|redditbot|embedly|quora link preview|bitlybot|nuzzel|vkshare|w3c_validator|preview|crawler|spider|bot\b/i;

function ipHash(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim();
  if (!ip) return null;
  // Rotating daily salt — enough to count rough uniques within a day
  // without ever storing a reversible IP.
  const salt =
    process.env.SHORT_LINK_IP_SALT ?? new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${ip}|${salt}`).digest("hex").slice(0, 32);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;
  const service = createServiceClient();

  const { data: link } = await service
    .from("short_links")
    .select("id, destination_url")
    .eq("code", code)
    .maybeSingle();

  if (!link) {
    // Unknown code — send them somewhere real rather than a dead 404.
    return NextResponse.redirect(
      process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app",
      302
    );
  }

  const ua = req.headers.get("user-agent") ?? "";
  const isBot = BOT_UA.test(ua);

  // Fire-and-forget the click log; never block or fail the redirect on it.
  service
    .from("link_clicks")
    .insert({
      short_link_id: link.id,
      referrer: req.headers.get("referer"),
      user_agent: ua.slice(0, 500) || null,
      ip_hash: ipHash(req),
      is_bot: isBot,
    })
    .then(
      ({ error }) => {
        if (error) console.error("[go] click log failed:", error.message);
      },
      (err) => console.error("[go] click log threw:", err)
    );

  return NextResponse.redirect(link.destination_url, 302);
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";

export const runtime = "nodejs";
export const maxDuration = 15;

// Lightweight list for the Content UI's "post social derivatives under
// which brand" picker — full social_brands rows carry connection tokens
// this route has no business returning.
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.from("social_brands").select("id, name, slug").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ brands: data ?? [] });
}

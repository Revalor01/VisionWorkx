import { NextRequest, NextResponse } from "next/server";
import { modulesServerClient } from "@/lib/modules/supabase";

export async function POST(req: NextRequest) {
  const supabase = await modulesServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/workspace/login", req.url), { status: 303 });
}

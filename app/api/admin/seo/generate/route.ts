import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import { runBlogGeneration } from "@/lib/blog/pipeline";
import type { BlogProduct } from "@/lib/blog/products";

export const runtime = "nodejs";
export const maxDuration = 120;

async function isAdmin(): Promise<boolean> {
  const supabase = createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const isRealAdmin = !error && !!user && user.email === ADMIN_EMAIL;

  const cookieStore = cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  return isRealAdmin || isSsoAdmin;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let product: BlogProduct | undefined;
  try {
    const body = await req.json();
    if (typeof body?.product === "string") product = body.product;
  } catch {
    // no body — auto-rotate
  }

  const result = await runBlogGeneration(product);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

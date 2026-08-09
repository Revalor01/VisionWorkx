import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import type { Database } from "@/lib/database.types";

type BlogPostUpdate = Database["public"]["Tables"]["blog_posts"]["Update"];

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

const EDITABLE_FIELDS = ["title", "meta_description", "excerpt", "body", "status"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const update: BlogPostUpdate = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (update.status === "published") update.published_at = new Date().toISOString();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("blog_posts").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service.from("blog_posts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

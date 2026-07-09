import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { PromoteService } from "@/lib/database.types";
import { sendWelcomeEmail } from "@/lib/promote/email";

interface BusinessPayload {
  name: string;
  businessType: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  description?: string;
  logoUrl?: string;
  photoUrls?: string[];
  services: PromoteService[];
  brandColor?: string;
  bookingUrl?: string;
  websiteUrl?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BusinessPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.businessType?.trim()) {
    return NextResponse.json({ error: "Missing name or businessType" }, { status: 400 });
  }
  if (!Array.isArray(body.services) || body.services.length === 0) {
    return NextResponse.json({ error: "At least one service is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const fields = {
    name: body.name.trim(),
    business_type: body.businessType.trim(),
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip_code: body.zipCode ?? null,
    description: body.description ?? null,
    logo_url: body.logoUrl ?? null,
    photo_urls: body.photoUrls ?? [],
    services: body.services,
    brand_color: body.brandColor ?? "#4f8ef7",
    booking_url: body.bookingUrl ?? null,
    website_url: body.websiteUrl ?? null,
  };

  let businessId: string;

  if (existing) {
    const { data, error } = await serviceClient
      .from("promote_businesses")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    businessId = data.id;
  } else {
    const { data, error } = await serviceClient
      .from("promote_businesses")
      .insert({ ...fields, user_id: user.id })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    businessId = data.id;

    if (user.email) {
      sendWelcomeEmail(user.email, fields.name).catch(() => {});
    }
  }

  return NextResponse.json({ businessId }, { status: existing ? 200 : 201 });
}

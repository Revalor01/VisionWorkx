import { modulesServiceClient } from "./supabase";
import { parseBrand, parseFormConfig, type Brand, type FormConfig } from "./config";

// Server-side reads for the public embed paths. Only returns what a visitor's
// browser is allowed to see (never webhook secrets, emails or plan).

export interface PublicModule {
  id: string; // internal uuid (server use only)
  publicId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  plan: string;
  billingStatus: string;
  notificationEmail: string | null;
  type: string;
  status: string;
  domains: string[];
  brand: Brand;
  logoUrl: string | null;
  config: FormConfig;
  /** Server-only -- never sent to the visitor's browser, only used to decide whether/how to create a Checkout Session. */
  stripeConnectAccountId: string | null;
  connectPaymentsStatus: string;
  connectPaymentsTestMode: boolean;
}

const PUBLIC_ID_RE = /^m_[0-9a-f]{18}$/;

export function isPublicModuleId(v: string): boolean {
  return PUBLIC_ID_RE.test(v);
}

export async function getModuleByPublicId(publicId: string): Promise<PublicModule | null> {
  if (!isPublicModuleId(publicId)) return null;
  const db = modulesServiceClient();
  const { data, error } = await db
    .from("vw_modules")
    .select(
      "id, public_id, workspace_id, type, status, config, vw_workspaces!inner(name, slug, domains, brand, logo_url, plan, billing_status, notification_email, stripe_connect_account_id, connect_payments_status, connect_payments_test_mode)",
    )
    .eq("public_id", publicId)
    .maybeSingle();
  if (error || !data) return null;
  const ws = (Array.isArray(data.vw_workspaces) ? data.vw_workspaces[0] : data.vw_workspaces) as {
    name: string;
    slug: string;
    domains: string[];
    brand: unknown;
    logo_url: string | null;
    plan: string;
    billing_status: string;
    notification_email: string | null;
    stripe_connect_account_id: string | null;
    connect_payments_status: string;
    connect_payments_test_mode: boolean;
  };
  return {
    id: data.id,
    publicId: data.public_id,
    workspaceId: data.workspace_id,
    workspaceName: ws.name,
    workspaceSlug: ws.slug,
    plan: ws.plan,
    billingStatus: ws.billing_status,
    notificationEmail: ws.notification_email,
    type: data.type,
    status: data.status,
    domains: ws.domains ?? [],
    brand: parseBrand(ws.brand),
    logoUrl: ws.logo_url,
    config: parseFormConfig(data.config),
    stripeConnectAccountId: ws.stripe_connect_account_id,
    connectPaymentsStatus: ws.connect_payments_status,
    connectPaymentsTestMode: ws.connect_payments_test_mode,
  };
}

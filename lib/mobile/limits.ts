// Plain constants, zero imports — lib/mobile/generator.ts enforces these
// server-side, and MobileDashboard.tsx (a client component) shows the same
// numbers as live character counts. Importing generator.ts itself into the
// client bundle would pull in lib/aiUsage.ts -> lib/supabase.ts -> next/headers
// and break the build, the same reason lib/marketing/products.ts stays
// import-free.
export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 180;
export const SMS_BODY_MAX = 160;

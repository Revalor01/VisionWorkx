// Types + presentation for Insights that are safe to import from a client
// component. The data-access half (Supabase / next/headers) lives in
// lib/apps/insights.ts, which re-exports everything here.

import type { AppCategory } from "@/lib/database.types";

export const METRIC_LABELS: Record<string, string> = {
  bookings_created: "Bookings",
  bookings_completed: "Completed",
  bookings_cancelled: "Cancelled",
  bookings_no_show: "No-shows",
  leads_created: "New leads",
  leads_converted: "Converted",
  notes_added: "Notes added",
  orders_created: "Orders",
  orders_fulfilled: "Fulfilled",
  items_low_stock: "Low-stock items",
  documents_shared: "Documents shared",
  messages_sent: "Messages",
  active_clients: "Active clients",
  invoices_sent: "Invoices sent",
  invoices_paid: "Invoices paid",
  quotes_created: "Quotes",
  members_active: "Active members",
  members_new: "New members",
  members_churned: "Churned",
  revenue_cents: "Revenue",
};

// Which metrics headline the summary cards for each category, in order.
export const CATEGORY_HEADLINE_METRICS: Record<AppCategory, string[]> = {
  booking: ["bookings_created", "bookings_completed", "bookings_no_show", "revenue_cents"],
  crm: ["leads_created", "leads_converted", "notes_added"],
  inventory: ["orders_created", "orders_fulfilled", "items_low_stock", "revenue_cents"],
  portal: ["active_clients", "documents_shared", "messages_sent"],
  invoicing: ["invoices_sent", "invoices_paid", "revenue_cents", "quotes_created"],
  membership: ["members_active", "members_new", "members_churned", "revenue_cents"],
};

export interface DailyPoint {
  day: string;
  value: number;
}
export interface MetricSeries {
  key: string;
  label: string;
  total: number;
  points: DailyPoint[];
}
export interface Insights {
  metrics: MetricSeries[];
  hasData: boolean;
  lastCaptured: string | null;
}

export function formatMetricValue(key: string, value: number): string {
  if (key === "revenue_cents") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value / 100);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

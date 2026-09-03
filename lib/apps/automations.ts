// Phase 4: the automation catalogue. `automation_workflows` stays a flat
// (app, trigger_type, action_type, enabled, channel) table — this is the
// list of pairs the Settings UI offers per category, and which the two
// engines act on:
//   - event-driven pairs  → revalor-automation's poller (separate repo),
//     which reads automation_events written by the per-app trigger
//   - timeBased pairs      → /api/cron/app-automations in THIS repo, which
//     scans the tenant's own tables on a schedule
//
// Keep the event-driven action_type strings in sync with
// revalor-automation/lib/actions.mjs.

import type { AppCategory, AutomationChannel } from "@/lib/database.types";

export interface AutomationDef {
  trigger_type: string;
  action_type: string;
  label: string;
  description: string;
  /** Channels the owner may pick; first is the default. */
  channels: AutomationChannel[];
  /** True → run by the hourly tenant scan, not the event poller. */
  timeBased?: boolean;
}

export const AUTOMATIONS_BY_CATEGORY: Record<AppCategory, AutomationDef[]> = {
  booking: [
    {
      trigger_type: "booking.created",
      action_type: "send_confirmation_email",
      label: "Booking confirmation",
      description: "Send the customer a confirmation the moment they book.",
      channels: ["email", "sms"],
    },
    {
      trigger_type: "booking.reminder_24h",
      action_type: "send_reminder",
      label: "24-hour reminder",
      description: "Remind the customer the day before their appointment.",
      channels: ["email", "sms"],
      timeBased: true,
    },
    {
      trigger_type: "booking.no_show",
      action_type: "send_no_show_followup",
      label: "No-show follow-up",
      description: "Reach out when someone misses their appointment.",
      channels: ["email"],
    },
    {
      trigger_type: "booking.completed",
      action_type: "send_review_request",
      label: "Review request",
      description: "Ask for a review a day after a completed appointment.",
      channels: ["email", "sms"],
      timeBased: true,
    },
  ],
  crm: [
    {
      trigger_type: "lead.created",
      action_type: "send_lead_acknowledgment",
      label: "Lead acknowledgment",
      description: "Auto-reply to a new lead so they know you got it.",
      channels: ["email"],
    },
    {
      trigger_type: "lead.stale_3d",
      action_type: "send_followup_nudge",
      label: "Stale-lead nudge",
      description: "Follow up on a lead that's had no activity for 3 days.",
      channels: ["email"],
      timeBased: true,
    },
  ],
  invoicing: [
    {
      trigger_type: "invoice.created",
      action_type: "send_invoice_email",
      label: "Invoice sent",
      description: "Email the invoice to the customer when you create it.",
      channels: ["email"],
    },
    {
      trigger_type: "invoice.overdue",
      action_type: "send_payment_reminder",
      label: "Payment reminder",
      description: "Chase an invoice that's past its due date.",
      channels: ["email", "sms"],
      timeBased: true,
    },
    {
      trigger_type: "quote.stale_5d",
      action_type: "send_quote_nudge",
      label: "Quote follow-up",
      description: "Nudge a customer on a quote they haven't accepted in 5 days.",
      channels: ["email"],
      timeBased: true,
    },
  ],
  membership: [
    {
      trigger_type: "membership.created",
      action_type: "send_welcome",
      label: "Welcome message",
      description: "Greet a new member when they join.",
      channels: ["email", "sms"],
    },
    {
      trigger_type: "membership.payment_failed",
      action_type: "send_dunning",
      label: "Failed-payment notice",
      description: "Tell a member when their renewal payment doesn't go through.",
      channels: ["email", "sms"],
    },
  ],
  inventory: [
    {
      trigger_type: "inventory.low_stock",
      action_type: "send_low_stock_alert",
      label: "Low-stock alert",
      description: "Email you when an item drops below its reorder point.",
      channels: ["email"],
    },
  ],
  portal: [
    {
      trigger_type: "document.shared",
      action_type: "send_document_notice",
      label: "New document notice",
      description: "Tell a client when you share a new document with them.",
      channels: ["email"],
    },
  ],
};

export function automationsForCategory(category: AppCategory): AutomationDef[] {
  return AUTOMATIONS_BY_CATEGORY[category] ?? [];
}

export function timeBasedAutomations(category: AppCategory): AutomationDef[] {
  return automationsForCategory(category).filter((a) => a.timeBased);
}

export function findAutomation(
  category: AppCategory,
  triggerType: string,
): AutomationDef | undefined {
  return automationsForCategory(category).find((a) => a.trigger_type === triggerType);
}

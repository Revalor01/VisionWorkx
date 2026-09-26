// Mirrors revalor-automation/lib/vw/templates.mjs DEFAULT_TEMPLATES so the
// dashboard can show and edit the same defaults the sender uses.
export const EMAIL_KINDS = ["customer_confirmation", "owner_alert", "follow_up"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_KIND_LABEL: Record<EmailKind, { title: string; help: string }> = {
  customer_confirmation: { title: "Confirmation to your customer", help: "Sent right away, from your business name. Replies come to your alert email." },
  owner_alert: { title: "Alert to you", help: "Sent right away to your alert email. Reply to answer the customer directly." },
  follow_up: { title: "Follow-up to your customer", help: "Sent later (you choose when). Includes an unsubscribe link." },
};

export const DEFAULT_EMAILS: Record<EmailKind, { subject: string; body: string; enabled: boolean; delayHours: number }> = {
  customer_confirmation: {
    subject: "We got your request, {{customer_first_name}}",
    body:
      "Hi {{customer_first_name}},\n\nThanks for reaching out to {{business_name}}. We received your {{form_name}} and will get back to you soon.\n\nHere's what you sent:\n{{submission_summary}}\n\n— {{business_name}}",
    enabled: true,
    delayHours: 0,
  },
  owner_alert: {
    subject: "New {{form_name}} from {{customer_name}}",
    body:
      "You have a new submission from your {{form_name}} form.\n\n{{submission_summary}}\n\nReply to this email to answer {{customer_first_name}} directly, or open your dashboard: {{dashboard_url}}",
    enabled: true,
    delayHours: 0,
  },
  follow_up: {
    subject: "Following up on your request to {{business_name}}",
    body:
      "Hi {{customer_first_name}},\n\nJust checking in about your {{form_name}}. If you have any questions, reply to this email and we'll help.\n\n— {{business_name}}",
    enabled: false,
    delayHours: 48,
  },
};

export const EMAIL_VARIABLES = [
  "business_name",
  "customer_name",
  "customer_first_name",
  "customer_email",
  "form_name",
  "submission_summary",
  "dashboard_url",
] as const;

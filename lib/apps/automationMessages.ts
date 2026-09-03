// Plain transactional copy for time-based automations. Kept intentionally
// generic — the business name and a few context values from the tenant
// row's `context` jsonb are the only variables.

type Ctx = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function whenText(v: unknown): string {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function money(cents: unknown): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}
function wrap(business: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2233">${body}<p style="margin-top:24px;font-size:13px;color:#8a93a2">— ${business}</p></div>`;
}

export interface RenderedMessage {
  subject: string;
  html: string;
  sms: string;
}

export function renderAutomationMessage(
  triggerType: string,
  business: string,
  ctx: Ctx,
): RenderedMessage {
  switch (triggerType) {
    case "booking.reminder_24h": {
      const when = whenText(ctx.starts_at ?? ctx.start_time ?? ctx.appointment_at);
      const svc = str(ctx.service ?? ctx.service_name);
      const line = `This is a reminder of your ${svc ? svc + " " : ""}appointment${when ? ` on ${when}` : " tomorrow"} with ${business}.`;
      return {
        subject: `Reminder: your appointment with ${business}`,
        html: wrap(business, `<p>${line}</p><p>See you soon!</p>`),
        sms: `${line} Reply if you need to reschedule.`,
      };
    }
    case "booking.completed": {
      return {
        subject: `How was your visit to ${business}?`,
        html: wrap(business, `<p>Thanks for coming in! If you have a moment, we'd really appreciate a quick review — it helps a lot.</p>`),
        sms: `Thanks for visiting ${business}! If you have a moment, we'd love a quick review.`,
      };
    }
    case "lead.stale_3d": {
      return {
        subject: `Following up from ${business}`,
        html: wrap(business, `<p>Just circling back on your enquiry — happy to answer any questions or get you booked in whenever you're ready.</p>`),
        sms: `Hi from ${business} — just following up on your enquiry. Let us know if you have any questions.`,
      };
    }
    case "invoice.overdue": {
      const amt = money(ctx.amount_cents ?? ctx.total_cents);
      return {
        subject: `Payment reminder from ${business}`,
        html: wrap(business, `<p>A friendly reminder that your invoice${amt ? ` for ${amt}` : ""} is now past due. You can pay it online any time.</p>`),
        sms: `${business}: a reminder that your invoice${amt ? ` for ${amt}` : ""} is past due. You can pay online any time.`,
      };
    }
    case "quote.stale_5d": {
      const amt = money(ctx.amount_cents ?? ctx.total_cents);
      return {
        subject: `Still interested? Your quote from ${business}`,
        html: wrap(business, `<p>Just checking in on the quote${amt ? ` for ${amt}` : ""} we sent over. It's still good — let us know if you'd like to go ahead or have questions.</p>`),
        sms: `${business}: checking in on your quote${amt ? ` for ${amt}` : ""}. Still good — let us know if you'd like to proceed.`,
      };
    }
    default:
      return {
        subject: `A message from ${business}`,
        html: wrap(business, `<p>You have an update from ${business}.</p>`),
        sms: `You have an update from ${business}.`,
      };
  }
}

// Zero imports so MarketingDashboard.tsx (a client component) can use the
// same rules the send route enforces server-side.
//
// Twilio needs E.164 ("+15551234567"), and filterSmsOptOuts() compares
// phone strings exactly against mobile_sms_opt_outs — so a number typed as
// "(555) 123-4567" has to be normalised BEFORE the opt-out check, or a
// STOP'd number would slip past it in a different format.
//
// Numbers without a country code are treated as US (+1), matching the
// US-only customer base.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    // E.164: up to 15 digits, first digit of the country code is never 0.
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (digits.length === 10) return /^[2-9]/.test(digits) ? `+1${digits}` : null;
  if (digits.length === 11 && digits.startsWith("1")) return /^[2-9]/.test(digits.slice(1)) ? `+${digits}` : null;
  return null;
}

// Splits free-form input (commas, semicolons or new lines) into unique
// normalised numbers, reporting anything that wasn't a valid number.
export function parsePhoneList(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    if (!raw.trim()) continue;
    const phone = normalizePhone(raw);
    if (!phone) invalid.push(raw.trim());
    else if (!valid.includes(phone)) valid.push(phone);
  }
  return { valid, invalid };
}

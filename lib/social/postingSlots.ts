// Simple fixed-hour slot picker for autonomously-generated posts — picks
// the next N preferred hours (UTC) that haven't passed yet today, falling
// back to the same hours tomorrow. Deliberately basic for v1; can grow
// into per-brand quiet-hours/preferred-hours config later.
const PREFERRED_HOURS_UTC = [14, 17, 20]; // roughly 9am/12pm/3pm ET

export function pickPostingSlots(count: number, now: Date = new Date()): string[] {
  const slots: string[] = [];

  for (const hour of PREFERRED_HOURS_UTC) {
    if (slots.length >= count) break;
    const slot = new Date(now);
    slot.setUTCHours(hour, 0, 0, 0);
    if (slot.getTime() <= now.getTime()) slot.setUTCDate(slot.getUTCDate() + 1);
    slots.push(slot.toISOString());
  }

  // If more posts than preferred hours, stack the remainder on
  // subsequent days at the first preferred hour.
  let dayOffset = 1;
  while (slots.length < count) {
    const slot = new Date(now);
    slot.setUTCDate(slot.getUTCDate() + dayOffset);
    slot.setUTCHours(PREFERRED_HOURS_UTC[0], 0, 0, 0);
    slots.push(slot.toISOString());
    dayOffset++;
  }

  return slots;
}

// Spread `perDay` posts across the next `days` days (starting tomorrow, so
// nothing lands in the past) at the preferred hours. One ISO slot per post, in
// order; length = days * min(perDay, PREFERRED_HOURS_UTC.length). Used by the
// batch generator to future-date a 7-15 day content queue.
export function scheduleOverDays(opts: { days: number; perDay: number; now?: Date }): string[] {
  const base = opts.now ?? new Date();
  const days = Math.max(1, Math.floor(opts.days));
  const perDay = Math.min(PREFERRED_HOURS_UTC.length, Math.max(1, Math.floor(opts.perDay)));
  const slots: string[] = [];
  for (let d = 1; d <= days; d++) {
    for (let h = 0; h < perDay; h++) {
      const slot = new Date(base);
      slot.setUTCDate(slot.getUTCDate() + d);
      slot.setUTCHours(PREFERRED_HOURS_UTC[h], 0, 0, 0);
      slots.push(slot.toISOString());
    }
  }
  return slots;
}

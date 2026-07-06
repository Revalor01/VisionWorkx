import type { AppCategory } from "@/lib/database.types";

// Mirrors the CATEGORY_PATTERNS/semanticEventType logic in
// revalor-automation/poller/poll.mjs — kept in sync manually since the
// poller is a separate standalone project. If one changes, update the other.
const CATEGORY_PATTERNS: Partial<Record<AppCategory, { subject: string; tablePattern: RegExp }>> = {
  booking: { subject: "booking", tablePattern: /booking|appointment|reservation|scheduled_class/i },
  crm: { subject: "lead", tablePattern: /lead|contact|customer/i },
  inventory: { subject: "inventory_item", tablePattern: /inventory|product|stock/i },
  portal: { subject: "document", tablePattern: /document|message/i },
  invoicing: { subject: "invoice", tablePattern: /invoice|quote/i },
  membership: { subject: "membership", tablePattern: /membership|member/i },
};

const OPERATION_VERBS: Record<string, string> = {
  INSERT: "created",
  UPDATE: "updated",
  DELETE: "deleted",
};

export function semanticEventLabel(
  category: AppCategory | null | undefined,
  tableName: string,
  operation: string
): string {
  const pattern = category ? CATEGORY_PATTERNS[category] : undefined;
  const verb = OPERATION_VERBS[operation] ?? operation.toLowerCase();
  if (pattern && pattern.tablePattern.test(tableName)) {
    return `${pattern.subject}.${verb}`;
  }
  return `${tableName}.${operation.toLowerCase()}`;
}

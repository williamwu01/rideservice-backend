import * as chrono from "chrono-node";

/**
 * Parse a free-text pickup time like "tomorrow 3 AM", "Today 3:00 PM", "ASAP"
 * into a concrete Date (always in the future).
 *
 * Returns null if the text means "now / ASAP" or cannot be parsed.
 */
export function parsePickupTime(text: string): Date | null {
  const trimmed = text.trim().toUpperCase();

  if (trimmed === "ASAP" || trimmed === "NOW") return null;

  // chrono-node with forwardDate:true ensures it picks the next occurrence
  // (so "3 AM" doesn't resolve to 3 AM that already passed today)
  const parsed = chrono.parseDate(text, new Date(), { forwardDate: true });
  return parsed ?? null;
}

/**
 * Format a Date to a friendly string for WhatsApp messages.
 */
export function formatScheduledTime(date: Date): string {
  return date.toLocaleString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

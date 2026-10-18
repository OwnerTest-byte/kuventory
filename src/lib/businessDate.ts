/**
 * Business Timezone Utilities for KUVENTORY
 * Standard Operating Timezone: Asia/Manila (Philippine Standard Time, UTC+8)
 * 
 * Prevents UTC-boundary truncation where early morning hours (00:00 - 07:59 PHT)
 * would otherwise resolve to the previous calendar day when using toISOString().
 */

export const BUSINESS_TIMEZONE = 'Asia/Manila';

/**
 * Returns a 'YYYY-MM-DD' date string strictly in the Philippine business timezone.
 * 
 * @param date Optional JavaScript Date object (defaults to current system time)
 * @returns Date string formatted as YYYY-MM-DD (e.g., '2026-10-18')
 */
export function getBusinessDateString(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // Robust fallback if Intl timezone is unavailable
    const offsetDate = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60 * 1000);
    return offsetDate.toISOString().split('T')[0];
  }
}

/**
 * Returns a localized human-readable date string in Philippine business timezone.
 */
export function formatBusinessDate(
  date: Date = new Date(),
  options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  }
): string {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: BUSINESS_TIMEZONE,
      ...options,
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Calculates a future date in business timezone adding the specified days.
 */
export function getBusinessDateStringPlusDays(days: number, fromDate: Date = new Date()): string {
  const target = new Date(fromDate);
  target.setDate(target.getDate() + days);
  return getBusinessDateString(target);
}

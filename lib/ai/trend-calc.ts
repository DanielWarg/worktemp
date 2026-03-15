/**
 * Date-based trend calculation. Pure math, no LLM.
 */

export type TrendType = "RECURRING" | "ESCALATING" | "ISOLATED";

/**
 * Calculate trend from a list of dates.
 * - ISOLATED: fewer than 3 dates, or all within a 7-day window
 * - ESCALATING: second half has 2x+ more tickets than first half
 * - RECURRING: spread over time, steady frequency
 */
export function calcTrend(dates: Date[]): TrendType {
  if (dates.length < 3) return "ISOLATED";

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const spanDays = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / (1000 * 60 * 60 * 24);

  // All within a week = one burst
  if (spanDays < 7) return "ISOLATED";

  // Split dates in halves by time (not count)
  const midTime = sorted[0].getTime() + (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / 2;
  const firstHalf = sorted.filter((d) => d.getTime() <= midTime).length;
  const secondHalf = sorted.filter((d) => d.getTime() > midTime).length;

  // If second half has 2x+ more → escalating
  if (secondHalf >= firstHalf * 2) return "ESCALATING";

  return "RECURRING";
}

export type ScopeType = "SINGLE" | "CROSS_PERSON" | "CROSS_TEAM";

/**
 * Calculate scope from unique org/person count.
 */
export function calcScope(uniquePersons: number): ScopeType {
  if (uniquePersons <= 1) return "SINGLE";
  if (uniquePersons <= 3) return "CROSS_PERSON";
  return "CROSS_TEAM";
}

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * Calculate confidence from ticket count and entity specificity.
 * - HIGH: ≥5 tickets AND has specific entity
 * - MEDIUM: 3-4 tickets OR ≥5 without specific entity
 * - LOW: 2 tickets
 */
export function calcConfidence(ticketCount: number, hasSpecificEntity: boolean): ConfidenceLevel {
  if (ticketCount >= 5 && hasSpecificEntity) return "HIGH";
  if (ticketCount >= 3) return "MEDIUM";
  return "LOW";
}

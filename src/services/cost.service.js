/**
 * Cost splitting.
 *
 * Design decision worth defending: the per-rider share is DERIVED, never stored.
 * share = estimatedCost / (number of CONFIRMED riders). Because we compute it
 * from the live confirmed-booking count, it is always correct and "recalculates
 * whenever a rider cancels" (§3.5) for free — there is no denormalised number
 * that can drift out of sync. We still WRITE an audit row on each change so
 * there's a trace of what each rider was charged at each point in time.
 */

/**
 * @param {number|string} estimatedCost total ride cost
 * @param {number} confirmedCount number of confirmed riders
 * @returns {{ confirmedCount: number, perRiderShare: number, totalCost: number }}
 */
export function computeShares(estimatedCost, confirmedCount) {
  const total = Number(estimatedCost);
  // No confirmed riders yet -> no one owes anything.
  const perRiderShare = confirmedCount > 0
    ? Math.round((total / confirmedCount) * 100) / 100 // round to cents
    : 0;
  return { confirmedCount, perRiderShare, totalCost: total };
}

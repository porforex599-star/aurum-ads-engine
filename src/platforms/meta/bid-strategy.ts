/**
 * Resolve the bid_strategy for a lead-gen ad set.
 *
 * Meta requires bid_strategy to live at the same level as the budget. AURUM uses
 * ABO (Ad Set Budget Optimization) — each ad set carries its own daily_budget
 * (is_adset_budget_sharing_enabled: false) — so the strategy is set per ad set,
 * NOT on the campaign. Putting it on the campaign triggers Meta's "this campaign
 * has no budget" rejection.
 *
 * For OUTCOME_LEADS the correct default is LOWEST_COST_WITHOUT_CAP (auto-bid, no
 * cap, no bid_amount). Override via META_BID_STRATEGY only for cap/ROAS
 * strategies — those additionally require a bid_amount / bid_constraints that
 * this engine does not currently send.
 */
export function getBidStrategy(): string {
  return process.env.META_BID_STRATEGY ?? 'LOWEST_COST_WITHOUT_CAP';
}

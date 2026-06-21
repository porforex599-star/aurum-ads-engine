/**
 * Resolve the Advantage Audience flag for an ad set's targeting_automation.
 *
 * Meta requires an explicit advantage_audience (0 or 1) inside
 * targeting.targeting_automation on ad set create — it no longer picks a
 * default. 0 = strict targeting (Meta targets exactly the specified audience);
 * 1 = Meta's AI expands the audience beyond the spec to find similar users.
 *
 * AURUM defaults to 0 for the lead-gen launch (precise Thailand / age / interest
 * targeting until baseline data exists). Set META_ADVANTAGE_AUDIENCE=1 (or
 * 'true') to opt into AI audience expansion for scale.
 */
export function getAdvantageAudience(): 0 | 1 {
  const raw = process.env.META_ADVANTAGE_AUDIENCE;
  if (raw === '1' || raw === 'true') return 1;
  return 0; // default: strict targeting
}

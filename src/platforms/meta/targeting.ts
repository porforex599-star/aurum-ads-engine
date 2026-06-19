import { metaClient, MetaClient, randomId } from './client';

export interface ResolvedInterest {
  id: string;
  name: string;
}

/**
 * Resolve human-readable interest names into Meta targeting interest IDs.
 * GET /search?type=adinterest&q=<name>
 *
 * In mock mode this returns deterministic fake IDs. Unresolvable names are
 * skipped (logged by the client), never throwing the whole orchestration.
 */
export async function resolveInterests(
  names: string[],
  client: MetaClient = metaClient
): Promise<ResolvedInterest[]> {
  const resolved: ResolvedInterest[] = [];
  for (const name of names) {
    const data = await client.get<{ data?: { id: string; name: string }[] }>(
      '/search',
      { type: 'adinterest', q: name, limit: 1 },
      () => ({ data: [{ id: `mock_interest_${randomId()}`, name }] })
    );
    const hit = data.data?.[0];
    if (hit) resolved.push({ id: hit.id, name: hit.name });
  }
  return resolved;
}

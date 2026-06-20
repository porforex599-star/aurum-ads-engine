import { tiktokClient, TiktokClient } from './client';
import { mockTiktokAd, mockTiktokCreative, mockTiktokImage } from './mock';
import { TiktokOperationStatus } from './types';

/**
 * Upload an image to the advertiser's asset library by public URL.
 * POST /file/image/ad/upload/  →  returns a reusable image_id.
 */
export async function uploadTiktokImage(
  input: { advertiserId: string; imageUrl: string },
  client: TiktokClient = tiktokClient
): Promise<{ imageId: string }> {
  const data = await client.post<{ image_id: string }>(
    '/file/image/ad/upload/',
    {
      advertiser_id: input.advertiserId,
      upload_type: 'UPLOAD_BY_URL',
      image_url: input.imageUrl,
    },
    () => mockTiktokImage()
  );
  return { imageId: data.image_id };
}

export interface CreateTiktokAdInput {
  advertiserId: string;
  adGroupId: string;
  name: string;
  imageId: string;
  adText: string;
  callToAction?: string;
  status?: TiktokOperationStatus;
}

/**
 * Create a TikTok ad (which bundles its creative) under an ad group.
 * POST /ad/create/
 *
 * TikTok returns ad_ids and creative_ids arrays; we read the first of each.
 * In mock mode the creative id is synthesized so persistence has both ids.
 */
export async function createTiktokAd(
  input: CreateTiktokAdInput,
  client: TiktokClient = tiktokClient
): Promise<{ id: string; creativeId: string }> {
  const body = {
    advertiser_id: input.advertiserId,
    adgroup_id: input.adGroupId,
    creatives: [
      {
        ad_name: input.name,
        ad_format: 'SINGLE_IMAGE',
        image_ids: [input.imageId],
        ad_text: input.adText,
        call_to_action: input.callToAction ?? 'SIGN_UP',
      },
    ],
    operation_status: input.status ?? 'DISABLE',
  };

  const data = await client.post<{ ad_ids: string[]; creative_ids?: string[] }>(
    '/ad/create/',
    body,
    () => ({ ad_ids: [mockTiktokAd().ad_id], creative_ids: [mockTiktokCreative().creative_id] })
  );
  return {
    id: data.ad_ids?.[0],
    creativeId: data.creative_ids?.[0] ?? mockTiktokCreative().creative_id,
  };
}

/**
 * Delete a TikTok node by id (best-effort, used during orchestration rollback).
 * TikTok has no single generic delete, so the caller passes the right endpoint
 * (campaign/adgroup/ad). In mock mode this is a no-op.
 */
export async function deleteTiktokNode(
  endpoint: string,
  body: Record<string, unknown>,
  client: TiktokClient = tiktokClient
): Promise<void> {
  await client.post(endpoint, body, () => ({}));
}

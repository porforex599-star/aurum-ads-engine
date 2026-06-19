import { metaClient, MetaClient, randomId } from './client';
import { MetaIdResponse, MetaImageHashResponse, CallToActionType } from './types';

/** Upload an image by public URL; returns the image content hash. */
export async function uploadImage(
  input: { imageUrl: string },
  client: MetaClient = metaClient
): Promise<MetaImageHashResponse> {
  return client.uploadImageFromUrl(input.imageUrl);
}

export interface CreateAdCreativeInput {
  name: string;
  pageId: string;
  imageHash: string;
  primaryText: string;
  headline: string;
  description?: string;
  callToActionType: CallToActionType;
  leadgenFormId: string;
}

/**
 * Create an ad creative wired to a lead-gen form.
 * POST /{ad_account_id}/adcreatives
 *
 * Uses an object_story_spec with link_data whose lead_gen_form_id ties the
 * creative to the Instant Form, with a LEAD_GENERATION CTA.
 */
export async function createAdCreative(
  input: CreateAdCreativeInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const body = {
    name: input.name,
    object_story_spec: {
      page_id: input.pageId,
      link_data: {
        image_hash: input.imageHash,
        message: input.primaryText,
        name: input.headline,
        ...(input.description ? { description: input.description } : {}),
        link: `https://fb.me/`, // placeholder destination; lead form drives the action
        call_to_action: {
          type: input.callToActionType,
          value: { lead_gen_form_id: input.leadgenFormId },
        },
      },
    },
  };

  return client.post<MetaIdResponse>(`/${client.adAccountPath}/adcreatives`, body, () => ({
    id: `mock_creative_${randomId()}`,
  }));
}

import { tiktokClient, TiktokClient } from './client';
import { mockTiktokLeadForm } from './mock';

export interface TiktokLeadFormQuestion {
  type: 'NAME' | 'PHONE' | 'EMAIL' | 'CUSTOM';
  label?: string;
  options?: string[];
}

export interface CreateTiktokLeadFormInput {
  advertiserId: string;
  title: string;
  description: string;
  privacyPolicyUrl: string;
  questions: TiktokLeadFormQuestion[];
  successTitle: string;
  successDescription: string;
  buttonText: string;
  buttonUrl: string;
}

/**
 * Create a TikTok Lead Generation "Instant Form" (TikTok's equivalent of
 * Meta's Instant Form). The returned id is persisted as tiktok_leadgen_form_id.
 * POST /page/leadgen/create/
 */
export async function createTiktokLeadForm(
  input: CreateTiktokLeadFormInput,
  client: TiktokClient = tiktokClient
): Promise<{ id: string }> {
  const body = {
    advertiser_id: input.advertiserId,
    title: input.title,
    description: input.description,
    privacy_policy_url: input.privacyPolicyUrl,
    questions: input.questions.map((q) =>
      q.type === 'CUSTOM'
        ? { question_type: 'CUSTOM', title: q.label, options: q.options ?? [] }
        : { question_type: q.type }
    ),
    success_page: {
      title: input.successTitle,
      description: input.successDescription,
      button_text: input.buttonText,
      button_url: input.buttonUrl,
    },
  };

  const data = await client.post<{ page_id: string }>('/page/leadgen/create/', body, () =>
    mockTiktokLeadForm()
  );
  return { id: data.page_id };
}

import { metaClient, MetaClient, randomId } from './client';
import { MetaIdResponse } from './types';

export interface LeadGenQuestion {
  type: 'FULL_NAME' | 'PHONE' | 'EMAIL' | 'CUSTOM';
  key?: string;
  label?: string;
  options?: { value: string; key: string }[];
}

export interface CreateLeadGenFormInput {
  name: string;
  pageId: string;
  intro: { headline: string; description: string };
  questions: LeadGenQuestion[];
  privacyPolicy: { url: string; linkText: string };
  thankYouPage: {
    title: string;
    body: string;
    buttonText: string;
    buttonUrl: string;
  };
  locale?: string;
}

/**
 * Create an instant lead-gen (Instant Form) on a Page.
 * POST /{page_id}/leadgen_forms
 *
 * The Graph API expects several fields JSON-encoded as strings
 * (questions, context_card, thank_you_page, privacy_policy).
 */
export async function createLeadGenForm(
  input: CreateLeadGenFormInput,
  client: MetaClient = metaClient
): Promise<MetaIdResponse> {
  const questions = input.questions.map((q) =>
    q.type === 'CUSTOM'
      ? { type: 'CUSTOM', key: q.key, label: q.label, options: q.options }
      : { type: q.type }
  );

  const body = {
    name: input.name,
    locale: input.locale ?? 'th_TH',
    questions: JSON.stringify(questions),
    context_card: JSON.stringify({
      title: input.intro.headline,
      content: [input.intro.description],
      style: 'PARAGRAPH_STYLE',
    }),
    privacy_policy: JSON.stringify({
      url: input.privacyPolicy.url,
      link_text: input.privacyPolicy.linkText,
    }),
    thank_you_page: JSON.stringify({
      title: input.thankYouPage.title,
      body: input.thankYouPage.body,
      button_type: 'VIEW_WEBSITE',
      button_text: input.thankYouPage.buttonText,
      website_url: input.thankYouPage.buttonUrl,
    }),
  };

  return client.post<MetaIdResponse>(`/${input.pageId}/leadgen_forms`, body, () => ({
    id: `mock_form_${randomId()}`,
  }));
}

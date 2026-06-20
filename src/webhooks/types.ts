// Phase 1 · PR-1 · Lead capture webhook types (Meta + TikTok)

/** Source platform a webhook lead arrived from. */
export type LeadPlatform = 'meta' | 'tiktok';

/**
 * Platform-agnostic lead shape. Both Meta (after a Graph API fetch) and TikTok
 * (inline payload) collapse into this before persistence + notification.
 */
export type NormalizedLead = {
  platform: LeadPlatform;
  platformLeadId: string; // leadgen_id (Meta) | lead_id (TikTok)
  platformAdId: string;
  platformCampaignId: string;
  platformFormId: string;

  // Extracted contact info
  email?: string;
  phone?: string;
  displayName?: string;

  // Source attribution
  utm: {
    source: string;
    medium: string;
    campaign: string;
  };

  // Raw payload for audit / debugging
  rawPayload: unknown;
  receivedAt: Date;
};

// ---- Meta webhook (POST /meta-leads) ------------------------------------

export type MetaLeadChangeValue = {
  ad_id?: string;
  form_id?: string;
  leadgen_id?: string;
  created_time?: number;
  page_id?: string;
};

export type MetaWebhookChange = {
  field?: string;
  value?: MetaLeadChangeValue;
};

export type MetaWebhookEntry = {
  id?: string;
  time?: number;
  changes?: MetaWebhookChange[];
};

export type MetaWebhookBody = {
  object?: string;
  entry?: MetaWebhookEntry[];
};

/** Shape returned by GET graph.facebook.com/{leadgen_id}. */
export type MetaLeadDetail = {
  id?: string;
  created_time?: string;
  ad_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
};

// ---- TikTok webhook (POST /tiktok-leads) --------------------------------

export type TiktokFieldDatum = { field_name?: string; value?: string };

export type TiktokWebhookBody = {
  event_type?: string;
  client_id?: string;
  timestamp?: number;
  data?: {
    lead_id?: string;
    advertiser_id?: string;
    campaign_id?: string;
    adgroup_id?: string;
    ad_id?: string;
    form_id?: string;
    field_data?: TiktokFieldDatum[];
  };
};

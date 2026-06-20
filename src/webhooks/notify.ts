// Phase 1 · PR-1 · New-lead notification dispatch.
//
// Three independent channels (Telegram, Email via Resend, LINE OA push), fired
// in parallel and fire-and-forget: a channel failure never throws and never
// blocks the webhook 200 response. Each channel silently skips when its env
// vars are absent.

import { logger } from '../lib/logger';
import { errMessage } from './util';
import { NormalizedLead } from './types';

const ADMIN_LEAD_URL = 'https://aurum-admin-eight.vercel.app/leads';

/** Readiness flags for the /health endpoint (presence of channel credentials). */
export function getNotificationReadiness(): {
  telegram: boolean;
  email: boolean;
  lineOA: boolean;
} {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID),
    email: Boolean(process.env.RESEND_API_KEY),
    lineOA: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_ADMIN_USER_ID),
  };
}

const platformEmoji = (platform: NormalizedLead['platform']): string =>
  platform === 'meta' ? '📘' : '🎵';

async function notifyTelegram(lead: NormalizedLead, dbLeadId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const text = [
    `${platformEmoji(lead.platform)} *New Lead!*`,
    ``,
    `*Name:* ${lead.displayName || '-'}`,
    `*Email:* ${lead.email || '-'}`,
    `*Phone:* ${lead.phone || '-'}`,
    ``,
    `*Source:* ${lead.platform.toUpperCase()} · Campaign ${lead.platformCampaignId || '-'}`,
    `*Lead ID:* \`${dbLeadId}\``,
    ``,
    `View in admin: ${ADMIN_LEAD_URL}/${dbLeadId}`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage failed (${res.status})`);
  }
}

async function notifyEmail(lead: NormalizedLead, dbLeadId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'leads@aurumlive.com';
  const toEmail = process.env.LEAD_NOTIFICATION_EMAIL || 'porforex599@gmail.com';
  if (!apiKey) return;

  const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FFD369;">🎯 New Lead Captured</h2>
          <table>
            <tr><td><b>Name:</b></td><td>${lead.displayName || '-'}</td></tr>
            <tr><td><b>Email:</b></td><td>${lead.email || '-'}</td></tr>
            <tr><td><b>Phone:</b></td><td>${lead.phone || '-'}</td></tr>
            <tr><td><b>Platform:</b></td><td>${lead.platform.toUpperCase()}</td></tr>
            <tr><td><b>Campaign:</b></td><td>${lead.platformCampaignId || '-'}</td></tr>
          </table>
          <a href="${ADMIN_LEAD_URL}/${dbLeadId}"
             style="background:#FFD369;color:#000;padding:10px 20px;text-decoration:none;border-radius:6px;">
            View Lead in Admin
          </a>
        </div>
      `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: `🎯 New AURUM Lead · ${lead.displayName || lead.email || 'Unknown'} · ${lead.platform.toUpperCase()}`,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend email failed (${res.status})`);
  }
}

async function notifyLineOA(lead: NormalizedLead, dbLeadId: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const adminLineUserId = process.env.LINE_ADMIN_USER_ID;
  if (!token || !adminLineUserId) return;

  const text = [
    `${platformEmoji(lead.platform)} New Lead!`,
    `Name: ${lead.displayName || '-'}`,
    `Email: ${lead.email || '-'}`,
    `Phone: ${lead.phone || '-'}`,
    `Source: ${lead.platform.toUpperCase()}`,
    `${ADMIN_LEAD_URL}/${dbLeadId}`,
  ].join('\n');

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: adminLineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed (${res.status})`);
  }
}

/**
 * Fire all notification channels in parallel. Skips entirely for duplicate
 * leads. Never throws — individual channel failures are logged via allSettled.
 */
export async function notifyNewLead(
  lead: NormalizedLead,
  dbLeadId: string,
  isNew: boolean
): Promise<void> {
  if (!isNew) return;

  const results = await Promise.allSettled([
    notifyTelegram(lead, dbLeadId),
    notifyEmail(lead, dbLeadId),
    notifyLineOA(lead, dbLeadId),
  ]);

  const channels = ['telegram', 'email', 'lineOA'] as const;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error('webhook.notify.channel_failed', {
        channel: channels[i],
        leadId: dbLeadId,
        message: errMessage(result.reason),
      });
    }
  });
}

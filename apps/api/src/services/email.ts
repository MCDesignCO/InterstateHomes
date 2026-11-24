import { isDatabaseConfigured, isDemoMode } from '../db/client.js';
import { getDb } from '../db/client.js';
import { emailLogs } from '../db/schema/index.js';

export interface OutboundEmailInput {
  to: string;
  subject: string;
  templateName: string;
  html: string;
  triggeredByUserId: string; // Required per Rule 13: nothing emailed without user action
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendAndLogEmail(input: OutboundEmailInput): Promise<{ messageId: string }> {
  const from = process.env.EMAIL_FROM ?? 'estimating@interstatehomes.com';
  const provider = process.env.EMAIL_PROVIDER ?? 'console';
  let providerMessageId = `local-${Date.now()}`;

  if (provider === 'resend' && process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend delivery failed (${res.status})`);
    }
    const json = (await res.json()) as { id?: string };
    providerMessageId = json.id ?? providerMessageId;
  }

  if (!isDemoMode() && isDatabaseConfigured()) {
    const db = getDb();
    await db.insert(emailLogs).values({
      recipientEmail: input.to,
      subject: input.subject,
      templateName: input.templateName,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      triggeredByUserId: input.triggeredByUserId,
      status: 'sent',
      providerMessageId,
    });
  }

  return { messageId: providerMessageId };
}

/**
 * P4.19 — License issuing pipeline.
 *
 * Takes a Stripe checkout event, picks the right SKU, mints an
 * Ed25519-signed license, and hands it off to the Mailer to deliver
 * to the buyer.
 *
 * Mailer is an interface so dev/test can use a `MemoryMailer` and
 * production wires whatever provider (Postmark/SES/Resend) at the
 * boundary.
 */
import { randomUUID } from 'node:crypto';
import { signLicense } from './sign.js';
import type { LicensePayload, LicenseSku } from './schema.js';

export interface Mailer {
  send(opts: { to: string; subject: string; text: string }): Promise<{ messageId: string }>;
}

export class MemoryMailer implements Mailer {
  readonly outbox: { to: string; subject: string; text: string; messageId: string }[] = [];
  async send(opts: { to: string; subject: string; text: string }): Promise<{ messageId: string }> {
    const messageId = `mem-${randomUUID()}`;
    this.outbox.push({ ...opts, messageId });
    return { messageId };
  }
}

const SKU_PERIOD_MS: Record<LicenseSku, number> = {
  basic: 365 * 24 * 60 * 60 * 1000, // 1 year support
  pro: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years support
  subscription: 30 * 24 * 60 * 60 * 1000, // 1 billing period
};

export interface IssuerOptions {
  privateKeyPem: string;
  mailer: Mailer;
  now?: () => number;
}

export interface IssueInput {
  email: string;
  sku: LicenseSku;
  /** Optional pre-bound install id (for direct activations). */
  installId?: string;
}

export interface IssueResult {
  payload: LicensePayload;
  licenseString: string;
  messageId: string;
}

export class LicenseIssuer {
  constructor(private readonly opts: IssuerOptions) {}

  async issue(input: IssueInput): Promise<IssueResult> {
    const now = (this.opts.now ?? Date.now)();
    const payload: LicensePayload = {
      id: randomUUID(),
      email: input.email,
      sku: input.sku,
      issuedAt: now,
      expiresAt: now + SKU_PERIOD_MS[input.sku],
      installId: input.installId,
    };
    const licenseString = signLicense(payload, this.opts.privateKeyPem);
    const { messageId } = await this.opts.mailer.send({
      to: input.email,
      subject: `Your DirectorAI ${input.sku} license`,
      text: licenseEmailBody(input.sku, licenseString),
    });
    return { payload, licenseString, messageId };
  }
}

function licenseEmailBody(sku: LicenseSku, licenseString: string): string {
  return [
    `Thanks for your DirectorAI ${sku} purchase.`,
    '',
    'Paste this key into the panel (Settings → License):',
    '',
    licenseString,
    '',
    'Need help? support@directorai.app',
  ].join('\n');
}

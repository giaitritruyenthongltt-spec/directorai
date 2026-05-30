/**
 * P4.13 — Telemetry RPC.
 *
 *   telemetry.consent.get               → ConsentRecord
 *   telemetry.consent.set { value }     → ConsentRecord (next state)
 *   telemetry.delete                    → { ok: true } (sink wiped + record marked)
 *   telemetry.status                    → { enabled, eventCount }
 *
 * The panel uses `telemetry.consent.get` on first connect to decide
 * whether to show the opt-in modal. `telemetry.delete` is the GDPR
 * right-to-erasure endpoint — it clears the sink and resets consent
 * to false in one transaction.
 */
import { z } from 'zod';
import type { Logger } from '@directorai/shared';
import { ConsentStore, type TelemetryClient, type InMemorySink } from '@directorai/telemetry';

export interface TelemetryRouterOptions {
  logger: Logger;
  client: TelemetryClient;
  sink: InMemorySink;
  consent?: ConsentStore;
}

const SetParams = z.object({ value: z.boolean() });
const EmptyParams = z.object({}).optional();

export interface TelemetryRouter {
  listMethods(): readonly string[];
  dispatch(method: string, params: unknown): Promise<unknown>;
}

export function createTelemetryRouter(opts: TelemetryRouterOptions): TelemetryRouter {
  const consent = opts.consent ?? new ConsentStore();

  const handlers: Record<string, (p: unknown) => Promise<unknown>> = {
    'telemetry.consent.get': async (p) => {
      EmptyParams.parse(p ?? {});
      return consent.read();
    },
    'telemetry.consent.set': async (p) => {
      const { value } = SetParams.parse(p ?? {});
      return consent.setConsent(value);
    },
    'telemetry.delete': async (p) => {
      EmptyParams.parse(p ?? {});
      await opts.client.deleteAll();
      await consent.requestDeletion();
      opts.logger.info({}, 'Telemetry deletion completed (GDPR)');
      return { ok: true };
    },
    'telemetry.status': async (p) => {
      EmptyParams.parse(p ?? {});
      const rec = await consent.read();
      return {
        enabled: rec.consented === true,
        installId: rec.installId,
        eventCount: opts.sink.size,
      };
    },
  };

  return {
    listMethods: () => Object.keys(handlers),
    dispatch: async (method, params) => {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown telemetry method: ${method}`);
      opts.logger.debug?.({ method }, 'telemetry RPC');
      return fn(params);
    },
  };
}

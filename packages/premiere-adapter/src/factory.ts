import { MockPremiereAdapter } from './mock.js';
import { UXPPremiereAdapter } from './uxp.js';
import type { IPremiereAdapter } from './types.js';

export interface CreateAdapterOptions {
  kind?: 'mock' | 'uxp' | 'auto';
}

export function createPremiereAdapter(options: CreateAdapterOptions = {}): IPremiereAdapter {
  const kind = options.kind ?? 'auto';

  if (kind === 'mock') return new MockPremiereAdapter();
  if (kind === 'uxp') return new UXPPremiereAdapter();

  const isUXP = typeof (globalThis as { require?: unknown }).require === 'function';
  if (isUXP) {
    try {
      return new UXPPremiereAdapter();
    } catch {
      return new MockPremiereAdapter();
    }
  }
  return new MockPremiereAdapter();
}

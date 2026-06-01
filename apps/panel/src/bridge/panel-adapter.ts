/**
 * Picks the right IPremiereAdapter for the panel runtime:
 * - Inside UXP (premierepro module available) → UXPPremiereAdapter
 * - Otherwise (browser dev, tests) → MockPremiereAdapter
 *
 * This is what the panel uses to actually execute incoming RPC requests
 * from the Node server.
 */

import { createPremiereAdapter, type IPremiereAdapter } from '@directorai/premiere-adapter';

let cached: IPremiereAdapter | null = null;

export function getPanelAdapter(): IPremiereAdapter {
  if (!cached) {
    cached = createPremiereAdapter({ kind: 'auto' });
  }
  return cached;
}

export function adapterKind(): 'mock' | 'uxp' | 'davinci' {
  return getPanelAdapter().kind;
}

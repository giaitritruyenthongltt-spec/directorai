#!/usr/bin/env node
/**
 * P4.21 entry point. Reads PORTAL_PORT + DIRECTORAI_LICENSE_PUBLIC_KEY
 * from env. Designed for `node dist/index.js` once apps/portal is
 * built.
 */
import { startPortal } from './server.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORTAL_PORT ?? '7780');
  const publicKeyPem = process.env.DIRECTORAI_LICENSE_PUBLIC_KEY ?? '';
  if (!publicKeyPem) {
    console.error('DIRECTORAI_LICENSE_PUBLIC_KEY not set — portal cannot start');
    process.exit(1);
  }
  const portal = await startPortal({ port, publicKeyPem });
  console.log(`Portal up on http://127.0.0.1:${portal.port}`);
}

void main();

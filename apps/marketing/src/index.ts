#!/usr/bin/env node
/**
 * P4.39 entry point.
 *
 *   MARKETING_PORT   default 7800
 */
import { startMarketing } from './server.js';

async function main(): Promise<void> {
  const port = Number(process.env.MARKETING_PORT ?? '7800');
  const app = await startMarketing({ port });
  console.info(`Marketing up on http://127.0.0.1:${app.port}`);
}

void main();

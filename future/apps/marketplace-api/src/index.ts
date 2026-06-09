#!/usr/bin/env node
import { startMarketplaceApi } from './server.js';

async function main(): Promise<void> {
  const port = Number(process.env.MARKETPLACE_PORT ?? '7820');
  const adminToken = process.env.MARKETPLACE_ADMIN_TOKEN ?? '';
  const app = await startMarketplaceApi({ port, adminToken });
  console.info(`Marketplace API up on http://127.0.0.1:${app.port}`);
}

void main();

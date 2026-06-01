/**
 * V0 (Sprint Verification) — generate the Ed25519 license keypair.
 *
 * Writes to `.secrets/` (gitignored). Prints the public key so the
 * user can paste it into the panel build env or
 * `DIRECTORAI_LICENSE_PUBLIC_KEY` in `.env`. Never prints the
 * private key — that one stays on disk.
 *
 * Run:  pnpm tsx tools/generate-license-keys.ts
 * Force regen:  pnpm tsx tools/generate-license-keys.ts --force
 *
 * The public key is the one bundled inside the panel CCX so every
 * client can verify signatures offline. The private key lives only
 * on the Stripe webhook handler box.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLicenseKeypair } from '../packages/license/src/sign.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SECRETS_DIR = path.join(ROOT, '.secrets');
const PRIVATE_PATH = path.join(SECRETS_DIR, 'license-private.pem');
const PUBLIC_PATH = path.join(SECRETS_DIR, 'license-public.pem');

async function existsBoth(): Promise<boolean> {
  try {
    await fs.access(PRIVATE_PATH);
    await fs.access(PUBLIC_PATH);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  if (!force && (await existsBoth())) {
    const pub = await fs.readFile(PUBLIC_PATH, 'utf8');
    console.info('Keypair already exists at .secrets/ — passing through public key.');
    console.info('Re-run with --force to regenerate (will invalidate all existing licenses).\n');
    console.info(pub);
    return;
  }

  console.info('Generating Ed25519 license keypair…');
  const { privateKey, publicKey } = generateLicenseKeypair();

  await fs.mkdir(SECRETS_DIR, { recursive: true });
  await fs.writeFile(PRIVATE_PATH, privateKey, { encoding: 'utf8', mode: 0o600 });
  await fs.writeFile(PUBLIC_PATH, publicKey, { encoding: 'utf8', mode: 0o644 });

  console.info(`✔ private key → ${path.relative(ROOT, PRIVATE_PATH)} (mode 0600)`);
  console.info(`✔ public key  → ${path.relative(ROOT, PUBLIC_PATH)}`);
  console.info('');
  console.info('Next steps:');
  console.info('  1. Copy the public key (below) into your panel build env:');
  console.info('       DIRECTORAI_LICENSE_PUBLIC_KEY="$(cat .secrets/license-public.pem)"');
  console.info('  2. Copy the private key into your Stripe webhook server env');
  console.info('     (production secrets manager — never check it in).');
  console.info('  3. Add .secrets/ to .gitignore (already done).');
  console.info('  4. Back up the private key somewhere safe — losing it means');
  console.info('     you cannot issue new licenses + must regenerate (invalidates all old).');
  console.info('');
  console.info('--- PUBLIC KEY ---');
  console.info(publicKey);
}

void main().catch((err) => {
  console.error('Keypair generation failed:', err);
  process.exit(1);
});

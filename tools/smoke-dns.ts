/**
 * V6 smoke test — verify the 7 directorai.app subdomains resolve + serve.
 *
 *   pnpm smoke:dns
 *   pnpm smoke:dns --domain=example.com   # override
 *
 * What it does:
 *   - Resolves DNS for each subdomain (A/AAAA).
 *   - HEAD requests each + checks the /healthz where applicable.
 *   - Prints a table of resolved-vs-not.
 *
 * Does NOT certify TLS validity — we trust the platform (Cloudflare /
 * AWS / Fly) to manage that. The check is "does this hostname answer".
 */
import { promises as dns } from 'node:dns';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';

interface Sub {
  host: string;
  path: string;
  expect: number;
  hint: string;
}

const domainArg = process.argv.find((a) => a.startsWith('--domain='));
const DOMAIN = domainArg ? domainArg.slice('--domain='.length) : 'directorai.app';

const subs: Sub[] = [
  { host: DOMAIN, path: '/', expect: 200, hint: 'marketing site (apps/marketing)' },
  { host: `docs.${DOMAIN}`, path: '/', expect: 200, hint: 'docs site (apps/docs-site)' },
  {
    host: `beta.${DOMAIN}`,
    path: '/healthz',
    expect: 200,
    hint: 'landing waitlist (apps/landing)',
  },
  { host: `portal.${DOMAIN}`, path: '/', expect: 200, hint: 'license portal (apps/portal)' },
  {
    host: `api.${DOMAIN}`,
    path: '/healthz',
    expect: 200,
    hint: 'API gateway (apps/server + marketplace-api)',
  },
  {
    host: `updates.${DOMAIN}`,
    path: '/win/stable.json',
    expect: 200,
    hint: 'auto-updater feed',
  },
  {
    host: `samples.${DOMAIN}`,
    path: '/hello-vlog.zip',
    expect: 200,
    hint: 'sample project download',
  },
];

interface Result {
  host: string;
  resolved: boolean;
  status: number | null;
  detail: string;
}

async function probe(s: Sub): Promise<Result> {
  // DNS
  try {
    const addrs = await dns.lookup(s.host, { all: true });
    if (addrs.length === 0) {
      return { host: s.host, resolved: false, status: null, detail: 'no A/AAAA record' };
    }
  } catch (err) {
    return {
      host: s.host,
      resolved: false,
      status: null,
      detail: err instanceof Error ? err.message : 'lookup failed',
    };
  }

  // HEAD
  return new Promise((resolve) => {
    const lib = s.host.startsWith('local') ? httpRequest : request;
    const req = lib(
      {
        host: s.host,
        path: s.path,
        method: 'HEAD',
        timeout: 5_000,
      },
      (res) => {
        resolve({
          host: s.host,
          resolved: true,
          status: res.statusCode ?? 0,
          detail: `HTTP ${res.statusCode}`,
        });
      }
    );
    req.on('error', (err) =>
      resolve({ host: s.host, resolved: true, status: null, detail: err.message })
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ host: s.host, resolved: true, status: null, detail: 'timeout' });
    });
    req.end();
  });
}

async function main(): Promise<void> {
  console.info(`Probing ${subs.length} subdomain(s) of ${DOMAIN} …\n`);
  const results = await Promise.all(subs.map(probe));

  console.info('| Subdomain | DNS | HTTP | Hint |');
  console.info('| --- | :-: | :-: | --- |');
  let fails = 0;
  for (const r of results) {
    const hint = subs.find((s) => s.host === r.host)!.hint;
    const dnsMark = r.resolved ? '✅' : '❌';
    const httpMark = r.status === 200 ? '✅' : '⚠️';
    if (!r.resolved || r.status !== 200) fails++;
    console.info(`| ${r.host} | ${dnsMark} | ${httpMark} ${r.detail} | ${hint} |`);
  }

  console.info('');
  if (fails === 0) {
    console.info('✅ PASS — all subdomains resolve + return 200.');
  } else {
    console.info(
      `⚠️ ${fails}/${subs.length} subdomain(s) not live yet. Set up DNS + deploy each app per docs/guides/sprint-verification.md V6.`
    );
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error('crashed:', err);
  process.exit(1);
});

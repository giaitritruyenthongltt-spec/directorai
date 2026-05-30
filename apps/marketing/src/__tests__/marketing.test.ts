/**
 * P4.39 — marketing site smoke tests.
 *
 * Boots on a random port, asserts each route returns 200 with the
 * expected content type + key phrase.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startMarketing, type RunningMarketing } from '../server.js';

function fetchPath(
  port: number,
  path: string
): Promise<{ status: number; body: string; ct: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          ct: res.headers['content-type'] ?? '',
        })
      );
    });
    req.on('error', reject);
    req.end();
  });
}

describe('marketing P4.39', () => {
  let app: RunningMarketing;

  beforeAll(async () => {
    app = await startMarketing({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns the home page', async () => {
    const res = await fetchPath(app.port, '/');
    expect(res.status).toBe(200);
    expect(res.ct).toContain('text/html');
    expect(res.body).toContain('DirectorAI');
    expect(res.body).toContain('Edit at the speed of thought');
  });

  it('every documented route returns 200', async () => {
    for (const path of ['/', '/how', '/pricing', '/faq', '/changelog', '/press']) {
      const res = await fetchPath(app.port, path);
      expect(res.status, `path ${path}`).toBe(200);
      expect(res.ct).toContain('text/html');
    }
  });

  it('strips a trailing slash for non-root paths', async () => {
    const res = await fetchPath(app.port, '/pricing/');
    expect(res.status).toBe(200);
  });

  it('serves sitemap.xml with all routes', async () => {
    const res = await fetchPath(app.port, '/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.ct).toContain('application/xml');
    for (const path of ['/how', '/pricing', '/faq', '/changelog', '/press']) {
      expect(res.body, `sitemap missing ${path}`).toContain(`https://directorai.app${path}`);
    }
  });

  it('serves robots.txt with sitemap reference', async () => {
    const res = await fetchPath(app.port, '/robots.txt');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Sitemap: https://directorai.app/sitemap.xml');
  });

  it('serves RSS at /changelog/rss', async () => {
    const res = await fetchPath(app.port, '/changelog/rss');
    expect(res.status).toBe(200);
    expect(res.ct).toContain('rss');
    expect(res.body).toContain('v1.0.0');
  });

  it('healthz returns ok', async () => {
    const res = await fetchPath(app.port, '/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toBe('ok');
  });

  it('unknown route returns 404 with branded body', async () => {
    const res = await fetchPath(app.port, '/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toContain('404');
  });

  it('POST is rejected with 405', async () => {
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: app.port, path: '/', method: 'POST' },
        (r) => resolve({ status: r.statusCode ?? 0 })
      );
      req.on('error', reject);
      req.end();
    });
    expect(res.status).toBe(405);
  });
});

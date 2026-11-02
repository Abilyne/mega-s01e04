import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(lines: string[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

function event(at: string, job: string, status: string, owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

describe('digest routes', () => {
  it('serves the same sorted rows as HTML and JSON, including warning and display details', async () => {
    writeNight([
      event('2026-10-29T01:30:00+01:00', 'retry-3', 'retry', 'rook', 'upstream 503'),
      event('2026-10-29T01:31:00+01:00', 'retry-3', 'retry', 'rook'),
      event('2026-10-29T01:32:00+01:00', 'retry-3', 'retry', 'rook'),
      event('2026-10-29T01:33:00+01:00', 'retry-3', 'ok', 'rook'),
      event('2026-10-29T01:34:00+01:00', 'failed', 'fail', 'sam', 'disk full'),
      event('2026-10-29T01:35:00+01:00', 'failed', 'ok', 'sam'),
      event('2026-10-29T02:00:00+03:00', '<script>alert(1)</script>', 'ok', null),
    ]);

    const app = createApp(config(runsDir));
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);
    const html = await htmlResponse.text();
    const rows = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((row: { job: string }) => row.job)).toEqual([
      '<script>alert(1)</script>', 'failed', 'retry-3',
    ]);
    const scriptJobIndex = html.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(scriptJobIndex).toBeGreaterThan(-1);
    expect(scriptJobIndex).toBeLessThan(html.indexOf('failed'));
    expect(html.indexOf('failed')).toBeLessThan(html.indexOf('retry-3'));
    expect(html).toContain('>—</td>');
    expect(html).toContain('<tr class="warn"><td>failed</td>');
    expect(html).toContain('<tr class="warn"><td>retry-3</td>');
    expect(html).toContain('dateTime="2026-10-29T02:00:00+03:00"');
    expect(rows).toMatchObject([
      { job: '<script>alert(1)</script>', owner: null, firstAt: '2026-10-29T02:00:00+03:00' },
      { job: 'failed', hasFailure: true },
      { job: 'retry-3', retries: 3, lastStatus: 'ok' },
    ]);
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const app = createApp(config(runsDir));

    expect((await app.request(`/digest/${night}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns an empty JSON array', async () => {
    writeNight([]);
    const app = createApp(config(runsDir));
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual([]);
  });

  it('counts and skips malformed lines while both routes still succeed', async () => {
    writeNight([
      'not json',
      event('2026-10-29T01:30:00+01:00', 'good-job', 'ok', 'rook'),
      JSON.stringify({ at: 'not a timestamp', job: 'invalid', status: 'fail', owner: null }),
    ]);
    const app = createApp(config(runsDir));
    const htmlResponse = await app.request(`/digest/${night}`);
    const jsonResponse = await app.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('malformed lines: 2');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toMatchObject([{ job: 'good-job', runs: 1 }]);
  });
});

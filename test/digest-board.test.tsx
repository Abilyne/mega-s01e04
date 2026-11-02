import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import { readStatus } from '../src/status.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest links on the status board', () => {
  it('links each on-disk night and shows counts of jobs by last status', async () => {
    const runsDir = makeRunsDir();
    const config: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
    const at = '2026-10-28T05:00:00Z';
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      JSON.stringify({ at, job: 'alpha', status: 'retry', owner: 'ops' }),
      JSON.stringify({ at, job: 'alpha', status: 'ok', owner: 'ops' }),
      JSON.stringify({ at, job: 'beta', status: 'fail', owner: null }),
      JSON.stringify({ at, job: 'gamma', status: 'retry', owner: 'ops' }),
    ].join('\n') + '\n');
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');

    const status = readStatus(config);
    const app = createApp(config);
    const response = await app.request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(status.nights).toEqual(['2026-10-28', '2026-10-27']);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('jobs: 1 ok / 1 retry / 1 fail');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('jobs: 0 ok / 0 retry / 0 fail');

    for (const night of status.nights) {
      const digestResponse = await app.request(`/digest/${night}`);
      expect(digestResponse.status).toBe(200);
      expect(await digestResponse.text()).toContain(`digest · ${night}`);
    }
  });
});

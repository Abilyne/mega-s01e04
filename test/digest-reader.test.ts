import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const event = {
  at: '2026-10-28T23:00:00+01:00',
  job: 'job',
  status: 'ok',
  owner: 'rook',
};
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n'));
}

describe('run log reader', () => {
  it('reads the real night without modifying it: five jobs and one bad line', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503', hasFailure: false,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows.find((row) => row.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1 });
    expect(digest?.rows.find((row) => row.job === 'digest/render')).toMatchObject({ owner: null });
    expect(digest?.rows.find((row) => row.job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail', hasFailure: true, lastError: 'quota exceeded',
    });
  });

  it('distinguishes an absent night from an empty file', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeEvents([]);
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed JSON and invalid records while continuing to read', () => {
    writeEvents([
      null, [], 42, {}, { ...event, status: 'unknown' }, { ...event, owner: 42 },
      { ...event, owner: undefined }, { ...event, at: 'not a timestamp' },
      { ...event, job: '' }, { ...event, error: false }, { ...event, at: '2026-10-28' },
    ]);
    writeFileSync(join(runsDir, `${night}.jsonl`), `\nbroken\n${JSON.stringify(event)}\n\n`, { flag: 'a' });
    const digest = readNight(runsDir, night);
    expect(digest?.badLines).toBe(13);
    expect(digest?.rows).toHaveLength(1);
  });

  it('handles CRLF and a trailing newline without inventing a bad line', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `${JSON.stringify(event)}\r\n`);
    expect(readNight(runsDir, night)?.badLines).toBe(0);
  });

  it('uses chronological order across offsets and retains original timestamp strings', () => {
    const firstAt = '2026-10-29T02:00:00+03:00';
    const lastAt = '2026-10-29T01:00:00+01:00';
    writeEvents([
      { ...event, at: lastAt, owner: null },
      { ...event, at: firstAt, status: 'fail', error: 'failed' },
      { ...event, at: '2026-10-29T00:30:00+01:00', status: 'retry', error: 'retrying' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
      lastError: 'retrying', firstAt, lastAt, hasFailure: true,
    }]);
  });

  it('keeps log order for tied times and sorts jobs independently of locale', () => {
    writeEvents([
      { ...event, job: 'z' }, { ...event, job: 'A' },
      { ...event, job: 'z', status: 'retry', owner: null },
      { ...event, job: '__proto__' },
    ]);
    const digest = readNight(runsDir, night);
    expect(digest?.rows.map((row) => row.job)).toEqual(['A', '__proto__', 'z']);
    expect(digest?.rows[2]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'retry', owner: null });
  });

  it('rejects names that could escape the runs directory', () => {
    expect(readNight(runsDir, '../2026-10-28')).toBeNull();
    expect(readNight(runsDir, '/2026-10-28')).toBeNull();
  });

  it('does not disguise filesystem errors as a missing night', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});

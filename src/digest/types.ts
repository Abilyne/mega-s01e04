export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
  hasFailure: boolean;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
};

// Missing nights return null; empty files return { rows: [], badLines: 0 }.
// Rows sort by job. Times retain their original offsets; first/last are chronological.
// Owner/status come from the last event; lastError retains the latest supplied error.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

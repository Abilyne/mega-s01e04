import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { Layout } from '../views/layout.js';
import { DigestPage } from '../views/digest.js';
import { readNight } from './reader.js';

export function registerDigestHtml(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);

    if (digest === null) {
      return c.html(
        <Layout title="not found" lane={lane()}>
          <h1>night not found</h1>
          <p>{night}</p>
        </Layout>,
        404,
      );
    }

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });
}

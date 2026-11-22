import * as fs from 'fs';
import * as path from 'path';
import { filterOpenApiByFeatures } from './openapi-filter';
import { DocsController } from './docs.controller';
import { DocsSpecStore } from './docs-spec.store';
import type { ApiKey } from '../auth/entities/api-key.entity';

const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../openapi.json'), 'utf8')) as {
  paths: Record<string, unknown>;
};
const has = (s: { paths: Record<string, unknown> }, p: string) => Object.keys(s.paths).some(x => x.startsWith(p));

describe('filterOpenApiByFeatures', () => {
  it('leaves an unrestricted key (null) with every endpoint', () => {
    expect(filterOpenApiByFeatures(spec, null)).toBe(spec);
  });

  it('keeps only the approved features plus sessions/messaging, hiding the rest', () => {
    const out = filterOpenApiByFeatures(spec, ['library', 'workflows']);
    expect(has(out, '/api/library')).toBe(true);
    expect(has(out, '/api/workflows')).toBe(true);
    expect(has(out, '/api/sessions/{sessionId}/messages')).toBe(true); // sessions/messaging
    expect(has(out, '/api/deals')).toBe(false);
    expect(has(out, '/api/campaigns')).toBe(false);
    expect(has(out, '/api/provisioning')).toBe(false); // admin surface
    expect(has(out, '/api/sessions/{sessionId}/webhooks')).toBe(false); // webhooks feature nested under sessions
  });

  it('an empty approved list leaves sessions/messaging only', () => {
    const out = filterOpenApiByFeatures(spec, []);
    expect(has(out, '/api/library')).toBe(false);
    expect(has(out, '/api/sessions/{sessionId}/messages')).toBe(true);
  });
});

describe('DocsController', () => {
  const store = new DocsSpecStore();
  const ctrl = new DocsController(store);
  const key = (allowedFeatures: string[] | null) => ({ allowedFeatures }) as unknown as ApiKey;

  it('serves nothing when Swagger is off (no document)', () => {
    expect(ctrl.get(key(null))).toEqual({ paths: {} });
  });

  it('serves each key only its own endpoints', () => {
    store.document = spec;
    expect(has(ctrl.get(key(['library'])), '/api/deals')).toBe(false);
    expect(has(ctrl.get(key(null)), '/api/deals')).toBe(true);
  });
});

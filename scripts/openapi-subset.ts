// Writes an OpenAPI file holding only the chosen features' endpoints, for handing to a partner.
// Usage: npx ts-node scripts/openapi-subset.ts <out.json> <feature> [feature...]
//   e.g. npx ts-node scripts/openapi-subset.ts openapi-partner.json library workflows
// shortcut: components are not pruned, so the schema list can still name unrelated models; hiding is cosmetic,
// the real limit is the key's allowedFeatures.
import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'fs';
import { FEATURE_CONTROLLER_PATHS, FEATURE_IDS, type FeatureId } from '../src/modules/auth/features';

export function subsetOpenApi(spec: { paths: Record<string, unknown>; servers?: unknown }, features: FeatureId[]) {
  const prefixes = features.flatMap(f =>
    FEATURE_CONTROLLER_PATHS[f].map(p => '/api/' + p.replace(/:([A-Za-z]+)/g, '{$1}')),
  );
  const paths = Object.fromEntries(
    Object.entries(spec.paths).filter(([p]) => prefixes.some(x => p === x || p.startsWith(x + '/'))),
  );
  return { ...spec, paths };
}

if (require.main === module) {
  const [out, ...names] = process.argv.slice(2);
  const bad = names.filter(n => !FEATURE_IDS.includes(n as FeatureId));
  if (!out || names.length === 0 || bad.length > 0) {
    console.error(`Usage: openapi-subset.ts <out.json> <feature...>\nFeatures: ${FEATURE_IDS.join(', ')}`);
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync('openapi.json', 'utf8'));
  const sub = subsetOpenApi(spec, names as FeatureId[]);
  sub.servers = [{ url: 'https://artha-qniz.onrender.com', description: 'Artha' }];
  writeFileSync(out, JSON.stringify(sub, null, 2));
  console.log(`${Object.keys(sub.paths).length} endpoints written to ${out}`);
}

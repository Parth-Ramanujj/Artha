import { FEATURE_CONTROLLER_PATHS, type FeatureId } from '../auth/features';

// Always shown to a restricted key: sessions + messaging (always allowed) and key validation. Other core
// routes (settings, infra, provisioning...) are admin surface a partner must not see in its docs.
const ALWAYS_SHOWN = ['/api/sessions', '/api/auth/validate'];

/** Shows a restricted key only its approved features plus sessions/messaging. `null` = unrestricted key. */
export function filterOpenApiByFeatures<T extends { paths: Record<string, unknown> }>(
  spec: T,
  allowedFeatures: readonly string[] | null,
): T {
  if (allowedFeatures === null) return spec;
  const prefixes = (features: FeatureId[]) =>
    features.flatMap(f => FEATURE_CONTROLLER_PATHS[f].map(p => '/api/' + p.replace(/:([A-Za-z]+)/g, '{$1}')));
  const all = Object.keys(FEATURE_CONTROLLER_PATHS) as FeatureId[];
  const hidden = prefixes(all.filter(f => !allowedFeatures.includes(f)));
  const shown = [...prefixes(all.filter(f => allowedFeatures.includes(f))), ...ALWAYS_SHOWN];
  const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + '/');
  const paths = Object.fromEntries(
    Object.entries(spec.paths).filter(([p]) => shown.some(s => under(p, s)) && !hidden.some(h => under(p, h))),
  );
  return { ...spec, paths };
}

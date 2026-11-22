import { PATH_METADATA } from '@nestjs/common/constants';

/**
 * Features a super admin can approve per API key (`ApiKey.allowedFeatures`). Each feature owns the
 * controller route prefixes below; CORE_CONTROLLER_PATHS are always reachable (sessions, messaging,
 * auth, health — still subject to role/session/business checks). A controller in neither list is
 * denied to feature-restricted keys (fail closed); features.spec.ts keeps both lists complete.
 */
export const FEATURE_CONTROLLER_PATHS = {
  webhooks: ['webhooks', 'sessions/:sessionId/webhooks', 'webhook-test'],
  templates: ['sessions/:sessionId/templates'],
  messageStudio: ['message-studio'],
  whatsappForms: ['whatsapp-forms'],
  conversations: [
    'conversations',
    'contacts',
    'export',
    'canned-responses',
    'contact-segments',
    'assignment-rules',
    'notifications',
    'deals',
    'reminders',
  ],
  support: ['sla', 'advisor-alerts', 'feedback'],
  followup: ['followup'],
  workflows: ['workflows', 'workflows/analytics', 'ab-tests'],
  campaigns: ['campaigns', 'campaigns/analytics', 'scheduled-messages', 'consent', 'message-costs'],
  ai: ['ai'],
  aiCalling: ['ai-calling', 'ai-calling/twilio'],
  customerCare: ['customer-care', 'assistant'],
  salesAgent: ['sales-agent'],
  googleBusiness: ['google-business', 'google', 'google/oauth'],
  library: ['library'],
  growth: ['growth', 'g'],
  socialAutomation: ['social-automation'],
  integrations: ['integrations', 'sync', 'integration/instances', 'integration/plugins/:pluginId/instances', 'ingress'],
} as const satisfies Record<string, readonly string[]>;

export type FeatureId = keyof typeof FEATURE_CONTROLLER_PATHS;
export const FEATURE_IDS = Object.keys(FEATURE_CONTROLLER_PATHS) as FeatureId[];

export const CORE_CONTROLLER_PATHS = [
  'auth',
  'auth/api-keys',
  'businesses',
  'sessions',
  'sessions/:sessionId',
  'sessions/:sessionId/calls',
  'sessions/:sessionId/channels',
  'sessions/:sessionId/contacts',
  'sessions/:sessionId/groups',
  'sessions/:sessionId/labels',
  'sessions/:sessionId/messages',
  'sessions/:sessionId/profile',
  'sessions/:sessionId/status',
  'stats',
  'search',
  'health',
  'docs-spec',
  'metrics',
  'infra',
  'plugins',
  'settings',
  'audit',
  'cloud-api/webhook',
  'social-automation/webhook',
  // Every customer must reach its wallet to recharge, whatever features it was approved for.
  'wallet',
  // Customers must be able to see why their own messages were not delivered.
  'whatsapp-logs',
  // Ad leads, WhatsApp calling, quality alerts and invoices for the customer's own numbers.
  'wa-business',
  'provisioning',
  'platforms',
] as const;

const FEATURE_BY_PATH = new Map<string, FeatureId | 'core'>([
  ...CORE_CONTROLLER_PATHS.map(p => [p, 'core'] as const),
  ...FEATURE_IDS.flatMap(f => FEATURE_CONTROLLER_PATHS[f].map(p => [p, f] as const)),
]);

/** The feature a controller class belongs to, 'core', or undefined when it is not classified. */
export function featureOfController(controller: object): FeatureId | 'core' | undefined {
  const path = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
  if (path === undefined) return undefined;
  const features = new Set(
    (Array.isArray(path) ? path : [path]).map(p => FEATURE_BY_PATH.get(p.replace(/^\/+|\/+$/g, ''))),
  );
  // A multi-path controller only counts when every path agrees; otherwise treat it as unclassified.
  return features.size === 1 ? [...features][0] : undefined;
}

/**
 * A customer key is a business key a super admin issued with approved features. Only these get the
 * strict tenant rules (own sessions only, never admin routes); older business keys (allowedFeatures
 * null) keep their previous behaviour so existing deployments don't break. Setting features on an old
 * key opts it in.
 */
export function isCustomerKey(key: { businessId?: string | null; allowedFeatures?: string[] | null }): boolean {
  return !!key.businessId && Array.isArray(key.allowedFeatures);
}

/** null = every feature (legacy keys and super admin); otherwise only the listed ones plus core. */
export function canUseFeature(allowedFeatures: string[] | null, feature: FeatureId | 'core' | undefined): boolean {
  if (allowedFeatures === null) return true;
  if (feature === 'core') return true;
  return feature !== undefined && allowedFeatures.includes(feature);
}

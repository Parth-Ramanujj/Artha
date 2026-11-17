// Mirrors FEATURE_IDS in src/modules/auth/features.ts (features.test.ts keeps them in sync).
// The API enforces these; the dashboard only hides what a key is not approved for.
export const FEATURE_IDS = [
  'webhooks',
  'templates',
  'messageStudio',
  'whatsappForms',
  'conversations',
  'support',
  'followup',
  'workflows',
  'campaigns',
  'ai',
  'aiCalling',
  'customerCare',
  'salesAgent',
  'googleBusiness',
  'library',
  'growth',
  'socialAutomation',
  'integrations',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** Dashboard route → the feature it needs. Routes not listed are core (always shown). */
export const ROUTE_FEATURE: Record<string, FeatureId> = {
  '/webhooks': 'webhooks',
  '/templates': 'templates',
  '/message-studio': 'messageStudio',
  '/whatsapp-forms': 'whatsappForms',
  '/conversations': 'conversations',
  '/canned-responses': 'conversations',
  '/notifications': 'conversations',
  '/contact-segments': 'conversations',
  '/assignment-rules': 'conversations',
  '/sales-pipeline': 'conversations',
  '/sla': 'support',
  '/advisor-alerts': 'support',
  '/feedback': 'support',
  '/followup': 'followup',
  '/workflows': 'workflows',
  '/workflow-analytics': 'workflows',
  '/ab-testing': 'workflows',
  '/campaigns': 'campaigns',
  '/campaign-analytics': 'campaigns',
  '/ai': 'ai',
  '/ai-agents': 'ai',
  '/chatbot-training': 'ai',
  '/ai-calling': 'aiCalling',
  '/customer-care': 'customerCare',
  '/sales-agent': 'salesAgent',
  '/google-business': 'googleBusiness',
  '/library': 'library',
  '/growth': 'growth',
  '/social-automation': 'socialAutomation',
  '/integrations': 'integrations',
  '/sync': 'integrations',
  '/commerce': 'integrations',
};

/** null = every feature (super admin and legacy keys). */
export function isRouteAllowed(route: string, allowedFeatures: readonly string[] | null): boolean {
  const feature = ROUTE_FEATURE[route];
  return !feature || allowedFeatures === null || allowedFeatures.includes(feature);
}

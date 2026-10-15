// Structural guard for the global-route authorization class of bug.
//
// The ApiKeyGuard resolves the scoped sessionId from ROUTE PARAMS only (api-key.guard.ts), and
// auth.service.ts short-circuits its allowedSessions check when no session id is present. So a route
// with NO session dimension admits a session-restricted key by default — the model is fail-open.
// The fence for those routes is @RequireUnscopedKey (auth.decorators.ts).
//
// This test fails when a controller handler is deployment-global (no :sessionId route param, not on
// a @SessionScoped controller) and carries neither @RequireUnscopedKey, @Public, nor an entry in
// ALLOWLIST below — so a future endpoint cannot silently re-introduce the gap.
import { readdirSync, readFileSync } from 'fs';
import { basename as pathBasename, join } from 'path';

/**
 * Handlers that are deliberately global AND deliberately reachable by a session-restricted key,
 * because they enforce the key's scope themselves in the handler or the service beneath it.
 * Key format: `<controller file basename> :: <handler name>`. Every entry needs a reason.
 */
const ALLOWLIST = new Map<string, string>([
  ['audit.controller.ts :: findAll', 'scope-filters rows via resolveSessionScope'],
  ['webhooks-list.controller.ts :: findAll', 'scope-filters rows via the calling key'],
  ['webhooks-list.controller.ts :: deliveryFailures', 'scope-filters rows via the calling key'],
  ['search.controller.ts :: search', 'scope-filters results via the calling key'],
  ['session.controller.ts :: findAll', 'scope-filters sessions to the key allowlist'],
  ['session.controller.ts :: getStats', 'scope-filters the aggregate to apiKey.allowedSessions in the service'],
  // Integration instances live under :pluginId/:instanceId (not a session param), so the guard's
  // route-param fence cannot reach them. Every handler below re-scopes itself against the calling
  // key: reads resolve via sessionScopeVisible (out-of-scope ⇒ 404), writes via assertScopeWritable.
  ['integration-instance.controller.ts :: list', 'filters rows with sessionScopeVisible'],
  ['integration-instance.controller.ts :: getOne', 'resolveVisible() ⇒ 404 outside the key scope'],
  ['integration-instance.controller.ts :: create', 'assertScopeWritable(apiKey, sessionScope) before persisting'],
  ['integration-instance.controller.ts :: regenerate', 'resolveVisible() ⇒ 404 outside the key scope'],
  ['integration-instance.controller.ts :: patch', 'resolveVisible() + assertScopeWritable before any write'],
  ['integration-instance.controller.ts :: remove', 'resolveVisible() ⇒ 404 outside the key scope'],
  ['redrive.controller.ts :: redriveInstance', 'fails closed for scoped keys: missing/out-of-scope instance ⇒ 404'],
  // Self-validation only: the route returns {valid, role} for the calling key and reads/writes no
  // resource, so a session-restricted key validating itself is harmless (it cannot broaden scope).
  ['auth-validate.controller.ts :: validate', 'self-validation of the calling key; no resource access'],
  ['conversation.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['conversation.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['conversation.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['conversation.controller.ts :: markRead', 'business-scoped via getBusinessId(apiKey)'],
  ['conversation.controller.ts :: create', 'business-scoped via getBusinessId(apiKey) — ContactController'],
  ['conversation.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey) — ContactController'],
  ['workflow.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: publish', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: disable', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: findRuns', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: findRun', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: cancelRun', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: testRun', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: testWebhook', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: getConfig', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: updateConfig', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: getModels', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: chat', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: findAllDocuments', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: findOneDocument', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: createDocument', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: updateDocument', 'business-scoped via getBusinessId(apiKey)'],
  ['ai.controller.ts :: removeDocument', 'business-scoped via getBusinessId(apiKey)'],
  ['campaign.controller.ts :: create', 'business-scoped via getBusinessId(apiKey) — ScheduledMessageController'],
  ['campaign.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey) — ScheduledMessageController/CampaignController/ConsentController'],
  ['campaign.controller.ts :: cancel', 'business-scoped via getBusinessId(apiKey) — ScheduledMessageController'],
  ['campaign.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: update', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: schedule', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: start', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: pause', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: cancelCampaign', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: addRecipients', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: findRecipients', 'business-scoped via getBusinessId(apiKey) — CampaignController'],
  ['campaign.controller.ts :: getConsent', 'business-scoped via getBusinessId(apiKey) — ConsentController'],
  ['campaign.controller.ts :: updateConsent', 'business-scoped via getBusinessId(apiKey) — ConsentController'],
  ['campaign-analytics.controller.ts :: getSummary', 'business-scoped via getBusinessId(apiKey)'],
  ['campaign-analytics.controller.ts :: getCampaignStats', 'business-scoped via getBusinessId(apiKey)'],
  ['advisor-alert.controller.ts :: getAdvisors', 'business-scoped via getBusinessId(apiKey)'],
  ['advisor-alert.controller.ts :: register', 'business-scoped via getBusinessId(apiKey)'],
  ['advisor-alert.controller.ts :: unregister', 'business-scoped via getBusinessId(apiKey)'],
  ['advisor-alert.controller.ts :: testAlert', 'business-scoped via getBusinessId(apiKey)'],
  ['assignment-rule.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['assignment-rule.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['assignment-rule.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['assignment-rule.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['assignment-rule.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['canned-response.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['canned-response.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['canned-response.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['canned-response.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['canned-response.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: getContacts', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['contact-segment.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['conversation.controller.ts :: importContacts', 'business-scoped via getBusinessId(apiKey) — ContactController'],
  ['conversation.controller.ts :: exportContacts', 'business-scoped via getBusinessId(apiKey) — ContactController'],
  ['conversation.controller.ts :: exportConversations', 'business-scoped via getBusinessId(apiKey) — ExportController'],
  ['feedback.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['feedback.controller.ts :: getStats', 'business-scoped via getBusinessId(apiKey)'],
  ['feedback.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['feedback.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['feedback.controller.ts :: requestViaWhatsApp', 'business-scoped via getBusinessId(apiKey)'],
  ['feedback.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: findAllRules', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: findOneRule', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: createRule', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: updateRule', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: removeRule', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: getDroppedUsers', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: sendFollowup', 'business-scoped via getBusinessId(apiKey)'],
  ['followup.controller.ts :: getStats', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: getUnreadCount', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: markAsRead', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: markAllRead', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: delete', 'business-scoped via getBusinessId(apiKey)'],
  ['notification.controller.ts :: deleteAll', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: findAllPolicies', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: findOnePolicy', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: createPolicy', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: updatePolicy', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: removePolicy', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: getEvents', 'business-scoped via getBusinessId(apiKey)'],
  ['sla.controller.ts :: getStats', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: getTypes', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: test', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: connect', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: disconnect', 'business-scoped via getBusinessId(apiKey)'],
  ['integrations.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: getTypes', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: test', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: connect', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: disconnect', 'business-scoped via getBusinessId(apiKey)'],
  ['integration.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: getProviders', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: trigger', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: export', 'business-scoped via getBusinessId(apiKey)'],
  ['sync.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: findAll', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: findOne', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: create', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: update', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: start', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: complete', 'business-scoped via getBusinessId(apiKey)'],
  ['ab-test.controller.ts :: remove', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow-analytics.controller.ts :: getSummary', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow-analytics.controller.ts :: getPathStats', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: listAgents', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: listLeads', 'business-scoped via getBusinessId(apiKey)'],
  ['workflow.controller.ts :: seedInsurancePreset', 'business-scoped via getBusinessId(apiKey)'],
]);

/**
 * Return the names of handlers in `source` that look deployment-global but carry no fence.
 * A handler is considered fenced when it (or its class) has @RequireUnscopedKey or @Public, and
 * session-dimensioned when it declares a `:sessionId` route param or the class is @SessionScoped.
 */
export function handlersMissingGlobalFence(source: string): string[] {
  const beforeClass = source.split('export class')[0] ?? '';
  const classIsSessionScoped = /@SessionScoped\(\)/.test(beforeClass);
  const classIsFenced = /@RequireUnscopedKey\(\)/.test(beforeClass);
  const classIsPublic = /@Public\(\)/.test(beforeClass);
  // A :sessionId in the class-level @Controller(...) prefix (e.g. @Controller('sessions/:sessionId/messages'))
  // gives EVERY handler on the controller a session dimension the guard scopes against — the per-session
  // resource controllers (messages, contacts, groups, …) all use this shape, not a per-handler param.
  const classHasSessionDimension = /@Controller\([^)]*:sessionId/.test(beforeClass);
  if (classIsFenced || classIsPublic || classHasSessionDimension) return [];

  const offenders: string[] = [];
  // Capture each handler's decorator block plus its method name. Decorators are the contiguous run of
  // `@...` lines immediately preceding an indented method declaration. Any indentation depth matches —
  // a handler indented by something other than two spaces is still a route the fence decision covers.
  const handlerRe = /((?:^ +@[\s\S]*?)?)^ +(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/gm;
  for (let m = handlerRe.exec(source); m !== null; m = handlerRe.exec(source)) {
    const [, decorators, name] = m;
    if (name === 'constructor') continue;
    // Only HTTP handlers matter; a private helper has no route decorator. @All, @Sse and @Head bind
    // routes too, so a handler using one is still an endpoint the fence decision applies to.
    if (!/@(Get|Post|Put|Patch|Delete|All|Sse|Head)\(/.test(decorators)) continue;
    if (/@Public\(\)/.test(decorators)) continue;
    if (/@RequireUnscopedKey\(\)/.test(decorators)) continue;
    // A :sessionId route param gives the guard something to scope against.
    if (/@(Get|Post|Put|Patch|Delete|All|Sse|Head)\([^)]*:sessionId/.test(decorators)) continue;
    // On a @SessionScoped controller the bare `:id` param is a session id, so it is scoped too.
    if (classIsSessionScoped && /@(Get|Post|Put|Patch|Delete|All|Sse|Head)\([^)]*:id/.test(decorators)) continue;
    offenders.push(name);
  }
  return offenders;
}

function listControllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listControllerFiles(full));
    else if (entry.name.endsWith('.controller.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('deployment-global routes are fenced against session-restricted keys', () => {
  // The checker itself must actually detect the gap — a structural guard that cannot fail proves nothing.
  it('flags a global handler with no fence', () => {
    const vulnerable = `
export class ThingController {
  @Get('everything')
  @RequireRole(ApiKeyRole.ADMIN)
  findAll(): string[] {
    return [];
  }
}
`;
    expect(handlersMissingGlobalFence(vulnerable)).toEqual(['findAll']);
  });

  it('flags an @All handler with no fence', () => {
    const vulnerable = `
export class ThingController {
  @All('everything')
  @RequireRole(ApiKeyRole.ADMIN)
  handleAll(): string[] {
    return [];
  }
}
`;
    expect(handlersMissingGlobalFence(vulnerable)).toEqual(['handleAll']);
  });

  it('flags a handler indented deeper than two spaces', () => {
    const vulnerable = `
export class ThingController {
    @Get('everything')
    @RequireRole(ApiKeyRole.ADMIN)
    findAll(): string[] {
        return [];
    }
}
`;
    expect(handlersMissingGlobalFence(vulnerable)).toEqual(['findAll']);
  });

  it('clears a handler carrying the fence', () => {
    const fixed = `
export class ThingController {
  @Get('everything')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  findAll(): string[] {
    return [];
  }
}
`;
    expect(handlersMissingGlobalFence(fixed)).toEqual([]);
  });

  it('clears a handler scoped by a :sessionId route param', () => {
    const scoped = `
export class ThingController {
  @Get('sessions/:sessionId/things')
  findForSession(): string[] {
    return [];
  }
}
`;
    expect(handlersMissingGlobalFence(scoped)).toEqual([]);
  });

  it('clears every handler on a class-level fenced controller', () => {
    const fenced = `
@Controller('infra')
@RequireUnscopedKey()
export class InfraController {
  @Get('everything')
  findAll(): string[] {
    return [];
  }
}
`;
    expect(handlersMissingGlobalFence(fenced)).toEqual([]);
  });

  it('clears a public handler', () => {
    const open = `
export class ThingController {
  @Get('health')
  @Public()
  health(): string {
    return 'ok';
  }
}
`;
    expect(handlersMissingGlobalFence(open)).toEqual([]);
  });

  it('no real controller exposes an unfenced deployment-global route', () => {
    const modulesDir = join(__dirname, '..');
    const offenders: string[] = [];
    for (const file of listControllerFiles(modulesDir)) {
      const basename = pathBasename(file);
      for (const handler of handlersMissingGlobalFence(readFileSync(file, 'utf8'))) {
        const key = `${basename} :: ${handler}`;
        if (ALLOWLIST.has(key)) continue;
        offenders.push(`${file.replace(/.*[/\\]src[/\\]/, 'src/')} :: ${handler}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

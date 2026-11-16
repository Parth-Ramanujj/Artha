import * as fs from 'fs';
import * as path from 'path';
import { Controller } from '@nestjs/common';
import {
  CORE_CONTROLLER_PATHS,
  FEATURE_CONTROLLER_PATHS,
  canUseFeature,
  featureOfController,
  isCustomerKey,
} from './features';

function listControllerFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listControllerFiles(full, out);
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

describe('feature permissions', () => {
  it('every controller route prefix is classified as a feature or core (no silent bypass)', () => {
    const classified = new Set<string>([...CORE_CONTROLLER_PATHS, ...Object.values(FEATURE_CONTROLLER_PATHS).flat()]);
    const prefixes = listControllerFiles(path.resolve(__dirname, '..')).flatMap(f =>
      [...fs.readFileSync(f, 'utf8').matchAll(/@Controller\(\s*['"]([^'"]*)['"]/g)].map(m => m[1]),
    );
    expect(prefixes.length).toBeGreaterThan(40);
    expect(prefixes.filter(p => !classified.has(p))).toEqual([]);
  });

  it('no prefix is listed twice', () => {
    const all = [...CORE_CONTROLLER_PATHS, ...Object.values(FEATURE_CONTROLLER_PATHS).flat()];
    expect(all.length).toBe(new Set(all).size);
  });

  it('resolves a controller class to its feature from its route prefix', () => {
    @Controller('campaigns')
    class CampaignsLike {}
    @Controller('sessions/:sessionId/messages')
    class MessagesLike {}
    @Controller('something-new')
    class Unknown {}

    expect(featureOfController(CampaignsLike)).toBe('campaigns');
    expect(featureOfController(MessagesLike)).toBe('core');
    expect(featureOfController(Unknown)).toBeUndefined();
  });

  it('isCustomerKey: only business keys with an approved-features list get the strict tenant rules', () => {
    expect(isCustomerKey({ businessId: 'b1', allowedFeatures: [] })).toBe(true);
    expect(isCustomerKey({ businessId: 'b1', allowedFeatures: ['campaigns'] })).toBe(true);
    expect(isCustomerKey({ businessId: 'b1', allowedFeatures: null })).toBe(false);
    expect(isCustomerKey({ businessId: null, allowedFeatures: [] })).toBe(false);
  });

  it('canUseFeature: null allows all, core always allowed, unknown denied for restricted keys', () => {
    expect(canUseFeature(null, 'campaigns')).toBe(true);
    expect(canUseFeature(null, undefined)).toBe(true);
    expect(canUseFeature([], 'core')).toBe(true);
    expect(canUseFeature(['campaigns'], 'campaigns')).toBe(true);
    expect(canUseFeature(['campaigns'], 'aiCalling')).toBe(false);
    expect(canUseFeature(['campaigns'], undefined)).toBe(false);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discountedPaise, monthCostPaise, tierDiscount } from './volumePricing.ts';

const tiers = [
  { fromMessages: 3, discountPercent: 50 },
  { fromMessages: 2, discountPercent: 25 },
];

test('each message is charged at the tier it reached', () => {
  // 80 + 60 + 40 + 40, the same as the wallet test
  assert.equal(monthCostPaise(4, 80, tiers), 220);
  assert.equal(monthCostPaise(1, 80, tiers), 80);
  assert.equal(monthCostPaise(0, 80, tiers), 0);
  assert.equal(monthCostPaise(10, 80, []), 800);
});

test('picks the highest tier reached and rounds down', () => {
  assert.equal(tierDiscount(tiers, 1), 0);
  assert.equal(tierDiscount(tiers, 2), 25);
  assert.equal(tierDiscount(tiers, 99), 50);
  assert.equal(discountedPaise(80, 36), 51);
});

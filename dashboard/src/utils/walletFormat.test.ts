import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rupees, walletCsv } from './walletFormat.ts';

test('rupees: paise to ₹ with two decimals and Indian grouping', () => {
  assert.equal(rupees(80), '₹0.80');
  assert.equal(rupees(12345600), '₹1,23,456.00');
});

test('walletCsv: rupee amounts, quoted text, empty balance while pending', () => {
  const csv = walletCsv([
    {
      id: '1',
      type: 'recharge',
      status: 'pending',
      amountPaise: 50000,
      balanceAfterPaise: null,
      description: 'Recharge, "first"',
      reference: 'order_1',
      razorpayPaymentId: null,
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: '2',
      type: 'charge',
      status: 'success',
      amountPaise: -80,
      balanceAfterPaise: 49920,
      description: 'WhatsApp marketing message',
      reference: 'msg:s1:w1',
      razorpayPaymentId: null,
      createdAt: '2026-11-20T11:00:00Z',
    },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Date,Type,Status,Details,Amount (INR),Balance after (INR),Reference,Razorpay payment');
  assert.equal(lines[1], '2026-11-20T10:00:00Z,recharge,pending,"Recharge, ""first""",500.00,,order_1,');
  assert.equal(lines[2], '2026-11-20T11:00:00Z,charge,success,WhatsApp marketing message,-0.80,499.20,msg:s1:w1,');
});

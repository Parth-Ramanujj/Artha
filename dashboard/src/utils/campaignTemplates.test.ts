import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignRecipients } from './campaignRecipients.ts';
import { buildMetaTemplate, buttonReplyWorkflow, countBodyVariables, type MetaTemplateDraft } from './metaTemplate.ts';

test('recipients: plain comma list stays a list of numbers without names', () => {
  assert.deepEqual(parseCampaignRecipients('919227102108, 919876543210'), {
    chatIds: ['919227102108', '919876543210'],
    names: ['', ''],
  });
});

test('recipients: "number, name" lines attach the name to that number', () => {
  assert.deepEqual(parseCampaignRecipients('919227102108, Ravi\n919876543210\n+91 98765 00000,Priya Shah'), {
    chatIds: ['919227102108', '919876543210', '+91 98765 00000'],
    names: ['Ravi', '', 'Priya Shah'],
  });
});

test('recipients: a CSV header line is ignored', () => {
  assert.deepEqual(parseCampaignRecipients('phone,name\n919227102108,Ravi').chatIds, ['919227102108']);
});

const draft = (patch: Partial<MetaTemplateDraft> = {}): MetaTemplateDraft => ({
  name: 'padosi_agent_invite',
  language: 'en',
  category: 'MARKETING',
  headerType: 'NONE',
  headerText: '',
  headerImage: null,
  body: 'Namaste {{1}}! Join us today.',
  bodyExamples: ['Rahul'],
  footer: 'Reply STOP to unsubscribe',
  buttons: [
    { type: 'URL', text: 'Register Now', value: 'https://example.com/register', autoReply: '' },
    { type: 'QUICK_REPLY', text: 'Know More', value: '', autoReply: 'Here are the details…' },
  ],
  ...patch,
});

test('template: counts distinct variables', () => {
  assert.equal(countBodyVariables('Hi {{1}}, order {{2}} for {{1}}'), 2);
});

test('template: builds the request body Meta needs', () => {
  const r = buildMetaTemplate('s1', draft());
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    sessionId: 's1',
    name: 'padosi_agent_invite',
    language: 'en',
    category: 'MARKETING',
    body: 'Namaste {{1}}! Join us today.',
    bodyExamples: ['Rahul'],
    footer: 'Reply STOP to unsubscribe',
    buttons: [
      { type: 'URL', text: 'Register Now', url: 'https://example.com/register' },
      { type: 'QUICK_REPLY', text: 'Know More' },
    ],
  });
});

test('template: catches what Meta would reject', () => {
  assert.equal(buildMetaTemplate('s1', draft({ name: 'Bad Name' })).ok, false);
  assert.equal(buildMetaTemplate('s1', draft({ bodyExamples: [] })).ok, false);
  assert.equal(buildMetaTemplate('s1', draft({ body: '{{1}} hello' })).ok, false);
  assert.equal(
    buildMetaTemplate('s1', draft({ buttons: [{ type: 'URL', text: 'Go', value: 'http://x.com', autoReply: '' }] })).ok,
    false,
  );
  assert.equal(buildMetaTemplate('s1', draft({ headerType: 'IMAGE' })).ok, false);
});

test('template: an image header is sent instead of header text', () => {
  const image = { base64: 'AAAA', mimetype: 'image/png' as const, filename: 'b.png' };
  const r = buildMetaTemplate('s1', draft({ headerType: 'IMAGE', headerImage: image, headerText: 'x' }));
  assert.ok(r.ok);
  assert.deepEqual(r.value.headerImage, image);
  assert.equal(r.value.headerText, undefined);
});

test('button reply workflow: keyword is the button label, reply is sent', () => {
  const wf = buttonReplyWorkflow('padosi_agent_invite', 'Know More, now', 'Details here');
  assert.deepEqual(wf.definition.trigger, { type: 'keyword_match', config: { keyword: 'Know More  now' } });
  assert.equal(wf.definition.nodes[1].data.config.message, 'Details here');
  assert.deepEqual(wf.definition.edges, [{ id: 'e-trg-reply', source: 'node-trg', target: 'node-reply' }]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignRecipients } from './campaignRecipients.ts';
import { templatePrice } from './templatePricing.ts';
import {
  buildMetaTemplate,
  buttonReplyWorkflow,
  countBodyVariables,
  nextVariable,
  withKeyword,
  workflowKeywords,
  type MetaTemplateDraft,
} from './metaTemplate.ts';

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
  variableType: 'NUMBER',
  headerType: 'NONE',
  headerText: '',
  headerExample: '',
  headerMedia: null,
  body: 'Namaste {{1}}! Join us today.',
  bodyExamples: ['Rahul'],
  footer: 'Reply STOP to unsubscribe',
  buttons: [
    { type: 'URL', text: 'Register Now', value: 'https://example.com/register', flowId: '', autoReply: '' },
    { type: 'QUICK_REPLY', text: 'Know More', value: '', flowId: '', autoReply: 'Here are the details…' },
  ],
  ttlSeconds: null,
  ...patch,
});
const btn = (type: MetaTemplateDraft['buttons'][number]['type'], text: string, value = '', flowId = '') => ({
  type,
  text,
  value,
  flowId,
  autoReply: '',
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
    headerFormat: 'NONE',
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
  assert.equal(buildMetaTemplate('s1', draft({ buttons: [btn('URL', 'Go', 'http://x.com')] })).ok, false);
  assert.equal(buildMetaTemplate('s1', draft({ headerType: 'IMAGE' })).ok, false);
  assert.equal(buildMetaTemplate('s1', draft({ body: 'Hi {{2}} there', bodyExamples: ['a'] })).ok, false);
  assert.equal(buildMetaTemplate('s1', draft({ variableType: 'NAME' })).ok, false); // {{1}} in a named template
  assert.equal(
    buildMetaTemplate('s1', draft({ buttons: [btn('URL', 'a', 'https://a.co'), btn('URL', 'b', 'https://b.co'), btn('URL', 'c', 'https://c.co')] })).ok,
    false,
  );
});

test('template: a media header is sent instead of header text', () => {
  const video = { base64: 'AAAA', mimetype: 'video/mp4' as const, filename: 'v.mp4' };
  const r = buildMetaTemplate('s1', draft({ headerType: 'VIDEO', headerMedia: video, headerText: 'x' }));
  assert.ok(r.ok);
  assert.deepEqual(r.value.headerMedia, video);
  assert.equal(r.value.headerText, undefined);
});

test('template: named variables, header variable, extra buttons and validity', () => {
  const r = buildMetaTemplate(
    's1',
    draft({
      category: 'UTILITY',
      variableType: 'NAME',
      headerType: 'TEXT',
      headerText: 'Hi {{first_name}}',
      headerExample: 'Rahul',
      body: 'Your {{plan}} is ready.',
      bodyExamples: ['Gold'],
      ttlSeconds: 600,
      buttons: [btn('COPY_CODE', '', 'SAVE20'), btn('FLOW', 'Register', '', '123456'), btn('VOICE_CALL', 'Call us')],
    }),
  );
  assert.ok(r.ok);
  assert.equal(r.value.parameterFormat, 'NAMED');
  assert.equal(r.value.headerExample, 'Rahul');
  assert.equal(r.value.ttlSeconds, 600);
  assert.deepEqual(r.value.buttons, [
    { type: 'COPY_CODE', text: 'Copy offer code', code: 'SAVE20' },
    { type: 'FLOW', text: 'Register', flowId: '123456', flowScreen: 'SCREEN_1' },
    { type: 'VOICE_CALL', text: 'Call us' },
  ]);
  assert.equal(nextVariable('Hi {{first_name}}', 'NAME'), '{{variable_2}}');
  assert.equal(nextVariable('Hi {{1}}', 'NUMBER'), '{{2}}');
});

test('price: per message, campaign total and when it is free', () => {
  assert.deepEqual(templatePrice('MARKETING', 100), {
    perMessage: '≈ ₹0.78 / message',
    total: '≈ ₹78.00 for 100 people',
    free: 'Charged even inside the 24-hour window.',
  });
  assert.equal(templatePrice('utility').free, 'Free if the person messaged you in the last 24 hours.');
  assert.equal(templatePrice('UTILITY').total, undefined);
});

test('button reply workflow: keyword is the button label, reply is sent', () => {
  const wf = buttonReplyWorkflow('padosi_agent_invite', 'Know More, now', 'Details here');
  assert.deepEqual(wf.definition.trigger, { type: 'keyword_match', config: { keyword: 'Know More  now' } });
  assert.equal(wf.definition.nodes[1].data.config.message, 'Details here');
  assert.deepEqual(wf.definition.edges, [{ id: 'e-trg-reply', source: 'node-trg', target: 'node-reply' }]);
});

test('workflow keywords: a template button can be added to and removed from a keyword workflow', () => {
  const def = {
    trigger: { type: 'keyword_match', config: { keyword: 'hi, hello' } },
    nodes: [{ id: 't', type: 'trigger', data: { config: { triggerType: 'keyword_match', keyword: 'hi, hello' } } }],
  };
  const added = withKeyword(def, 'Know More', true);
  assert.deepEqual(workflowKeywords(added), ['hi', 'hello', 'know more']);
  assert.equal(added.nodes?.[0].data?.config?.keyword, 'hi, hello, Know More');
  assert.deepEqual(workflowKeywords(withKeyword(withKeyword(added, 'know more', true), 'Know More', false)), ['hi', 'hello']);
  assert.deepEqual(workflowKeywords({ trigger: { type: 'message_received', config: {} } }), []);
});

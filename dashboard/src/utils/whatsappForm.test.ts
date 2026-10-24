import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createComponent,
  draftIssues,
  fieldNameFrom,
  moveItem,
  submissionColumns,
  submissionsToCsv,
  uniqueFieldName,
} from './whatsappForm.ts';
import type { FormDefinition } from '../types/whatsappForm.ts';

describe('fieldNameFrom', () => {
  it('turns labels into valid Flow field names', () => {
    assert.equal(fieldNameFrom('Full name'), 'full_name');
    assert.equal(fieldNameFrom('  E-mail (work)! '), 'e_mail_work');
    assert.equal(fieldNameFrom('2nd choice'), 'f_2nd_choice');
    assert.equal(fieldNameFrom('???'), 'field');
  });
});

describe('uniqueFieldName', () => {
  it('appends a counter when the name is taken', () => {
    assert.equal(uniqueFieldName('city', new Set()), 'city');
    assert.equal(uniqueFieldName('city', new Set(['city', 'city_2'])), 'city_3');
  });
});

describe('createComponent', () => {
  it('gives a field a unique name and choice options', () => {
    const def: FormDefinition = {
      screens: [{ id: 's', title: 'A', components: [{ id: 'x', type: 'short_text', name: 'pick', label: 'Pick' }] }],
    };
    const dropdown = createComponent('dropdown', def, 'Pick');
    assert.equal(dropdown.name, 'pick_2');
    assert.equal(dropdown.options?.length, 2);
    assert.equal(createComponent('short_text', { screens: [] }).inputType, 'text');
  });

  it('gives display blocks text, not a field name', () => {
    const heading = createComponent('heading', { screens: [] });
    assert.equal(heading.text, 'Welcome');
    assert.equal(heading.name, undefined);
  });
});

describe('moveItem', () => {
  it('moves an item and ignores out-of-range moves', () => {
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']);
  });
});

describe('draftIssues', () => {
  it('passes a complete form', () => {
    const def: FormDefinition = {
      screens: [
        { id: 's', title: 'A', components: [{ id: 'x', type: 'radio', name: 'r', label: 'R', options: [{ id: 'o', title: 'Yes' }] }] },
      ],
    };
    assert.deepEqual(draftIssues(def, 'Survey'), []);
  });

  it('reports a missing name, empty options and duplicate names', () => {
    const def: FormDefinition = {
      screens: [
        { id: 's', title: '', components: [{ id: 'x', type: 'dropdown', name: 'd', label: 'D', options: [] }] },
        { id: 't', title: 'B', components: [{ id: 'y', type: 'date', name: 'd', label: 'E' }] },
      ],
    };
    const issues = draftIssues(def, '  ');
    assert.ok(issues.includes('Give the form a name.'));
    assert.ok(issues.includes('Screen 1: give it a title.'));
    assert.ok(issues.includes('Screen 1: "D" needs at least one option.'));
    assert.ok(issues.includes('Field name "d" is used more than once.'));
  });
});

describe('submissionsToCsv', () => {
  const rows = [
    { id: '1', formId: 'f', sessionId: 's', chatId: '919876543210@c.us', createdAt: '2026-10-24T10:00:00Z', answers: { name: 'Asha, K', picks: ['a', 'b'] } },
    { id: '2', formId: 'f', sessionId: 's', chatId: '911111111111@c.us', createdAt: '2026-10-24T11:00:00Z', answers: { note: 'said "hi"' } },
  ];

  it('collects every field as a column and quotes cells that need it', () => {
    assert.deepEqual(submissionColumns(rows), ['name', 'picks', 'note']);
    assert.equal(
      submissionsToCsv(rows),
      [
        'submitted_at,phone,name,picks,note',
        '2026-10-24T10:00:00Z,919876543210,"Asha, K","a, b",',
        '2026-10-24T11:00:00Z,911111111111,,,"said ""hi"""',
      ].join('\r\n'),
    );
  });

  it('defuses answers that a spreadsheet would run as a formula', () => {
    const evil = [{ ...rows[0], answers: { name: '=HYPERLINK("x")' } }];
    assert.ok(submissionsToCsv(evil).endsWith(`,"'=HYPERLINK(""x"")"`));
  });
});

import {
  buildFlowJson,
  buildFlowMessage,
  formIdFromToken,
  makeFlowToken,
  validateFormDefinition,
  FormDefinition,
} from './flow-definition';

const twoScreens: FormDefinition = {
  screens: [
    {
      id: 'a',
      title: 'About you',
      components: [
        { id: 'h', type: 'heading', text: 'Welcome' },
        { id: 'f1', type: 'short_text', name: 'full_name', label: 'Name', required: true, inputType: 'text' },
        {
          id: 'f2',
          type: 'radio',
          name: 'plan',
          label: 'Plan',
          required: false,
          options: [{ id: 'basic', title: 'Basic' }],
        },
      ],
    },
    {
      id: 'b',
      title: 'Consent',
      components: [{ id: 'f3', type: 'opt_in', name: 'agree', label: 'I agree', required: true }],
    },
  ],
};

describe('validateFormDefinition', () => {
  it('accepts a complete definition', () => {
    expect(validateFormDefinition(twoScreens)).toEqual([]);
  });

  it('reports a missing screen list', () => {
    expect(validateFormDefinition({ screens: [] })).toEqual(['Add at least one screen.']);
  });

  it('reports bad field names and duplicates across screens', () => {
    const def: FormDefinition = {
      screens: [
        {
          id: 'a',
          title: 'A',
          components: [{ id: 'x', type: 'short_text', name: 'bad name', label: 'L', required: false }],
        },
        {
          id: 'b',
          title: 'B',
          components: [
            { id: 'y', type: 'date', name: 'd', label: 'D', required: false },
            { id: 'z', type: 'date', name: 'd', label: 'E', required: false },
          ],
        },
      ],
    };
    const issues = validateFormDefinition(def);
    expect(issues.some(i => i.includes('"bad name" is not a valid field name'))).toBe(true);
    expect(issues.some(i => i.includes('"d" is used more than once'))).toBe(true);
  });

  it('requires options on choice fields and a title on every screen', () => {
    const def: FormDefinition = {
      screens: [
        {
          id: 'a',
          title: '',
          components: [{ id: 'x', type: 'dropdown', name: 'c', label: 'City', required: false, options: [] }],
        },
      ],
    };
    const issues = validateFormDefinition(def);
    expect(issues).toContain('Screen 1: give it a title.');
    expect(issues).toContain('Screen 1: "City" needs at least one option.');
  });
});

describe('buildFlowJson', () => {
  const flow = buildFlowJson(twoScreens) as {
    version: string;
    routing_model: Record<string, string[]>;
    screens: Array<{
      id: string;
      terminal?: boolean;
      data?: Record<string, unknown>;
      layout: { children: Array<Record<string, unknown>> };
    }>;
  };

  it('names screens by position and routes each to the next', () => {
    expect(flow.screens.map(s => s.id)).toEqual(['SCREEN_1', 'SCREEN_2']);
    expect(flow.routing_model).toEqual({ SCREEN_1: ['SCREEN_2'] });
    expect(flow.screens[1].terminal).toBe(true);
  });

  it('forwards earlier answers as data and declares them on the next screen', () => {
    const footer = flow.screens[1].layout.children.at(-1) as {
      'on-click-action': { name: string; payload: Record<string, string> };
    };
    expect(footer['on-click-action'].name).toBe('complete');
    expect(footer['on-click-action'].payload).toEqual({
      full_name: '${data.full_name}',
      plan: '${data.plan}',
      agree: '${form.agree}',
    });
    expect(flow.screens[1].data).toEqual({
      full_name: { type: 'string', __example__: 'example' },
      plan: { type: 'string', __example__: 'example' },
    });
  });

  it('maps components to Meta component types', () => {
    const first = flow.screens[0].layout.children;
    expect(first[0]).toEqual({ type: 'TextHeading', text: 'Welcome' });
    expect(first[1]).toMatchObject({ type: 'TextInput', name: 'full_name', 'input-type': 'text' });
    expect(first[2]).toMatchObject({ type: 'RadioButtonsGroup', 'data-source': [{ id: 'basic', title: 'Basic' }] });
    expect((first.at(-1) as { 'on-click-action': { name: string } })['on-click-action'].name).toBe('navigate');
  });
});

describe('buildFlowMessage', () => {
  it('opens the flow on its first screen with a unique token', () => {
    const msg = buildFlowMessage({ flowId: '123', flowToken: 't1', bodyText: 'Hi', ctaText: 'Open form' }) as {
      action: { parameters: { flow_id: string; flow_action_payload: { screen: string } } };
    };
    expect(msg.action.parameters.flow_id).toBe('123');
    expect(msg.action.parameters.flow_action_payload.screen).toBe('SCREEN_1');
  });
});

describe('flow tokens', () => {
  it('carry the form id and reject tokens from elsewhere', () => {
    const formId = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
    expect(formIdFromToken(makeFlowToken(formId, 'abc'))).toBe(formId);
    expect(formIdFromToken('some-other-token')).toBeNull();
  });
});

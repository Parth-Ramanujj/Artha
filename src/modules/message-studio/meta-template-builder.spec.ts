import { BadRequestException } from '@nestjs/common';
import { buildMetaTemplatePayload, templateVariableNames } from './meta-template-payload';
import { metaTemplateComponents, readMetaTemplate } from '../campaign/campaign-meta-template';
import type { CreateMetaTemplateDto } from './dto/message-studio.dto';

const dto = (patch: Partial<CreateMetaTemplateDto> = {}): CreateMetaTemplateDto => ({
  sessionId: 's1',
  name: 'padosi_agent_invite',
  language: 'en',
  category: 'MARKETING',
  body: 'Namaste {{1}}! Join us.',
  bodyExamples: ['Rahul'],
  footer: 'Reply STOP to unsubscribe',
  buttons: [
    { type: 'URL', text: 'Register Now', url: 'https://example.com/r' },
    { type: 'QUICK_REPLY', text: 'Know More' },
    { type: 'PHONE_NUMBER', text: 'Call us', phone: '+919876543210' },
  ],
  ...patch,
});
const components = (p: Record<string, unknown>) => p.components as Array<Record<string, unknown>>;

describe('buildMetaTemplatePayload', () => {
  it('maps the builder form to Meta message_templates components', () => {
    expect(buildMetaTemplatePayload(dto({ headerText: 'Hello' }))).toEqual({
      name: 'padosi_agent_invite',
      language: 'en',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Hello' },
        { type: 'BODY', text: 'Namaste {{1}}! Join us.', example: { body_text: [['Rahul']] } },
        { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Register Now', url: 'https://example.com/r' },
            { type: 'QUICK_REPLY', text: 'Know More' },
            { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+919876543210' },
          ],
        },
      ],
    });
  });

  it('omits the example and optional parts when there are none', () => {
    const payload = buildMetaTemplatePayload(
      dto({ body: 'Hello there.', bodyExamples: undefined, footer: undefined, buttons: undefined }),
    );
    expect(payload.components).toEqual([{ type: 'BODY', text: 'Hello there.' }]);
  });

  it('uses a media header with the uploaded handle, and a location header with none', () => {
    expect(components(buildMetaTemplatePayload(dto({ headerFormat: 'VIDEO' }), 'h:abc'))[0]).toEqual({
      type: 'HEADER',
      format: 'VIDEO',
      example: { header_handle: ['h:abc'] },
    });
    expect(components(buildMetaTemplatePayload(dto({ headerFormat: 'LOCATION' })))[0]).toEqual({
      type: 'HEADER',
      format: 'LOCATION',
    });
    expect(() => buildMetaTemplatePayload(dto({ headerFormat: 'IMAGE' }))).toThrow(BadRequestException);
  });

  it('builds a named-variable template with header and body examples', () => {
    const payload = buildMetaTemplatePayload(
      dto({
        parameterFormat: 'NAMED',
        headerText: 'Hi {{first_name}}',
        headerExample: 'Rahul',
        body: 'Your {{plan}} renews on {{date}}.',
        bodyExamples: ['Gold', '1 Dec'],
        buttons: undefined,
        footer: undefined,
      }),
    );
    expect(payload.parameter_format).toBe('NAMED');
    expect(components(payload)).toEqual([
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Hi {{first_name}}',
        example: { header_text_named_params: [{ param_name: 'first_name', example: 'Rahul' }] },
      },
      {
        type: 'BODY',
        text: 'Your {{plan}} renews on {{date}}.',
        example: {
          body_text_named_params: [
            { param_name: 'plan', example: 'Gold' },
            { param_name: 'date', example: '1 Dec' },
          ],
        },
      },
    ]);
  });

  it('maps the extra button types and the Utility validity period', () => {
    const payload = buildMetaTemplatePayload(
      dto({
        category: 'UTILITY',
        ttlSeconds: 600,
        buttons: [
          { type: 'COPY_CODE', text: 'Copy', code: 'SAVE20' },
          { type: 'FLOW', text: 'Register', flowId: '123456', flowScreen: 'START' },
          { type: 'VOICE_CALL', text: 'Call on WhatsApp' },
        ],
      }),
    );
    expect(payload.message_send_ttl_seconds).toBe(600);
    expect(components(payload).at(-1)).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'COPY_CODE', example: 'SAVE20' },
        { type: 'FLOW', text: 'Register', flow_id: '123456', flow_action: 'navigate', navigate_screen: 'START' },
        { type: 'VOICE_CALL', text: 'Call on WhatsApp' },
      ],
    });
    // Marketing ignores a validity period.
    expect(buildMetaTemplatePayload(dto({ ttlSeconds: 600 })).message_send_ttl_seconds).toBeUndefined();
  });

  it('rejects what Meta would reject', () => {
    expect(() => buildMetaTemplatePayload(dto({ bodyExamples: [] }))).toThrow(BadRequestException);
    expect(() => buildMetaTemplatePayload(dto({ body: 'Hi {{2}}', bodyExamples: ['a'] }))).toThrow(
      'Number the variables in order',
    );
    expect(() => buildMetaTemplatePayload(dto({ parameterFormat: 'NAMED', body: 'Hi {{1}}' }))).toThrow(
      'Use names like',
    );
    expect(() =>
      buildMetaTemplatePayload(
        dto({
          buttons: [
            { type: 'URL', text: 'a', url: 'https://a.com' },
            { type: 'URL', text: 'b', url: 'https://b.com' },
            { type: 'URL', text: 'c', url: 'https://c.com' },
          ],
        }),
      ),
    ).toThrow('At most 2 website buttons');
  });

  it('lists variables in order of first appearance', () => {
    expect(templateVariableNames('{{2}} {{1}} {{2}}')).toEqual(['2', '1']);
    expect(templateVariableNames('{{first_name}} {{plan}}', 'NAMED')).toEqual(['first_name', 'plan']);
  });
});

describe('campaign Meta template', () => {
  it('reads a valid metaTemplate and ignores anything else', () => {
    expect(readMetaTemplate({ metaTemplate: { name: 'a', language: 'en', bodyParams: ['{{name}}'] } })).toEqual({
      name: 'a',
      language: 'en',
      bodyParams: ['{{name}}'],
    });
    expect(readMetaTemplate(null)).toBeNull();
    expect(readMetaTemplate({ metaTemplate: { name: '', language: 'en' } })).toBeNull();
  });

  const tpl = (patch = {}) => ({ name: 'a', language: 'en', bodyParams: ['{{name}}', 'Gold'], ...patch });

  it('fills {{name}} per recipient and never sends an empty parameter', () => {
    expect(metaTemplateComponents(tpl(), 'Ravi')).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ravi' },
          { type: 'text', text: 'Gold' },
        ],
      },
    ]);
    expect(metaTemplateComponents(tpl({ bodyParams: ['{{name}}'] }), null)).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'there' }] },
    ]);
    expect(metaTemplateComponents(tpl({ bodyParams: [] }), 'Ravi')).toBeUndefined();
  });

  it('uses the chosen fallback word and the legacy header image', () => {
    expect(
      metaTemplateComponents(tpl({ bodyParams: ['{{name}}'], nameFallback: 'Sir/Madam', headerImageId: 'm1' }), ''),
    ).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { id: 'm1' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Sir/Madam' }] },
    ]);
  });

  it('sends named parameters, a header text value, document headers and the offer code', () => {
    const t = readMetaTemplate({
      metaTemplate: {
        name: 'a',
        language: 'en',
        bodyParams: ['{{name}}'],
        paramNames: ['first_name'],
        headerMedia: { type: 'document', id: 'd1', filename: 'brochure.pdf' },
        couponCode: 'SAVE20',
        couponIndex: 1,
      },
    })!;
    expect(metaTemplateComponents(t, 'Ravi')).toEqual([
      { type: 'header', parameters: [{ type: 'document', document: { id: 'd1', filename: 'brochure.pdf' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ravi', parameter_name: 'first_name' }] },
      {
        type: 'button',
        sub_type: 'copy_code',
        index: '1',
        parameters: [{ type: 'coupon_code', coupon_code: 'SAVE20' }],
      },
    ]);
    expect(metaTemplateComponents(tpl({ bodyParams: [], headerParam: 'Hi {{name}}' }), 'Ravi')).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Hi Ravi' }] },
    ]);
  });
});

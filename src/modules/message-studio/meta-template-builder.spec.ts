import { BadRequestException } from '@nestjs/common';
import { buildMetaTemplatePayload } from './message-studio.service';
import { metaTemplateComponents, readMetaTemplate } from '../campaign/campaign.service';
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

  it('uses an IMAGE header with the uploaded handle instead of the text header', () => {
    const payload = buildMetaTemplatePayload(dto({ headerText: 'ignored' }), 'h:abc');
    expect((payload.components as unknown[])[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['h:abc'] },
    });
  });

  it('rejects a body whose variables have no sample values', () => {
    expect(() => buildMetaTemplatePayload(dto({ bodyExamples: [] }))).toThrow(BadRequestException);
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

  it('uses the chosen fallback word and the header image', () => {
    expect(
      metaTemplateComponents(tpl({ bodyParams: ['{{name}}'], nameFallback: 'Sir/Madam', headerImageId: 'm1' }), ''),
    ).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { id: 'm1' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Sir/Madam' }] },
    ]);
  });
});

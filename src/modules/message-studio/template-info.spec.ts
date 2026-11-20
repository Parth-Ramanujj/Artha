import { toTemplateInfo } from './message-studio.service';

describe('toTemplateInfo for editing', () => {
  it('keeps the id, approved examples and every button value so an edit starts filled in', () => {
    const info = toTemplateInfo({
      id: '123456',
      name: 'greeting',
      language: 'en',
      status: 'APPROVED',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}', example: { header_text: ['Ravi'] } },
        { type: 'BODY', text: 'Hello {{1}}, plan {{2}}', example: { body_text: [['Kunal', 'Gold']] } },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Register', url: 'https://x.co/r' },
            { type: 'PHONE_NUMBER', text: 'Call', phone_number: '+919876543210' },
            { type: 'COPY_CODE', text: 'Copy offer code', example: ['SAVE20'] },
            { type: 'FLOW', text: 'Form', flow_id: '987' },
          ],
        },
      ],
    });
    expect(info).toMatchObject({ id: '123456', bodyExamples: ['Kunal', 'Gold'], headerExample: 'Ravi' });
    expect(info.buttons).toEqual([
      { type: 'URL', text: 'Register', url: 'https://x.co/r' },
      { type: 'PHONE_NUMBER', text: 'Call', phone: '+919876543210' },
      { type: 'COPY_CODE', text: 'Copy offer code', code: 'SAVE20' },
      { type: 'FLOW', text: 'Form', flowId: '987' },
    ]);
  });

  it('reads named-variable examples', () => {
    const info = toTemplateInfo({
      name: 'n',
      language: 'en',
      status: 'APPROVED',
      category: 'UTILITY',
      parameterFormat: 'NAMED',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{first_name}}',
          example: { body_text_named_params: [{ param_name: 'first_name', example: 'Ravi' }] },
        },
      ],
    });
    expect(info.bodyExamples).toEqual(['Ravi']);
  });
});

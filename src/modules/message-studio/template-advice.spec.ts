import { ServiceUnavailableException } from '@nestjs/common';
import { TemplateAdviceService, parseTemplateAdvice } from './template-advice.service';
import type { AiService } from '../ai/ai.service';

const reply = {
  category: 'marketing',
  reason: 'It invites agents to join.',
  risks: ['"India\'s First" is an unproven claim'],
  improvedBody: 'Hello {{1}}! Join पडोसीAgent.',
  utilityBody: null,
  utilityNote: 'Only after the agent has registered.',
  tips: ['Add a STOP footer'],
};

describe('template advice', () => {
  it('reads the JSON even when the model wraps it in text', () => {
    expect(parseTemplateAdvice(`Sure!\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``)).toEqual({
      ...reply,
      category: 'MARKETING',
    });
  });

  it('rejects a reply without a valid category or rewrite', () => {
    expect(parseTemplateAdvice('no json here')).toBeNull();
    expect(parseTemplateAdvice(JSON.stringify({ ...reply, category: 'OTHER' }))).toBeNull();
    expect(parseTemplateAdvice(JSON.stringify({ ...reply, improvedBody: '' }))).toBeNull();
  });

  it('asks the AI and returns parsed advice; a bad reply is a clear 503', async () => {
    const complete = jest.fn().mockResolvedValue({ content: JSON.stringify(reply) });
    const service = new TemplateAdviceService({ complete } as unknown as AiService);
    const dto = { category: 'UTILITY' as const, language: 'en', body: 'Hello {{1}}', explainIn: 'gu' as const };

    await expect(service.advise(dto)).resolves.toMatchObject({ category: 'MARKETING' });
    const [messages] = complete.mock.calls[0] as [Array<{ content: string }>];
    expect(messages[1].content).toContain('Gujlish');

    complete.mockResolvedValueOnce({ content: 'not json' });
    await expect(service.advise(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(new TemplateAdviceService().advise(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

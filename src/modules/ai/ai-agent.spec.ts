import { DataSource } from 'typeorm';
import { AiAgent, AgentStatus } from './entities/ai-agent.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { AiAgentService, extractReply } from './ai-agent.service';
import { AiCopilotService } from './ai-copilot.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

describe('AI chat agents', () => {
  let ds: DataSource;
  let agents: AiAgentService;
  let complete: jest.Mock;
  let sendTextMessage: jest.Mock;
  const BIZ = 'biz-1';
  const msg = (body: string, chatId = '919876543210@c.us') => ({ id: 'm1', chatId, body }) as IncomingMessage;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiAgent, Session],
      synchronize: true,
    });
    await ds.initialize();
    complete = jest.fn().mockResolvedValue({ content: 'જી, હું મદદ કરીશ.' });
    sendTextMessage = jest.fn().mockResolvedValue({ id: 'out' });
    agents = new AiAgentService(
      ds.getRepository(AiAgent),
      ds.getRepository(Session),
      { find: jest.fn().mockResolvedValue([]) } as never,
      { complete } as never,
      { get: () => ({ sendTextMessage }) } as never,
    );
  });

  afterEach(() => ds.destroy());

  const live = (name: string, triggerKeywords: string[] = []) =>
    agents.create(BIZ, { name, systemPrompt: `You are ${name}.`, triggerKeywords, autonomous: true });

  it('never returns the external auth header, and clears it on an empty value', async () => {
    const agent = await agents.create(BIZ, {
      name: 'Dify bot',
      isExternal: true,
      externalPlatform: 'dify',
      externalWebhookUrl: 'https://api.dify.ai/v1/chat-messages',
      externalAuthHeader: 'Bearer secret',
    });
    expect(agent).toMatchObject({ hasAuthHeader: true, autonomous: false });
    expect(JSON.stringify(agent)).not.toContain('secret');
    expect((await agents.update(BIZ, agent.id, { externalAuthHeader: '' })).hasAuthHeader).toBe(false);
  });

  it('refuses an external agent without a webhook, and a WhatsApp number of another business', async () => {
    await expect(agents.create(BIZ, { name: 'x', isExternal: true })).rejects.toThrow(/webhook URL/);
    await ds
      .getRepository(Session)
      .save({ id: 'other-sess', name: 'x', businessId: 'biz-2', status: SessionStatus.READY });
    await expect(agents.create(BIZ, { name: 'x', sessionId: 'other-sess' })).rejects.toThrow(/does not belong/);
  });

  it('routes a chat by keyword, keeps follow-ups with that agent, and lets the catch-all take the rest', async () => {
    const sales = await live('Sales', ['price', 'ભાવ']);
    await live('Support');
    expect(await agents.autoReply('s1', BIZ, msg('What is the PRICE of the term plan?'))).toBe('replied');
    expect((complete.mock.calls[0] as [Array<{ content: string }>])[0][0].content).toContain('You are Sales.');
    expect(await agents.autoReply('s1', BIZ, msg('ok, 2 members'))).toBe('replied');
    expect((complete.mock.calls[1] as [Array<{ content: string }>])[0][0].content).toContain('You are Sales.');
    await agents.autoReply('s1', BIZ, msg('hello', '919000000000@c.us'));
    expect((complete.mock.calls[2] as [Array<{ content: string }>])[0][0].content).toContain('You are Support.');
    expect(sendTextMessage).toHaveBeenCalledTimes(3);
    const saved = await ds.getRepository(AiAgent).findOneByOrFail({ id: sales.id });
    expect(saved.conversationsHandled).toBe(1);
  });

  it('leaves the message to the general assistant when no live agent fits', async () => {
    await agents.create(BIZ, { name: 'Draft', autonomous: false });
    await agents.create(BIZ, { name: 'Paused', autonomous: true, status: AgentStatus.PAUSED });
    await live('Keyword only', ['refund']);
    expect(await agents.autoReply('s1', BIZ, msg('hello'))).toBe('skipped');
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports a failed reply without sending anything', async () => {
    await live('Support');
    complete.mockRejectedValue(new Error('Groq down'));
    expect(await agents.autoReply('s1', BIZ, msg('hello'))).toBe('failed');
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('drafts an agent from a description, with auto-reply off', async () => {
    complete.mockResolvedValue({
      content:
        'Here: {"name":"Pooja Claims","role":"Claim support","description":"Helps with claims","systemPrompt":"You help with insurance claims.","triggerKeywords":["claim","ક્લેમ"]}',
    });
    const agent = await agents.build(BIZ, 'An agent that helps customers with insurance claims');
    expect(agent).toMatchObject({ name: 'Pooja Claims', autonomous: false, triggerKeywords: ['claim', 'ક્લેમ'] });
    complete.mockResolvedValue({ content: 'sorry' });
    await expect(agents.build(BIZ, 'Another agent for something')).rejects.toThrow(/usable agent/);
  });

  it('reads the reply text from the shapes external agents answer with', () => {
    expect(extractReply('{"answer":"Hi from Dify"}', null)).toBe('Hi from Dify');
    expect(extractReply('[{"output":{"text":"Hi from n8n"}}]', 'output.text')).toBe('Hi from n8n');
    expect(extractReply('plain text reply', null)).toBe('plain text reply');
    expect(extractReply('{"data":{}}', 'data.reply')).toBeNull();
  });
});

describe('AI Copilot', () => {
  let complete: jest.Mock;
  let copilot: AiCopilotService;
  const messages = [{ role: 'customer' as const, text: 'My claim was rejected, please help urgently' }];

  beforeEach(() => {
    complete = jest.fn();
    copilot = new AiCopilotService({ complete } as never);
  });

  it('summarises with the sentiment the AI found', async () => {
    complete.mockResolvedValue({ content: '{"summary":"• Claim rejected","sentiment":"urgent"}' });
    await expect(copilot.run({ task: 'summary', messages })).resolves.toEqual({
      summary: '• Claim rejected',
      sentiment: 'urgent',
    });
  });

  it('never makes up an answer when the AI fails or the draft is empty', async () => {
    complete.mockRejectedValue(new Error('Groq down'));
    await expect(copilot.run({ task: 'replies', messages })).rejects.toThrow(/did not answer/);
    await expect(copilot.run({ task: 'translate', text: '  ', language: 'Gujarati' })).rejects.toThrow(
      /Type a message/,
    );
    complete.mockResolvedValue({ content: '{"replies":[]}' });
    await expect(copilot.run({ task: 'replies', messages })).rejects.toThrow(/did not return any replies/);
  });

  it('returns the translation only', async () => {
    complete.mockResolvedValue({ content: '"નમસ્તે"' });
    await expect(copilot.run({ task: 'translate', text: 'Hello', language: 'Gujarati' })).resolves.toEqual({
      text: 'નમસ્તે',
    });
  });

  it('refuses a voice that does not belong to the language', async () => {
    process.env.SARVAM_API_KEY = 'test';
    await expect(copilot.voicePreview({ text: 'Hi', language: 'gu-IN', voice: 'priya' })).rejects.toThrow(
      /not available/,
    );
    delete process.env.SARVAM_API_KEY;
  });
});

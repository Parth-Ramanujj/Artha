import { AiService } from './ai.service';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

describe('AiService.autoReply', () => {
  const GROQ_VARS = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4'];
  const savedEnv: Record<string, string | undefined> = {};
  const originalFetch = global.fetch;

  let config: Record<string, unknown>;
  let history: { body: string; direction: string }[];
  let sendTextMessage: jest.Mock;
  let fetchMock: jest.Mock;
  let service: AiService;

  const msg = (body: string, chatId = '919876543210@c.us') => ({ id: 'm1', chatId, body }) as IncomingMessage;
  const groqReply = (content: string) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  });
  const groqError = (status: number) => ({ ok: false, status, text: () => Promise.resolve(`error ${status}`) });
  const sentPrompt = () =>
    (
      JSON.parse(String((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)) as {
        messages: { role: string; content: string }[];
      }
    ).messages;

  beforeEach(() => {
    for (const k of GROQ_VARS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.GROQ_API_KEY_1 = 'test-key-1';
    process.env.GROQ_API_KEY_2 = 'test-key-2';
    process.env.GROQ_API_KEY_3 = 'test-key-3';

    config = {
      enabled: true,
      provider: 'groq',
      model: 'test-model',
      systemPrompt: 'Be helpful',
      maxContextMessages: 10,
      useKnowledgeBase: false,
      handoffKeywords: 'agent, human',
      fallbackMessage: null,
      sessionScopes: null,
    };
    history = [];
    sendTextMessage = jest.fn().mockResolvedValue({ id: 'out' });
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    service = new AiService(
      { findOne: jest.fn(() => Promise.resolve(config)) } as never,
      {} as never,
      { find: jest.fn(() => Promise.resolve([...history].reverse())) } as never,
      {} as never,
      { get: () => ({ sendTextMessage }) } as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const k of GROQ_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('sends the AI reply', async () => {
    fetchMock.mockResolvedValue(groqReply('Hello! How can I help?'));
    await expect(service.autoReply('sess', 'biz', msg('hi there'))).resolves.toBe('replied');
    expect(sendTextMessage).toHaveBeenCalledWith('919876543210@c.us', 'Hello! How can I help?');
  });

  it.each([
    ['disabled', { enabled: false }],
    ['scoped to another number', { sessionScopes: ['other-sess'] }],
  ])('stays quiet when AI is %s', async (_label, change) => {
    Object.assign(config, change);
    await expect(service.autoReply('sess', 'biz', msg('hi'))).resolves.toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('hands off on a handoff keyword without calling the AI', async () => {
    await expect(service.autoReply('sess', 'biz', msg('I want a human please'))).resolves.toBe('handoff');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry a too-large request on every key', async () => {
    fetchMock.mockResolvedValue(groqError(413));
    await expect(service.autoReply('sess', 'biz', msg('hello'))).resolves.toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still rotates keys on a rate limit', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(groqReply('ok'));
    await expect(service.autoReply('sess', 'biz', msg('hello'))).resolves.toBe('replied');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('apologises at most once a day per chat when the AI keeps failing', async () => {
    fetchMock.mockResolvedValue(groqError(500));
    await service.autoReply('sess', 'biz', msg('hello'));
    await service.autoReply('sess', 'biz', msg('anyone?'));
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(String((sendTextMessage.mock.calls as unknown[][])[0][1])).toMatch(/team will get back/);

    await service.autoReply('sess', 'biz', msg('hello', '911111111111@c.us'));
    expect(sendTextMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps the prompt small even with long stored messages', async () => {
    history = Array.from({ length: 10 }, (_, i) => ({
      body: `message ${i} ` + 'x'.repeat(5000),
      direction: i % 2 ? 'outgoing' : 'incoming',
    }));
    fetchMock.mockResolvedValue(groqReply('ok'));

    await service.autoReply('sess', 'biz', msg('y'.repeat(10_000)));

    const messages = sentPrompt();
    const historyChars = messages.slice(1, -1).reduce((n, m) => n + m.content.length, 0);
    expect(historyChars).toBeLessThanOrEqual(6000);
    expect(messages.slice(1, -1).every(m => m.content.length <= 800)).toBe(true);
    expect(messages.at(-1)?.content.length).toBe(2000);
    expect(messages.slice(1, -1).at(-1)?.content).toMatch(/^message 9/);
  });
});

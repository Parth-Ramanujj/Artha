import { extractTelegramMessage } from './controllers/social-webhook.controller';
import { telegramSendMessage } from './services/telegram.api';

describe('Telegram', () => {
  const dm = {
    message: {
      message_id: 7,
      text: 'hello',
      chat: { id: 555, type: 'private' },
      from: { first_name: 'Asha', last_name: 'P', is_bot: false },
    },
  };

  it('turns a private text DM into an inbox message', () => {
    expect(extractTelegramMessage(dm, '99')).toMatchObject({
      platform: 'telegram',
      targetAccountId: '99',
      senderId: '555',
      mid: '555:7',
      text: 'hello',
      customerName: 'Asha P',
      isEcho: false,
    });
  });

  it('skips groups, bots and non-text updates', () => {
    const msg = dm.message;
    expect(extractTelegramMessage({ message: { ...msg, chat: { id: 1, type: 'group' } } }, '99')).toBeNull();
    expect(extractTelegramMessage({ message: { ...msg, from: { is_bot: true } } }, '99')).toBeNull();
    expect(extractTelegramMessage({ message: { ...msg, text: undefined } }, '99')).toBeNull();
    expect(extractTelegramMessage({}, '99')).toBeNull();
  });

  it('sends text and reports Telegram errors without the token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ ok: true, result: { message_id: 8 } }),
      } as Response)
      .mockResolvedValueOnce({
        status: 403,
        json: () => Promise.resolve({ ok: false, description: 'Forbidden: bot was blocked by the user' }),
      } as Response);
    await expect(telegramSendMessage('T0KEN', '555', 'hi')).resolves.toBe('555:8');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/botT0KEN/sendMessage');
    await expect(telegramSendMessage('T0KEN', '555', 'hi')).rejects.toThrow('bot was blocked by the user');
    fetchMock.mockRestore();
  });
});

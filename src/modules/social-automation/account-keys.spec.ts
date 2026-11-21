import { BadRequestException } from '@nestjs/common';
import { SocialAutomationService } from './social-automation.service';
import { xGetMe } from './services/x.api';
import { telegramGetMe, telegramSetWebhook } from './services/telegram.api';
import { extractTelegramMessage } from './controllers/social-webhook.controller';

jest.mock('./services/x.api', (): unknown => ({
  ...jest.requireActual<object>('./services/x.api'),
  xGetMe: jest.fn(),
}));
jest.mock('./services/telegram.api', (): unknown => ({
  ...jest.requireActual<object>('./services/telegram.api'),
  telegramGetMe: jest.fn(),
  telegramSetWebhook: jest.fn(),
}));

const stored = { apiKey: 'k', apiSecret: 's', accessToken: 't', accessTokenSecret: 'ts' };

function setup(account: Record<string, unknown>) {
  const qb = { addSelect: () => qb, where: () => qb, getOne: () => Promise.resolve(account) };
  const accountRepo = {
    createQueryBuilder: () => qb,
    findOne: () => Promise.resolve(account),
    save: jest.fn((a: unknown) => Promise.resolve(a)),
    update: jest.fn(),
  };
  const none = {} as never;
  const service = new SocialAutomationService(accountRepo as never, none, none, none, none, none);
  return { service, accountRepo };
}

describe('editing Telegram and X keys', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces only the X keys that were given and keeps them as a key set', async () => {
    const account = { id: 'a', businessId: 'b', platform: 'x', accountId: '42', accessToken: JSON.stringify(stored) };
    (xGetMe as jest.Mock).mockResolvedValue({ id: '42', username: 'shop' });
    const { service, accountRepo } = setup(account);
    await service.updateAccount('b', 'a', { apiSecret: 'new-secret' });
    const saved = accountRepo.save.mock.calls[0][0] as { accessToken: string };
    expect(JSON.parse(saved.accessToken)).toEqual({ ...stored, apiSecret: 'new-secret' });
  });

  it('refuses X keys of another account and leaves the stored keys alone', async () => {
    const account = { id: 'a', businessId: 'b', platform: 'x', accountId: '42', accessToken: JSON.stringify(stored) };
    (xGetMe as jest.Mock).mockResolvedValue({ id: '99', username: 'other' });
    const { service, accountRepo } = setup(account);
    await expect(service.updateAccount('b', 'a', { accessToken: 'other-token' })).rejects.toThrow(BadRequestException);
    expect(accountRepo.save).not.toHaveBeenCalled();
    expect(account.accessToken).toBe(JSON.stringify(stored));
  });

  it('takes a new token for the same Telegram bot and re-points the webhook', async () => {
    process.env.BASE_URL = 'https://api.example.com';
    const account = {
      id: 'a',
      businessId: 'b',
      platform: 'telegram',
      accountId: '7',
      accessToken: 'old',
      webhookVerifyToken: 'sec',
    };
    (telegramGetMe as jest.Mock).mockResolvedValue({ id: 7, first_name: 'Bot' });
    (telegramSetWebhook as jest.Mock).mockResolvedValue(true);
    const { service, accountRepo } = setup(account);
    await service.updateAccount('b', 'a', { accessToken: 'new' });
    expect(telegramSetWebhook).toHaveBeenCalledWith(
      'new',
      'https://api.example.com/api/social-automation/webhook/telegram/a',
      'sec',
    );
    expect((accountRepo.save.mock.calls[0][0] as { accessToken: string }).accessToken).toBe('new');
  });

  it('refuses a token of a different Telegram bot', async () => {
    const account = { id: 'a', businessId: 'b', platform: 'telegram', accountId: '7', accessToken: 'old' };
    (telegramGetMe as jest.Mock).mockResolvedValue({ id: 8, first_name: 'Other' });
    const { service } = setup(account);
    await expect(service.updateAccount('b', 'a', { accessToken: 'new' })).rejects.toThrow('different bot');
  });
});

describe('Telegram files', () => {
  it('keeps a photo DM with its caption instead of dropping it', () => {
    const update = {
      message: {
        message_id: 3,
        chat: { id: 5, type: 'private' },
        from: { first_name: 'A' },
        photo: [{}],
        caption: 'price?',
      },
    };
    expect(extractTelegramMessage(update, '9')?.text).toBe('[📷 Photo] price?');
  });

  it('uploads a photo with multipart/form-data to sendPhoto', async () => {
    const { telegramSendFile } =
      jest.requireActual<typeof import('./services/telegram.api')>('./services/telegram.api');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ ok: true, result: { message_id: 4 } }),
    } as Response);
    await expect(
      telegramSendFile('T', '5', 'image', { data: Buffer.from('x'), mimetype: 'image/png', filename: 'a.png' }),
    ).resolves.toBe('5:4');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botT/sendPhoto');
    const form = init?.body as FormData;
    expect(form.get('chat_id')).toBe('5');
    expect((form.get('photo') as File).name).toBe('a.png');
    fetchMock.mockRestore();
  });
});

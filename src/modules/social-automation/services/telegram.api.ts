const API = 'https://api.telegram.org';
const TIMEOUT_MS = 20_000;

interface TelegramReply<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramBot {
  id: number;
  username?: string;
  first_name: string;
}

/** Calls the Telegram Bot API; throws with Telegram's own description (never the token) on failure. */
async function call<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as TelegramReply<T>;
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed (${res.status})`);
  return json.result as T;
}

export const telegramGetMe = (token: string) => call<TelegramBot>(token, 'getMe');

/** Telegram echoes `secret` back in the X-Telegram-Bot-Api-Secret-Token header of every delivery. */
export const telegramSetWebhook = (token: string, url: string, secret: string) =>
  call<boolean>(token, 'setWebhook', { url, secret_token: secret, allowed_updates: ['message'] });

export const telegramDeleteWebhook = (token: string) => call<boolean>(token, 'deleteWebhook');

export async function telegramSendMessage(token: string, chatId: string, text: string): Promise<string> {
  const sent = await call<{ message_id: number }>(token, 'sendMessage', { chat_id: chatId, text });
  return `${chatId}:${sent.message_id}`;
}

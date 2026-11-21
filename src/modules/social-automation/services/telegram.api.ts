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

const FILE_METHOD = {
  image: ['sendPhoto', 'photo'],
  video: ['sendVideo', 'video'],
  audio: ['sendAudio', 'audio'],
  file: ['sendDocument', 'document'],
} as const;

/** Uploads a file with multipart/form-data (photos up to 10 MB, other files up to 50 MB); returns `chatId:messageId`. */
export async function telegramSendFile(
  token: string,
  chatId: string,
  kind: keyof typeof FILE_METHOD,
  file: { data: Buffer; mimetype: string; filename: string },
): Promise<string> {
  const [method, field] = FILE_METHOD[kind];
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(field, new Blob([new Uint8Array(file.data)], { type: file.mimetype }), file.filename);
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as TelegramReply<{ message_id: number }>;
  if (!json.ok || !json.result) throw new Error(json.description || `Telegram ${method} failed (${res.status})`);
  return `${chatId}:${json.result.message_id}`;
}

export async function telegramSendMessage(token: string, chatId: string, text: string): Promise<string> {
  const sent = await call<{ message_id: number }>(token, 'sendMessage', { chat_id: chatId, text });
  return `${chatId}:${sent.message_id}`;
}

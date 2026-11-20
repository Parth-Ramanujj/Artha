import { CloudApiAdapter } from './cloud-api.adapter';
import { isFreshPersonalMessage, WORKFLOW_MAX_MESSAGE_AGE_MS } from '../../modules/workflow/inbound-message-filter';
import type { IncomingMessage } from '../interfaces/whatsapp-engine.interface';

describe('CloudApiAdapter incoming messages', () => {
  it('a customer text reaches workflows and the AI (one-to-one chat kind)', () => {
    const adapter = new CloudApiAdapter({ sessionId: 's1', accessToken: 't', phoneNumberId: 'PN1' });
    const map = (
      adapter as unknown as { mapIncomingMessage: (...a: unknown[]) => IncomingMessage | null }
    ).mapIncomingMessage.bind(adapter);
    const msg = map(
      {
        id: 'wamid.1',
        from: '916352701839',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hi' },
      },
      { profile: { name: 'Kunal' }, wa_id: '916352701839' },
      { display_phone_number: '919000000000' },
    );
    expect(msg).toMatchObject({ chatId: '916352701839@c.us', kind: 'individual', body: 'Hi' });
    expect(isFreshPersonalMessage(msg!, WORKFLOW_MAX_MESSAGE_AGE_MS)).toBe(true);
  });
});

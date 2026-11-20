import { MessageService } from '../message/message.service';
import { WorkflowExecutor } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';

type Sender = { sendTextTo(businessId: string, sessionId: string, chatId: string, text: string): Promise<unknown> };

describe('WorkflowExecutor channel senders', () => {
  const messageService = { sendText: jest.fn().mockResolvedValue({ messageId: 'wa-1' }) };
  const executor = new WorkflowExecutor(
    {} as unknown as WorkflowService,
    undefined,
    messageService as unknown as MessageService,
  );
  const igSend = jest.fn().mockResolvedValue({ messageId: 'ig-1' });
  executor.registerChannelSender('ig:', igSend);
  const send = (chatId: string) => (executor as unknown as Sender).sendTextTo('b', 's1', chatId, 'hi');

  beforeEach(() => jest.clearAllMocks());

  it('sends Instagram chats through the registered sender', async () => {
    await expect(send('ig:cust')).resolves.toEqual({ messageId: 'ig-1' });
    expect(igSend).toHaveBeenCalledWith('b', 's1', 'ig:cust', 'hi');
    expect(messageService.sendText).not.toHaveBeenCalled();
  });

  it('keeps WhatsApp chats on MessageService, including device-suffixed ids with a colon', async () => {
    for (const chatId of ['919999999999@c.us', '123456@lid', '919999999999:12@s.whatsapp.net', '1203@g.us']) {
      await send(chatId);
      expect(messageService.sendText).toHaveBeenLastCalledWith('s1', { chatId, text: 'hi' });
    }
    expect(igSend).not.toHaveBeenCalled();
  });
});

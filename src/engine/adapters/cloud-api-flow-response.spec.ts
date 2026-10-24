import { parseFlowResponse } from './cloud-api.adapter';

describe('parseFlowResponse (WhatsApp Form submissions)', () => {
  it('turns the answers into inbox lines and keeps the token and answers apart', () => {
    const parsed = parseFlowResponse({
      body: 'Sent',
      response_json: JSON.stringify({ flow_token: 'form.nonce', name: 'Asha', picks: ['a', 'b'] }),
    });
    expect(parsed.body).toBe('name: Asha\npicks: a, b');
    expect(parsed.flowReply).toEqual({ flowToken: 'form.nonce', answers: { name: 'Asha', picks: ['a', 'b'] } });
  });

  it("falls back to Meta's own text when the JSON cannot be read", () => {
    expect(parseFlowResponse({ body: 'Sent', response_json: 'not json' })).toEqual({ body: 'Sent' });
    expect(parseFlowResponse(undefined)).toEqual({ body: '' });
  });
});

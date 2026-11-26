import { AiCallingLogService, aiCallingLog } from './ai-calling-log.service';
import { AiCallStatus } from './entities/ai-call.entity';

describe('AiCallingLogService', () => {
  let service: AiCallingLogService;

  beforeEach(() => {
    service = new AiCallingLogService();
    service.clear();
  });

  it('records events and retrieves them via query', () => {
    service.info('call', 'Test call started', { callId: 'call-1', channel: 'browser' });
    service.error('tts', 'ElevenLabs connection closed', {
      callId: 'call-1',
      details: { code: 1008, voiceId: 'v123' },
    });
    service.warn('stt', 'Speech silence detected', { callId: 'call-1' });

    const all = service.query();
    expect(all.total).toBe(3);
    expect(all.events[0].message).toBe('Speech silence detected'); // newest first
    expect(all.events[1].message).toBe('ElevenLabs connection closed');
    expect(all.events[2].message).toBe('Test call started');
    expect(all.subsystemCounts.error).toBe(1);
    expect(all.subsystemCounts.warn).toBe(1);
    expect(all.subsystemCounts.info).toBe(1);
    expect(all.subsystemCounts.tts).toBe(1);
  });

  it('filters by level and subsystem', () => {
    service.info('media', 'WebSocket connected');
    service.error('tts', 'TTS failed');
    service.error('stt', 'STT failed');

    const errorsOnly = service.query({ level: 'error' });
    expect(errorsOnly.total).toBe(2);
    expect(errorsOnly.events.every(e => e.level === 'error')).toBe(true);

    const ttsOnly = service.query({ subsystem: 'tts' });
    expect(ttsOnly.total).toBe(1);
    expect(ttsOnly.events[0].message).toBe('TTS failed');
  });

  it('filters by search term', () => {
    service.info('call', 'Dialing +919876543210');
    service.info('call', 'Dialing +911122334455');
    service.error('tts', 'Rate limit on ElevenLabs voice');

    const searchPhone = service.query({ search: '9876543210' });
    expect(searchPhone.total).toBe(1);
    expect(searchPhone.events[0].message).toContain('9876543210');

    const searchEleven = service.query({ search: 'elevenlabs' });
    expect(searchEleven.total).toBe(1);
    expect(searchEleven.events[0].subsystem).toBe('tts');
  });

  it('clears all events', () => {
    service.info('call', 'Event 1');
    service.error('llm', 'Event 2');
    expect(service.query().total).toBe(2);

    service.clear();
    expect(service.query().total).toBe(0);
  });

  it('queries recent failed calls with mock repo', async () => {
    const mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'call-fail-1',
            phone: 'browser',
            contactName: 'Test User',
            channel: 'browser',
            status: AiCallStatus.FAILED,
            error: 'ElevenLabs text-to-speech connection closed (code 1008)',
            durationSeconds: 15,
            transcript: [{ role: 'agent', text: 'Hello' }],
            createdAt: new Date('2026-11-23T01:00:00Z'),
            endedAt: new Date('2026-11-23T01:00:15Z'),
          },
        ]),
      }),
    };

    const svcWithRepo = new AiCallingLogService(mockRepo as any);
    const failed = await svcWithRepo.getRecentFailedCalls('b1');
    expect(failed.length).toBe(1);
    expect(failed[0].id).toBe('call-fail-1');
    expect(failed[0].error).toContain('code 1008');
    expect(failed[0].turnsCount).toBe(1);
  });

  it('runs diagnostic check when providers are missing or present', async () => {
    const mockProviders = {
      resolve: jest.fn().mockResolvedValue({
        config: { stt: 'sarvam', ttsGujarati: 'sarvam', ttsHindi: 'sarvam', llm: 'groq' },
        secrets: { SARVAM_API_KEY: 'test-sarvam-key' },
      }),
      twilio: jest.fn().mockResolvedValue(null),
    };

    const svc = new AiCallingLogService(undefined, mockProviders as any);
    const diag = await svc.runDiagnostics();
    expect(diag.items.length).toBeGreaterThan(0);
    const sarvamStt = diag.items.find(i => i.key === 'stt_sarvam');
    expect(sarvamStt?.status).toBe('ok');
    const twilio = diag.items.find(i => i.key === 'telephony_twilio');
    expect(twilio?.status).toBe('warning');
  });

  it('reports recent Twilio debugger alerts when running live diagnostics', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('.json')) {
        return Promise.resolve(new Response(JSON.stringify({ type: 'Trial' }), { status: 200 }));
      }
      if (url.includes('/IncomingPhoneNumbers.json')) {
        return Promise.resolve(new Response(JSON.stringify({ incoming_phone_numbers: [{ sid: 'PN1' }] }), { status: 200 }));
      }
      if (url.includes('/OutgoingCallerIds.json')) {
        return Promise.resolve(new Response(JSON.stringify({ outgoing_caller_ids: [{ sid: 'OC1' }] }), { status: 200 }));
      }
      if (url.includes('/Notifications.json')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              notifications: [{ error_code: '31924', message_text: 'WebSocket error', log: '0' }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const mockProviders = {
      resolve: jest.fn().mockResolvedValue({
        config: { stt: 'deepgram', ttsGujarati: 'elevenlabs', ttsHindi: 'elevenlabs', ttsEnglish: 'elevenlabs', llm: 'groq' },
        secrets: { DEEPGRAM_API_KEY: 'dg', ELEVENLABS_API_KEY: 'el' },
      }),
      twilio: jest.fn().mockResolvedValue({ accountSid: 'AC1', authToken: 'tok', fromNumber: '+15550001111' }),
    };

    const svc = new AiCallingLogService(undefined, mockProviders as any);
    const diag = await svc.runDiagnostics({ live: true });
    fetchSpy.mockRestore();

    expect(diag.items.find(i => i.key === 'telephony_twilio')?.message).toContain('Trial verified');
    expect(diag.items.find(i => i.key === 'twilio_notifications')?.message).toContain('31924');
  });

  it('treats empty Trial phone-number lists as ok instead of false unowned warning', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('.json')) {
        return Promise.resolve(new Response(JSON.stringify({ type: 'Trial' }), { status: 200 }));
      }
      if (url.includes('/IncomingPhoneNumbers.json')) {
        return Promise.resolve(new Response(JSON.stringify({ incoming_phone_numbers: [] }), { status: 200 }));
      }
      if (url.includes('/OutgoingCallerIds.json')) {
        return Promise.resolve(new Response(JSON.stringify({ outgoing_caller_ids: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const mockProviders = {
      resolve: jest.fn().mockResolvedValue({
        config: { stt: 'sarvam', ttsGujarati: 'sarvam', ttsHindi: 'sarvam', llm: 'groq' },
        secrets: { SARVAM_API_KEY: 'test-key' },
      }),
      twilio: jest.fn().mockResolvedValue({ accountSid: 'AC1', authToken: 'tok', fromNumber: '+17372508034' }),
    };

    const svc = new AiCallingLogService(undefined, mockProviders as any);
    const diag = await svc.runDiagnostics({ live: true });
    fetchSpy.mockRestore();

    const twilioItem = diag.items.find(i => i.key === 'telephony_twilio');
    expect(twilioItem?.status).toBe('ok');
    expect(twilioItem?.message).toContain('Twilio Trial connected (+17372508034)');
    expect(twilioItem?.message).toContain('Active Numbers in Twilio Console');
  });

  it('global aiCallingLog singleton delegates correctly', () => {
    aiCallingLog.clear();
    aiCallingLog.warn('config', 'Missing key warning');
    const res = aiCallingLog.query();
    expect(res.total).toBe(1);
    expect(res.events[0].message).toBe('Missing key warning');
  });
});

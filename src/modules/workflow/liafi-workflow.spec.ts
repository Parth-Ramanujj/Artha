import { LIAFI_PRESET_NODES, LIAFI_PRESET_EDGES } from './presets/liafi-padosi-workflow.preset';
import { DataSource, Repository } from 'typeorm';
import { LIAFI_LANGS } from './presets/liafi-translations';
import { ActionType, TriggerType, WorkflowDefinition, WorkflowStatus } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { pickNextEdge, WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';

describe('LIAFI × PadosiAgent preset', () => {
  const ids = new Set(LIAFI_PRESET_NODES.map(n => n.id));
  const actionTypes = new Set<string>([...Object.values(ActionType), 'trigger']);

  it('uses only known node types and unique ids', () => {
    expect(ids.size).toBe(LIAFI_PRESET_NODES.length);
    LIAFI_PRESET_NODES.forEach(n => expect(actionTypes.has(n.type)).toBe(true));
  });

  it('every edge connects existing nodes and every node is reachable', () => {
    LIAFI_PRESET_EDGES.forEach(e => {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    });
    const seen = new Set(['liafi-trg']);
    const queue = ['liafi-trg'];
    while (queue.length) {
      const cur = queue.shift()!;
      LIAFI_PRESET_EDGES.filter(e => e.source === cur && !seen.has(e.target)).forEach(e => {
        seen.add(e.target);
        queue.push(e.target);
      });
    }
    expect([...ids].filter(id => !seen.has(id))).toEqual([]);
  });

  it('every menu choice leads somewhere', () => {
    LIAFI_PRESET_NODES.filter(n => n.type.startsWith('interactive_')).forEach(n => {
      (n.data.config.buttons as Array<{ id: string }>).forEach(b =>
        expect(pickNextEdge(LIAFI_PRESET_EDGES, n.id, b.id)).toBeDefined(),
      );
    });
  });
});

describe('LIAFI translations', () => {
  const translated = LIAFI_PRESET_NODES.filter(n => n.data.config.translations);

  it('every translated node has all 7 languages with no unfilled placeholders', () => {
    expect(translated.length).toBe(9);
    translated.forEach(n => {
      const t = n.data.config.translations as Record<string, Record<string, unknown>>;
      expect(Object.keys(t).sort()).toEqual([...LIAFI_LANGS].sort());
      expect(JSON.stringify(t)).not.toMatch(/\{(name|link|url|sales|support)\}/);
    });
  });

  it('every button label fits WhatsApp’s 20-character limit', () => {
    LIAFI_PRESET_NODES.forEach(n => {
      type WithButtons = { buttons?: Array<{ text: string }> };
      const translations = (n.data.config.translations ?? {}) as Record<string, WithButtons>;
      const all: WithButtons[] = [n.data.config, ...Object.values(translations)];
      all.forEach(c => c.buttons?.forEach(b => expect(b.text.length).toBeLessThanOrEqual(20)));
    });
  });
});

describe('LIAFI flow in the simulator (SQLite)', () => {
  let ds: DataSource;
  let runRepo: Repository<WorkflowRun>;
  let service: WorkflowService;
  let executor: WorkflowExecutor;
  const ctx = (messageBody: string): TriggerContext => ({
    businessId: 'biz',
    sessionId: 'sess',
    chatId: '919876543210@c.us',
    messageBody,
    messageType: 'text',
    metadata: { isTest: true, simulate: true },
  });

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [WorkflowDefinition, WorkflowRun],
      synchronize: true,
    });
    await ds.initialize();
    runRepo = ds.getRepository(WorkflowRun);
    service = new WorkflowService(ds.getRepository(WorkflowDefinition), runRepo, {} as never);
    executor = new WorkflowExecutor(service, undefined, { sendText: jest.fn() } as never);
  });

  afterEach(async () => {
    executor.onModuleDestroy();
    await ds.destroy();
  });

  it('after picking ગુજરાતી the following messages and buttons are Gujarati', async () => {
    const wf = await ds.getRepository(WorkflowDefinition).save({
      businessId: 'biz',
      name: 'LIAFI',
      slug: 'liafi',
      status: WorkflowStatus.PUBLISHED,
      maxConcurrentRuns: 50,
      definition: {
        trigger: { type: TriggerType.KEYWORD_MATCH, config: { keyword: 'hi, liafi' } },
        conditions: [],
        actions: [],
        nodes: LIAFI_PRESET_NODES,
        edges: LIAFI_PRESET_EDGES,
      },
    } as unknown as WorkflowDefinition);
    const run = (await service.createRun(
      wf,
      { isTest: true, simulate: true },
      'sess',
      undefined,
      '919876543210@c.us',
    ))!;
    await executor.execute(wf, run, ctx('hi'));

    const reply = async (text: string) => {
      const current = await runRepo.findOneByOrFail({ id: run.id });
      expect(await executor.resume(wf, current, ctx(text), text)).toBe('resumed');
    };
    await reply('🌐 Change Language');
    await reply('ગુજરાતી');

    const steps = () =>
      runRepo
        .findOneByOrFail({ id: run.id })
        .then(r => r.steps as Array<{ actionId: string; output: Record<string, unknown> }>);
    const out = async (id: string) => (await steps()).find(s => s.actionId === id)?.output ?? {};

    expect(String((await out('liafi-reg-intro')).text)).toContain('ડિજિટલ ઓળખ');
    expect(String((await out('liafi-ask-name')).prompt)).toContain('પૂરું નામ');

    await reply('Ramesh Patel');
    await reply('not-an-email'); // invalid → stays on the email question
    await reply('ramesh@example.com');
    await reply('VJA-01');

    const profile = await out('liafi-profile');
    expect(String(profile.message)).toContain('અભિનંદન Ramesh Patel');
    expect(profile.buttons).toEqual(['પ્રોફાઇલ એક્ટિવ કરો', 'એપ ડાઉનલોડ કરો', 'ગ્રુપમાં જોડાઓ']);
  });
});

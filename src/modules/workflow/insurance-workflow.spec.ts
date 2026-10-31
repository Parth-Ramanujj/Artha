import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentService } from './agent.service';
import { LeadService } from './lead.service';
import { Lead } from './entities/lead.entity';
import { Agent } from './entities/agent.entity';
import { INSURANCE_PRESET_NODES, INSURANCE_PRESET_EDGES } from './presets/insurance-workflow.preset';
import { WorkflowExecutor, TriggerContext } from './workflow-executor.service';
import { WorkflowService } from './workflow.service';
import { MessageService } from '../message/message.service';
import { ActionType, WorkflowAction } from './entities/workflow-definition.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { EngineRegistry } from '../../engine/engine-registry.service';

// runAction is private on the executor; the spec drives actions through it directly.
type RunAction = (action: WorkflowAction, ctx: TriggerContext, run?: WorkflowRun) => Promise<Record<string, unknown>>;
const runAction = (ex: WorkflowExecutor, action: WorkflowAction, ctx: TriggerContext, run?: WorkflowRun) =>
  (ex as unknown as { runAction: RunAction }).runAction(action, ctx, run);

describe('Insurance & Mutual Fund Workflow Integration', () => {
  let agentService: AgentService;
  let leadService: LeadService;
  let executor: WorkflowExecutor;

  // In-memory repositories for testing
  let agentsDb: Agent[] = [];
  let leadsDb: Lead[] = [];

  const mockAgentRepo = {
    count: jest.fn().mockImplementation(() => Promise.resolve(agentsDb.length)),
    find: jest.fn().mockImplementation(() => Promise.resolve(agentsDb)),
    findOne: jest.fn().mockImplementation((query?: { where?: { id?: string } }) => {
      const id = query?.where?.id;
      return Promise.resolve(agentsDb.find(a => a.id === id) || null);
    }),
    create: jest.fn().mockImplementation(<T>(dtos: T) => dtos),
    save: jest.fn().mockImplementation((items: Agent | Agent[]) => {
      const arr = Array.isArray(items) ? items : [items];
      arr.forEach(item => {
        if (!item.id) item.id = `ag_${Date.now()}_${Math.random()}`;
        const existingIdx = agentsDb.findIndex(a => a.id === item.id);
        if (existingIdx >= 0) agentsDb[existingIdx] = item;
        else agentsDb.push(item);
      });
      return Promise.resolve(items);
    }),
    increment: jest.fn().mockImplementation(() => Promise.resolve()),
  };

  const mockLeadRepo = {
    find: jest.fn().mockImplementation(() => Promise.resolve(leadsDb)),
    findOne: jest.fn().mockImplementation((query?: { where?: { businessId?: string; customerPhone?: string } }) => {
      const where = query?.where || {};
      return Promise.resolve(
        leadsDb.find(l => {
          if (where.businessId && l.businessId !== where.businessId) return false;
          if (where.customerPhone && l.customerPhone !== where.customerPhone) return false;
          return true;
        }) || null,
      );
    }),
    create: jest.fn().mockImplementation((dto: Partial<Lead>) => ({
      id: `lead_${Date.now()}`,
      createdAt: new Date(),
      ...dto,
    })),
    save: jest.fn().mockImplementation((lead: Lead) => {
      const idx = leadsDb.findIndex(l => l.id === lead.id);
      if (idx >= 0) leadsDb[idx] = lead;
      else leadsDb.push(lead);
      return Promise.resolve(lead);
    }),
  };

  const mockWorkflowService = {
    updateRunStatus: jest.fn().mockResolvedValue(undefined),
    updateRunTriggerData: jest.fn().mockResolvedValue(undefined),
  };

  const mockMessageService = {
    sendText: jest.fn().mockResolvedValue({ messageId: 'msg-ins-1' }),
  };

  beforeEach(async () => {
    agentsDb = [];
    leadsDb = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        LeadService,
        WorkflowExecutor,
        { provide: getRepositoryToken(Agent, 'data'), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Lead, 'data'), useValue: mockLeadRepo },
        { provide: WorkflowService, useValue: mockWorkflowService },
        { provide: MessageService, useValue: mockMessageService },
      ],
    }).compile();

    agentService = module.get<AgentService>(AgentService);
    leadService = module.get<LeadService>(LeadService);
    executor = module.get<WorkflowExecutor>(WorkflowExecutor);

    // Seed test agents
    await agentService.seedDefaultAgentsIfEmpty();
  });

  describe('Preset Graph Topology & Validation', () => {
    it('should have all required nodes matching the diagram', () => {
      const nodeIds = INSURANCE_PRESET_NODES.map(n => n.id);
      expect(nodeIds).toContain('node-trg');
      expect(nodeIds).toContain('node-welcome');
      expect(nodeIds).toContain('node-main-menu');
      expect(nodeIds).toContain('node-ins-menu');
      expect(nodeIds).toContain('node-ins-categories');
      expect(nodeIds).toContain('node-claim-issues');
      expect(nodeIds).toContain('node-ask-insurer');
      expect(nodeIds).toContain('node-audit-info');
      expect(nodeIds).toContain('node-mf-menu');
      expect(nodeIds).toContain('node-ask-pincode');
      expect(nodeIds).toContain('node-search-agents');
      expect(nodeIds).toContain('node-create-lead');
      expect(nodeIds).toContain('node-confirm');
    });

    it('should have valid edges connecting nodes to pincode collection', () => {
      const targetIds = INSURANCE_PRESET_EDGES.map(e => e.target);
      expect(targetIds).toContain('node-ask-pincode');
      expect(targetIds).toContain('node-search-agents');
      expect(targetIds).toContain('node-create-lead');
    });
  });

  describe('Pincode Validation', () => {
    it('should accept valid 6-digit Indian PIN codes', async () => {
      const ctx: TriggerContext = {
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: '380015',
      };
      const run: WorkflowRun = {
        id: 'run-1',
        triggerData: {},
      } as unknown as WorkflowRun;

      const res = await runAction(
        executor,
        {
          id: 'val-pin',
          type: ActionType.VALIDATE_PINCODE,
          config: { pincode: '380015' },
        },
        ctx,
        run,
      );

      expect(res.isValid).toBe(true);
      expect(res.branch).toBe('pincode_valid');
      expect(res.pincode).toBe('380015');
    });

    it('should reject invalid PIN codes (alphanumeric, short, or leading zero)', async () => {
      const ctx: TriggerContext = {
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        messageBody: '012345',
      };

      const res = await runAction(
        executor,
        {
          id: 'val-pin',
          type: ActionType.VALIDATE_PINCODE,
          config: { pincode: '012345' }, // Leading 0 is invalid in India
        },
        ctx,
      );

      expect(res.isValid).toBe(false);
      expect(res.branch).toBe('invalid_pincode');
    });
  });

  describe('Agent Matching & WhatsApp Profiles', () => {
    it('should match certified advisors for Ahmedabad Pincode 380015', async () => {
      const agents = await agentService.findMatchingAgents('default', {
        pincode: '380015',
        mainService: 'insurance',
        productCategory: 'health_insurance',
        limit: 3,
      });

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].pincodes.some(p => p.includes('380') || p === '*')).toBe(true);
    });

    it('should format profiles with Call Now and WhatsApp links', async () => {
      const agents = await agentService.findMatchingAgents('default', {
        pincode: '380015',
        mainService: 'insurance',
      });

      const message = agentService.formatAgentProfilesMessage(agents, '380015');
      expect(message).toContain('*Call Now:* tel:');
      expect(message).toContain('*Chat on WhatsApp:* https://wa.me/');
      expect(message).toContain('380015');
    });

    it('should provide Pan-India fallback for unknown rural pincodes', async () => {
      const agents = await agentService.findMatchingAgents('default', {
        pincode: '799999', // Unknown remote pincode
        mainService: 'mutual_fund',
      });

      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some(a => a.pincodes.includes('*'))).toBe(true);
    });
  });

  describe('Lead Storage & Idempotency', () => {
    it('should generate unique lead reference number and assign agent', async () => {
      const lead = await leadService.createOrUpdateLead({
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        customerPhone: '919876543210',
        customerName: 'Test Customer',
        mainService: 'insurance',
        selectedService: 'Claim Support',
        claimIssueType: 'Claim Rejected',
        insuranceCompany: 'Star Health',
        pincode: '380015',
      });

      expect(lead).toBeDefined();
      expect(lead.leadNumber).toMatch(/^LD-INS-[0-9A-Z]{10,}$/);
      expect(lead.claimIssueType).toBe('Claim Rejected');
      expect(lead.insuranceCompany).toBe('Star Health');
    });

    it('should prevent duplicate leads within 10-minute retry window', async () => {
      const lead1 = await leadService.createOrUpdateLead({
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        customerPhone: '919876543210',
        mainService: 'mutual_fund',
        selectedService: 'SIP',
        pincode: '380015',
      });

      // Simulated webhook retry 30 seconds later
      const lead2 = await leadService.createOrUpdateLead({
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
        customerPhone: '919876543210',
        mainService: 'mutual_fund',
        selectedService: 'SIP',
        pincode: '380015',
      });

      expect(lead2.id).toBe(lead1.id);
      expect(lead2.leadNumber).toBe(lead1.leadNumber);
      expect(leadsDb.length).toBe(1);
    });
  });

  describe('Interactive Buttons Dispatch (Anti-Poll Audit)', () => {
    it('should NOT send native polls for mode="auto" when buttons are configured', async () => {
      const mockEngine = {
        sendPollMessage: jest.fn().mockResolvedValue({ messageId: 'poll-1' }),
        sendInteractiveButtons: jest.fn().mockResolvedValue({ messageId: 'btn-1' }),
      };

      const mockRegistry = {
        get: jest.fn().mockReturnValue(mockEngine),
      };

      const ctx: TriggerContext = {
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
      };

      const customExecutor = new WorkflowExecutor(
        mockWorkflowService as unknown as WorkflowService,
        undefined,
        mockMessageService as unknown as MessageService,
        undefined,
        mockRegistry as unknown as EngineRegistry,
        agentService,
        leadService,
      );

      const res = await runAction(
        customExecutor,
        {
          id: 'btn-step',
          type: ActionType.INTERACTIVE_BUTTONS,
          config: {
            message: 'Choose option:',
            mode: 'auto',
            buttons: [
              { id: 'btn_ins', text: 'Insurance' },
              { id: 'btn_mf', text: 'Mutual Fund' },
            ],
          },
        },
        ctx,
      );

      // Must call sendInteractiveButtons, NOT sendPollMessage
      expect(mockEngine.sendInteractiveButtons).toHaveBeenCalled();
      expect(mockEngine.sendPollMessage).not.toHaveBeenCalled();
      expect(res.sentVia).toBe('native_buttons');
    });

    it('should cleanly fallback to numbered text menu if native buttons throw, rather than sending a poll', async () => {
      const mockEngineFailing = {
        sendInteractiveButtons: jest.fn().mockRejectedValue(new Error('WhatsApp Web MD buttons unsupported')),
        sendPollMessage: jest.fn().mockResolvedValue({ messageId: 'poll-1' }),
      };

      const mockRegistry = {
        get: jest.fn().mockReturnValue(mockEngineFailing),
      };

      const ctx: TriggerContext = {
        businessId: 'default',
        sessionId: 'sess-1',
        chatId: '919876543210@c.us',
      };

      const customExecutor = new WorkflowExecutor(
        mockWorkflowService as unknown as WorkflowService,
        undefined,
        mockMessageService as unknown as MessageService,
        undefined,
        mockRegistry as unknown as EngineRegistry,
        agentService,
        leadService,
      );

      const res = await runAction(
        customExecutor,
        {
          id: 'btn-step',
          type: ActionType.INTERACTIVE_BUTTONS,
          config: {
            message: 'Choose service:',
            mode: 'auto',
            buttons: [
              { id: 'btn_ins', text: '🛡️ Insurance' },
              { id: 'btn_mf', text: '📈 Mutual Fund' },
            ],
          },
        },
        ctx,
      );

      // Must NOT send poll
      expect(mockEngineFailing.sendPollMessage).not.toHaveBeenCalled();
      // Must fallback to formatted text
      expect(res.sentVia).toBe('formatted_text_menu');
      expect(mockMessageService.sendText).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({
          text: expect.stringContaining('1️⃣  *🛡️ Insurance*') as string,
        }),
      );
    });
  });
});

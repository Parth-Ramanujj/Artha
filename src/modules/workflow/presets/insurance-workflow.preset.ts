import { VisualWorkflowNode, VisualWorkflowEdge, TriggerType } from '../entities/workflow-definition.entity';

export const INSURANCE_PRESET_NODES: VisualWorkflowNode[] = [
  // 1. START TRIGGER
  {
    id: 'node-trg',
    type: 'trigger',
    position: { x: 500, y: 50 },
    data: {
      label: 'WhatsApp Message Trigger',
      config: {
        triggerType: 'keyword_match',
        keyword: 'hi, hello, start, insurance, mutual fund, claim, sip, policy, artha, namaste',
      },
    },
  },

  // 2. WELCOME MESSAGE
  {
    id: 'node-welcome',
    type: 'send_message',
    position: { x: 500, y: 200 },
    data: {
      label: 'Welcome Greeting',
      config: {
        message:
          '👋 *Welcome to Artha Insurance & Mutual Fund Advisory!* 🛡️📈\n\n' +
          'How can we help you today?\n\n' +
          'Please select a service below to get instant guidance and connect with certified advisors in your area.',
      },
    },
  },

  // 3. MAIN SERVICE SELECTION (Insurance vs Mutual Fund)
  {
    id: 'node-main-menu',
    type: 'interactive_buttons',
    position: { x: 500, y: 350 },
    data: {
      label: 'Main Service Selection',
      config: {
        message: 'Please choose your primary interest:',
        buttons: [
          { id: 'btn_insurance', text: '🛡️ Insurance' },
          { id: 'btn_mutual_fund', text: '📈 Mutual Fund' },
        ],
      },
    },
  },

  // ── INSURANCE BRANCH ──

  // 4. Insurance Main Options: Buy/Port/Renew | Claim Support | Insurance Audit
  {
    id: 'node-ins-menu',
    type: 'interactive_buttons',
    position: { x: 250, y: 520 },
    data: {
      label: 'Insurance Services',
      config: {
        message: 'Select the insurance service you need:',
        buttons: [
          { id: 'btn_buy_port_renew', text: '🛒 Buy / Port / Renew' },
          { id: 'btn_claim_support', text: '⚖️ Claim Support' },
          { id: 'btn_insurance_audit', text: '📋 Insurance Audit' },
        ],
      },
    },
  },

  // 5. Buy / Port / Renew Category Selection: Life, Health, Motor, SME
  {
    id: 'node-ins-categories',
    type: 'interactive_buttons',
    position: { x: 80, y: 700 },
    data: {
      label: 'Insurance Categories',
      config: {
        message: 'Please select the insurance category:',
        buttons: [
          { id: 'btn_cat_life', text: '👨‍👩‍👧 Life Insurance' },
          { id: 'btn_cat_health', text: '🏥 Health Insurance' },
          { id: 'btn_cat_motor', text: '🚗 Motor Insurance' },
        ],
      },
    },
  },

  // 6. Sub-Product for Life
  {
    id: 'node-sub-life',
    type: 'interactive_buttons',
    position: { x: -160, y: 880 },
    data: {
      label: 'Life Sub-Products',
      config: {
        message: 'Choose Life Insurance Plan:',
        buttons: [
          { id: 'btn_sub_term', text: 'Term Life Cover' },
          { id: 'btn_sub_endowment', text: 'Savings / Endowment' },
          { id: 'btn_sub_pension', text: 'Retirement Pension' },
        ],
      },
    },
  },

  // 7. Sub-Product for Health
  {
    id: 'node-sub-health',
    type: 'interactive_buttons',
    position: { x: 80, y: 880 },
    data: {
      label: 'Health Sub-Products',
      config: {
        message: 'Choose Health Insurance Plan:',
        buttons: [
          { id: 'btn_sub_floater', text: 'Family Floater' },
          { id: 'btn_sub_senior', text: 'Senior Citizen Cover' },
          { id: 'btn_sub_critical', text: 'Critical Illness 1Cr' },
        ],
      },
    },
  },

  // 8. Sub-Product for Motor & SME
  {
    id: 'node-sub-motor',
    type: 'interactive_buttons',
    position: { x: 320, y: 880 },
    data: {
      label: 'Motor / SME Sub-Products',
      config: {
        message: 'Choose Vehicle or Business Plan:',
        buttons: [
          { id: 'btn_sub_car', text: 'Car Comprehensive' },
          { id: 'btn_sub_bike', text: 'Two-Wheeler Cover' },
          { id: 'btn_sub_sme', text: 'Shop & Commercial Fleet' },
        ],
      },
    },
  },

  // 9. Claim Support Issues: Rejected, Short Settled, Delay, Miss Selling
  {
    id: 'node-claim-issues',
    type: 'interactive_buttons',
    position: { x: 500, y: 700 },
    data: {
      label: 'Claim Support Issue',
      config: {
        message: 'What issue are you facing with your insurance claim?',
        buttons: [
          { id: 'btn_claim_rejected', text: '❌ Claim Rejected' },
          { id: 'btn_claim_short_settled', text: '📉 Short-Settled' },
          { id: 'btn_claim_delayed', text: '⏳ Claim Delayed' },
        ],
      },
    },
  },

  // 10. Ask Insurance Company Name (Text Input)
  {
    id: 'node-ask-insurer',
    type: 'ask_question',
    position: { x: 500, y: 880 },
    data: {
      label: 'Type Insurer Name',
      config: {
        slot: 'insuranceCompany',
        question:
          '🏢 Please type the name of your Insurance Company (e.g. Star Health, HDFC ERGO, Care Health, LIC, ICICI Lombard):',
      },
    },
  },

  // 11. Insurance Audit Info
  {
    id: 'node-audit-info',
    type: 'send_message',
    position: { x: 740, y: 700 },
    data: {
      label: 'Insurance Audit Overview',
      config: {
        message:
          '📋 *Free 360° Policy Audit*\n\n' +
          'Our certified IRDAI advisors will review your existing policy wordings for hidden exclusions, optimal sum insured, room rent capping, and lower premium options with zero fees.',
      },
    },
  },

  // ── MUTUAL FUND BRANCH ──

  // 12. Mutual Fund Options: SIP/STP/SWP | Lumpsum | ELSS | Bonds/NPS/AIF
  {
    id: 'node-mf-menu',
    type: 'interactive_buttons',
    position: { x: 920, y: 520 },
    data: {
      label: 'Mutual Fund & Investments',
      config: {
        message: 'Select your preferred investment service:',
        buttons: [
          { id: 'btn_sip_stp_swp', text: '🔄 SIP / STP / SWP' },
          { id: 'btn_lumpsum', text: '💰 Lumpsum Investment' },
          { id: 'btn_elss_tax', text: '🏷️ ELSS Tax Saving' },
        ],
      },
    },
  },

  // 13. Additional Investment Options (Bonds, NPS, AIF/PMS)
  {
    id: 'node-mf-advanced',
    type: 'interactive_buttons',
    position: { x: 1140, y: 700 },
    data: {
      label: 'Wealth & Pension',
      config: {
        message: 'Explore wealth creation options:',
        buttons: [
          { id: 'btn_bonds', text: '🏛️ Fixed Income Bonds' },
          { id: 'btn_nps', text: '👴 NPS Pension' },
          { id: 'btn_aif_pms', text: '💼 AIF / PMS Portfolio' },
        ],
      },
    },
  },

  // ── CONVERGENCE: PINCODE, MATCHING AGENTS & LEAD CREATION ──

  // 14. Enter Residence Pincode (with Indian 6-digit regex validation)
  {
    id: 'node-ask-pincode',
    type: 'ask_question',
    position: { x: 500, y: 1120 },
    data: {
      label: 'Enter Residence Pincode',
      config: {
        slot: 'pincode',
        validation: 'pincode',
        question:
          '📍 Please enter your 6-digit residential area Pincode (e.g. 380015) so we can find verified advisors near you:',
        prompt:
          '📍 Please enter your 6-digit residential area Pincode (e.g. 380015) so we can find verified advisors near you:',
        message:
          '📍 Please enter your 6-digit residential area Pincode (e.g. 380015) so we can find verified advisors near you:',
        retryPrompt: '⚠️ Invalid format. Please enter a valid 6-digit Indian Pincode (e.g. 380015):',
        maxRetries: 3,
      },
    },
  },

  // 15. Search Matching Agents (Outputs top 3 certified advisors with Call Now & WhatsApp links)
  {
    id: 'node-search-agents',
    type: 'search_agents',
    position: { x: 500, y: 1300 },
    data: {
      label: 'Search 3 Matching Advisors',
      config: {
        pincode: '{{steps.node-ask-pincode.answer}}',
        // The main-menu choice (btn_insurance / btn_mutual_fund) decides which advisors are matched.
        mainService: '{{steps.node-main-menu.choice}}',
        limit: 3,
        sendDirectMessage: true,
      },
    },
  },

  // 16. Create Lead Record & Assign Advisor
  {
    id: 'node-create-lead',
    type: 'create_lead',
    position: { x: 500, y: 1480 },
    data: {
      label: 'Record Lead & Assign',
      config: {
        customerPhone: '{{trigger.phone}}',
        // Only the menus the customer passed through have a choice; the rest resolve to ''.
        mainService: '{{steps.node-main-menu.choice}}',
        selectedService: '{{steps.node-ins-menu.choice}}{{steps.node-mf-menu.choice}}',
        productCategory: '{{steps.node-ins-categories.choice}}',
        subProduct: '{{steps.node-sub-life.choice}}{{steps.node-sub-health.choice}}{{steps.node-sub-motor.choice}}',
        claimIssueType: '{{steps.node-claim-issues.choice}}',
        pincode: '{{steps.node-ask-pincode.answer}}',
      },
    },
  },

  // 17. Final Confirmation & Next Steps
  {
    id: 'node-confirm',
    type: 'send_message',
    position: { x: 500, y: 1650 },
    data: {
      label: 'Confirmation Message',
      config: {
        message:
          '✅ *Advisory Request Registered!* (Ref: *{{steps.node-create-lead.leadNumber}}*)\n\n' +
          'Your request has been routed to our certified advisory desk. You can tap on any advisor’s profile above to connect immediately via Call or WhatsApp.\n\n' +
          'Reply *Hi* anytime to start a new inquiry.',
      },
    },
  },
];

export const INSURANCE_PRESET_EDGES: VisualWorkflowEdge[] = [
  // Trigger -> Welcome
  { id: 'e-trg-welcome', source: 'node-trg', target: 'node-welcome' },

  // Welcome -> Main Menu
  { id: 'e-welcome-main', source: 'node-welcome', target: 'node-main-menu' },

  // Main Menu: btn_insurance -> Insurance Services Menu
  { id: 'e-main-ins', source: 'node-main-menu', sourceHandle: 'btn_insurance', target: 'node-ins-menu' },

  // Main Menu: btn_mutual_fund -> Mutual Fund Menu
  { id: 'e-main-mf', source: 'node-main-menu', sourceHandle: 'btn_mutual_fund', target: 'node-mf-menu' },

  // Insurance Menu: btn_buy_port_renew -> Insurance Categories
  { id: 'e-ins-buy', source: 'node-ins-menu', sourceHandle: 'btn_buy_port_renew', target: 'node-ins-categories' },

  // Insurance Menu: btn_claim_support -> Claim Issues
  { id: 'e-ins-claim', source: 'node-ins-menu', sourceHandle: 'btn_claim_support', target: 'node-claim-issues' },

  // Insurance Menu: btn_insurance_audit -> Audit Overview
  { id: 'e-ins-audit', source: 'node-ins-menu', sourceHandle: 'btn_insurance_audit', target: 'node-audit-info' },

  // Categories -> Sub-products
  { id: 'e-cat-life', source: 'node-ins-categories', sourceHandle: 'btn_cat_life', target: 'node-sub-life' },
  { id: 'e-cat-health', source: 'node-ins-categories', sourceHandle: 'btn_cat_health', target: 'node-sub-health' },
  { id: 'e-cat-motor', source: 'node-ins-categories', sourceHandle: 'btn_cat_motor', target: 'node-sub-motor' },

  // Sub-products -> Enter Pincode
  { id: 'e-life-pin', source: 'node-sub-life', target: 'node-ask-pincode' },
  { id: 'e-health-pin', source: 'node-sub-health', target: 'node-ask-pincode' },
  { id: 'e-motor-pin', source: 'node-sub-motor', target: 'node-ask-pincode' },

  // Claim Issues -> Type Insurer Name
  {
    id: 'e-claim-insurer-1',
    source: 'node-claim-issues',
    sourceHandle: 'btn_claim_rejected',
    target: 'node-ask-insurer',
  },
  {
    id: 'e-claim-insurer-2',
    source: 'node-claim-issues',
    sourceHandle: 'btn_claim_short_settled',
    target: 'node-ask-insurer',
  },
  {
    id: 'e-claim-insurer-3',
    source: 'node-claim-issues',
    sourceHandle: 'btn_claim_delayed',
    target: 'node-ask-insurer',
  },

  // Type Insurer Name -> Enter Pincode
  { id: 'e-insurer-pin', source: 'node-ask-insurer', target: 'node-ask-pincode' },

  // Audit Info -> Enter Pincode
  { id: 'e-audit-pin', source: 'node-audit-info', target: 'node-ask-pincode' },

  // Mutual Fund Menu -> Enter Pincode or Advanced Wealth
  { id: 'e-mf-pin-1', source: 'node-mf-menu', sourceHandle: 'btn_sip_stp_swp', target: 'node-ask-pincode' },
  { id: 'e-mf-pin-2', source: 'node-mf-menu', sourceHandle: 'btn_lumpsum', target: 'node-ask-pincode' },
  { id: 'e-mf-pin-3', source: 'node-mf-menu', sourceHandle: 'btn_elss_tax', target: 'node-ask-pincode' },

  // Advanced Wealth -> Enter Pincode
  { id: 'e-mf-adv-pin', source: 'node-mf-advanced', target: 'node-ask-pincode' },

  // Enter Pincode -> Search Agents
  { id: 'e-pin-search', source: 'node-ask-pincode', target: 'node-search-agents' },

  // Search Agents -> Create Lead
  { id: 'e-search-lead', source: 'node-search-agents', target: 'node-create-lead' },

  // Create Lead -> Final Confirmation
  { id: 'e-lead-confirm', source: 'node-create-lead', target: 'node-confirm' },
];

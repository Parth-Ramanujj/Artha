import { useState } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Split,
  Clock,
  Bot,
  UserCheck,
  Tag,
  Globe,
  Search,
  Paperclip,
  Filter,
  Sliders,
  StopCircle,
  Table,
  Contact,
  BellRing,
  GitFork,
  Calculator,
  CreditCard,
  ScanText,
  LayoutGrid,
  Shield,
  MapPin,
  Palette,
  FileText,
} from 'lucide-react';
import type { CanvasNodeType, NodeConfig, NodePaletteItem } from './types';

interface NodePaletteProps {
  onAddNode: (type: CanvasNodeType, defaultConfig: NodeConfig, label: string) => void;
}

export const PALETTE_ITEMS: NodePaletteItem[] = [
  {
    type: 'send_studio_message',
    title: 'Studio Message',
    category: 'message',
    description: 'Send a saved Message Studio message — buttons and lists branch the flow',
    iconName: 'studio',
    defaultConfig: { studioMessageId: '', waitForReply: true, timeoutMinutes: 60 },
  },
  {
    type: 'send_whatsapp_form',
    title: 'WhatsApp Form',
    category: 'message',
    description: 'Send a published WhatsApp Form and use the answers as variables, e.g. {{full_name}}',
    iconName: 'form',
    defaultConfig: { formId: '', formName: '', bodyText: '', waitForSubmit: true, timeoutMinutes: 1440 },
  },
  {
    type: 'send_message',
    title: 'Send Message',
    category: 'message',
    description: 'Send text with variables like {{contact.name}}',
    iconName: 'message',
    defaultConfig: {
      message: 'Hello! Thanks for reaching out to us.',
    },
  },
  {
    type: 'interactive_buttons',
    title: 'Interactive Buttons',
    category: 'message',
    description: 'WhatsApp poll or numbered menu with branched ports',
    iconName: 'layers',
    defaultConfig: {
      message: 'Please choose from the options below:',
      mode: 'auto',
      timeoutMinutes: 60,
      buttons: [
        { id: 'opt_1', text: 'Pricing & Plans' },
        { id: 'opt_2', text: 'Book Demo / Consultation' },
        { id: 'opt_3', text: 'Talk to Support' },
      ],
    },
  },
  {
    type: 'ask_question',
    title: 'Ask Question (Capture)',
    category: 'message',
    description: 'Capture email, phone, or number with auto-validation',
    iconName: 'help',
    defaultConfig: {
      prompt: 'Please enter your work email address:',
      slot: 'email',
      validation: 'email',
      retryPrompt: 'That does not look like a valid email. Please try again (e.g. name@company.com):',
      maxRetries: 3,
      timeoutMinutes: 60,
    },
  },
  {
    type: 'condition_branch',
    title: 'If / Else Branch',
    category: 'logic',
    description: 'Branch flow based on contact tags, status, or captured vars',
    iconName: 'split',
    defaultConfig: {
      field: 'tag',
      operator: 'contains',
      value: 'vip',
    },
  },
  {
    type: 'wait',
    title: 'Delay / Timer',
    category: 'logic',
    description: 'Pause execution for seconds, minutes, or hours',
    iconName: 'clock',
    defaultConfig: {
      seconds: 300,
    },
  },
  {
    type: 'schedule_followup',
    title: 'WhatsApp Reminder',
    category: 'action',
    description: 'Send a WhatsApp message later (minutes, hours or days from now)',
    iconName: 'clock',
    defaultConfig: {
      delayMinutes: 60,
      message: 'Reminder: {{steps.last.reply}}',
    },
  },
  {
    type: 'ai_assistant',
    title: 'AI Assistant',
    category: 'ai',
    description: 'Groq LLM / Vector RAG response with confidence check',
    iconName: 'bot',
    defaultConfig: {
      systemPrompt: 'You are an intelligent customer support assistant. Answer helpfully and concisely.',
      useKnowledgeBase: true,
      enableHandoff: true,
      temperature: 0.3,
    },
  },
  {
    type: 'ai_assistant',
    title: 'AI Summary (silent)',
    category: 'ai',
    description: 'Summarize data with AI without replying; use the reply in a later message or email',
    iconName: 'bot',
    defaultConfig: {
      sendReply: false,
      systemPrompt: 'Summarize the data clearly and briefly for a busy business owner. Use short bullet points.',
      prompt: 'Summarize this data:\n\n{{steps.last.rowsText}}',
    },
  },
  {
    type: 'handoff_to_human',
    title: 'Human Handoff',
    category: 'ai',
    description: 'Transfer chat to human agent in Live Inbox',
    iconName: 'usercheck',
    defaultConfig: {
      assignedName: 'Support Team',
      status: 'pending',
    },
  },
  {
    type: 'add_tag',
    title: 'Add Contact Tag',
    category: 'action',
    description: 'Attach a lead or customer segment tag to contact',
    iconName: 'tag',
    defaultConfig: {
      tag: 'qualified-lead',
    },
  },
  {
    type: 'webhook_call',
    title: 'Webhook / API Call',
    category: 'action',
    description: 'Post captured data to external CRM or backend URL',
    iconName: 'globe',
    defaultConfig: {
      url: 'https://api.yourcrm.com/leads',
      method: 'POST',
      payload: {},
    },
  },
  {
    type: 'send_media',
    title: 'Send Media',
    category: 'message',
    description: 'Send image, PDF document, or audio with caption',
    iconName: 'paperclip',
    defaultConfig: {
      mediaType: 'image',
      url: '',
      caption: '',
    },
  },
  {
    type: 'filter',
    title: 'Filter',
    category: 'logic',
    description: 'Continue workflow only if condition is met',
    iconName: 'filter',
    defaultConfig: {
      field: 'trigger.message',
      operator: 'contains',
      value: '',
    },
  },
  {
    type: 'stop_workflow',
    title: 'Stop Workflow',
    category: 'logic',
    description: 'Terminate workflow execution immediately',
    iconName: 'stop',
    defaultConfig: {
      reason: 'Workflow finished',
    },
  },
  {
    type: 'set_fields',
    title: 'Set Fields / Variables',
    category: 'action',
    description: 'Assign custom variables or transform values',
    iconName: 'sliders',
    defaultConfig: {
      assignments: [{ name: 'leadScore', value: '10' }],
    },
  },
  {
    type: 'sheets_lookup',
    title: 'Sheets Lookup & Reply',
    category: 'action',
    description: 'Find the customer’s row in a Google Sheet and send it back on WhatsApp',
    iconName: 'table',
    defaultConfig: {
      integrationId: '',
      spreadsheetId: '',
      sheetName: '',
      keyColumn: '',
      keyValue: '',
      replyTemplate: '{{row}}',
      notFoundMessage: 'Sorry, we could not find your details. Please check the number and try again.',
    },
  },
  {
    type: 'sheets_lookup',
    title: 'Read Sheet for AI Summary',
    category: 'action',
    description: 'Read every row of a Google Sheet tab, ready for an AI summary',
    iconName: 'table',
    defaultConfig: { integrationId: '', spreadsheetId: '', sheetName: '', mode: 'all', replyTemplate: '' },
  },
  {
    type: 'google_sheets',
    title: 'Google Sheets',
    category: 'action',
    description: 'Append or sync rows to a Google Spreadsheet webhook',
    iconName: 'table',
    defaultConfig: {
      webhookUrl: '',
      columns: {
        Phone: '{{trigger.phone}}',
        Message: '{{trigger.message}}',
        Date: '{{now}}',
      },
    },
  },
  {
    type: 'search_agents',
    title: 'Match Advisors',
    category: 'action',
    description: 'Find certified advisors by Pincode & service with Call & WhatsApp links',
    iconName: 'usercheck',
    defaultConfig: {
      pincode: '{{customer_pincode.value}}',
      mainService: 'insurance',
      limit: 3,
      sendDirectMessage: true,
    },
  },
  {
    type: 'create_lead',
    title: 'Create & Assign Lead',
    category: 'action',
    description: 'Create an insurance/investment lead and assign the matched advisor',
    iconName: 'shield',
    defaultConfig: {
      customerPhone: '{{trigger.phone}}',
      mainService: 'insurance',
      selectedService: 'WhatsApp Interactive Flow',
    },
  },
  {
    type: 'validate_pincode',
    title: 'Validate Pincode',
    category: 'logic',
    description: 'Verify 6-digit Indian PIN code and branch on validity',
    iconName: 'map-pin',
    defaultConfig: {
      pincode: '{{last.answer}}',
    },
  },
  {
    type: 'send_contact_vcard',
    title: 'Send Contact vCard',
    category: 'message',
    description: 'Send native WhatsApp Contact Card (.vcf) with 1-click Save button',
    iconName: 'vcard',
    defaultConfig: {
      displayName: '{{steps.search_agents.primaryAgent.name}}',
      phoneNumber: '{{steps.search_agents.primaryAgent.phone}}',
      organization: 'PadosiAgent Advisor Network',
      title: 'Senior Certified Advisor',
    },
  },
  {
    type: 'working_hours_gateway',
    title: 'Working Hours Gateway',
    category: 'logic',
    description: 'Evaluate timezone and branch into OPEN vs CLOSED office hours',
    iconName: 'schedule',
    defaultConfig: {
      timezone: 'Asia/Kolkata',
      openTime: '09:00',
      closeTime: '20:00',
      workingDays: [1, 2, 3, 4, 5, 6],
    },
  },
  {
    type: 'internal_alert',
    title: 'Notify Team (WhatsApp / Email)',
    category: 'action',
    description: 'Instant lead alert message sent to sales manager or advisor phone',
    iconName: 'bell',
    defaultConfig: {
      recipientPhone: '',
      templateMessage:
        '🚨 *NEW LEAD ALERT!*\n\n👤 *Name:* {{trigger.contactName}}\n📍 *Pincode:* {{steps.last.pincode || trigger.message}}\n📱 *Phone:* {{trigger.phone}}\n\n👉 *Call:* tel:{{trigger.phone}}\n👉 *Chat:* https://wa.me/{{trigger.phone}}',
    },
  },
  {
    type: 'internal_alert',
    title: 'Send Email',
    category: 'action',
    description: 'Email a message (e.g. an AI summary) through your Gmail or SMTP connection',
    iconName: 'bell',
    defaultConfig: {
      recipientPhone: '',
      emailTo: '',
      emailIntegrationId: '',
      emailSubject: 'WhatsApp update',
      templateMessage: '{{steps.last.reply}}',
    },
  },
  {
    type: 'ab_test_split',
    title: 'A/B Split Testing',
    category: 'logic',
    description: 'Hash-based split (50/50) across Variant A and Variant B branches',
    iconName: 'gitfork',
    defaultConfig: {
      splitRatio: 50,
    },
  },
  {
    type: 'financial_calculator',
    title: 'Financial Calculator',
    category: 'action',
    description: 'Live in-chat SIP, Loan EMI, or Lumpsum maturity calculation',
    iconName: 'calculator',
    defaultConfig: {
      mode: 'SIP',
      monthlyInvestment: '5000',
      durationYears: '15',
      expectedReturnRate: '13.5',
    },
  },
  {
    type: 'payment_link',
    title: 'UPI / Payment Link',
    category: 'action',
    description: 'Send UPI Deep Link / QR or Razorpay Payment checkout to chat',
    iconName: 'creditcard',
    defaultConfig: {
      provider: 'UPI',
      amount: '299',
      description: 'Expert Policy Audit & Consultation',
      payeeVpa: 'paytmqr.advisor@paytm',
      payeeName: 'PadosiAgent Consultation',
    },
  },
  {
    type: 'ai_document_ocr',
    title: 'AI Document OCR',
    category: 'ai',
    description: 'Extract policy number, vehicle number, and dates from image/PDF',
    iconName: 'ocr',
    defaultConfig: {
      documentType: 'POLICY',
      imageUrl: '',
    },
  },
  {
    type: 'send_carousel_template',
    title: 'Carousel Cards Slider',
    category: 'message',
    description: 'Send horizontal swipe cards (Cloud API) or sequential cards (WWJS)',
    iconName: 'carousel',
    defaultConfig: {
      cards: [
        { title: 'Advisor 1', description: '20+ Yrs Exp | LIC & Health', phone: '919876543210' },
        { title: 'Advisor 2', description: '15+ Yrs Exp | Term & Mutual Funds', phone: '919876543211' },
      ],
    },
  },
];

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredItems = PALETTE_ITEMS.filter(item => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'message':
        return <MessageSquare size={16} className="text-primary" />;
      case 'studio':
        return <Palette size={16} className="text-primary" />;
      case 'form':
        return <FileText size={16} className="text-primary" />;
      case 'paperclip':
        return <Paperclip size={16} className="text-primary" />;
      case 'layers':
      case 'carousel':
        return <LayoutGrid size={16} className="text-info" />;
      case 'help':
        return <HelpCircle size={16} className="text-warning" />;
      case 'split':
        return <Split size={16} className="text-purple" />;
      case 'gitfork':
        return <GitFork size={16} className="text-purple" />;
      case 'filter':
        return <Filter size={16} className="text-purple" />;
      case 'stop':
        return <StopCircle size={16} className="text-danger" />;
      case 'clock':
      case 'schedule':
        return <Clock size={16} className="text-orange" />;
      case 'bot':
        return <Bot size={16} className="text-emerald" />;
      case 'ocr':
        return <ScanText size={16} className="text-emerald" />;
      case 'usercheck':
        return <UserCheck size={16} className="text-blue" />;
      case 'vcard':
        return <Contact size={16} className="text-emerald" />;
      case 'bell':
        return <BellRing size={16} className="text-danger" />;
      case 'calculator':
        return <Calculator size={16} className="text-cyan" />;
      case 'creditcard':
        return <CreditCard size={16} className="text-purple" />;
      case 'tag':
        return <Tag size={16} className="text-amber" />;
      case 'sliders':
        return <Sliders size={16} className="text-indigo" />;
      case 'globe':
        return <Globe size={16} className="text-cyan" />;
      case 'table':
        return <Table size={16} className="text-emerald" />;
      case 'shield':
        return <Shield size={16} className="text-blue" />;
      case 'map-pin':
        return <MapPin size={16} className="text-red" />;
      default:
        return <MessageSquare size={16} />;
    }
  };

  const onDragStart = (event: React.DragEvent, item: NodePaletteItem) => {
    event.dataTransfer.setData('application/reactflow/type', item.type);
    event.dataTransfer.setData('application/reactflow/title', item.title);
    event.dataTransfer.setData('application/reactflow/config', JSON.stringify(item.defaultConfig));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="wf-palette-container">
      <div className="wf-palette-header">
        <h3 className="wf-palette-title">Node Toolbox</h3>
        <p className="wf-palette-sub">Click or drag nodes onto canvas</p>
      </div>

      <div className="wf-palette-search">
        <Search size={14} className="wf-search-icon" />
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="wf-palette-search-input"
        />
      </div>

      <div className="wf-palette-tabs">
        <button
          className={`wf-cat-tab ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          All
        </button>
        <button
          className={`wf-cat-tab ${selectedCategory === 'message' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('message')}
        >
          Messages
        </button>
        <button
          className={`wf-cat-tab ${selectedCategory === 'logic' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('logic')}
        >
          Logic
        </button>
        <button
          className={`wf-cat-tab ${selectedCategory === 'ai' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('ai')}
        >
          AI
        </button>
        <button
          className={`wf-cat-tab ${selectedCategory === 'action' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('action')}
        >
          Actions
        </button>
      </div>

      <div className="wf-palette-items-list">
        {filteredItems.map(item => (
          <div
            key={`${item.type}-${item.title}`}
            className="wf-palette-card"
            draggable
            onDragStart={e => onDragStart(e, item)}
            onClick={() => onAddNode(item.type, item.defaultConfig, item.title)}
            role="button"
            tabIndex={0}
          >
            <div className="wf-palette-card-icon">{getIcon(item.iconName)}</div>
            <div className="wf-palette-card-content">
              <span className="wf-palette-card-title">{item.title}</span>
              <p className="wf-palette-card-desc">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

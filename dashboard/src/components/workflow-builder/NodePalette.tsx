import { useState } from 'react';
import {
  MessageSquare,
  Layers,
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
} from 'lucide-react';
import type { CanvasNodeType, NodePaletteItem } from './types';

interface NodePaletteProps {
  onAddNode: (type: CanvasNodeType, defaultConfig: Record<string, any>, label: string) => void;
}

const PALETTE_ITEMS: NodePaletteItem[] = [
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
      assignments: [
        { name: 'leadScore', value: '10' },
      ],
    },
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
      case 'paperclip':
        return <Paperclip size={16} className="text-primary" />;
      case 'layers':
        return <Layers size={16} className="text-info" />;
      case 'help':
        return <HelpCircle size={16} className="text-warning" />;
      case 'split':
        return <Split size={16} className="text-purple" />;
      case 'filter':
        return <Filter size={16} className="text-purple" />;
      case 'stop':
        return <StopCircle size={16} className="text-danger" />;
      case 'clock':
        return <Clock size={16} className="text-orange" />;
      case 'bot':
        return <Bot size={16} className="text-emerald" />;
      case 'usercheck':
        return <UserCheck size={16} className="text-blue" />;
      case 'tag':
        return <Tag size={16} className="text-amber" />;
      case 'sliders':
        return <Sliders size={16} className="text-indigo" />;
      case 'globe':
        return <Globe size={16} className="text-cyan" />;
      case 'table':
        return <Table size={16} className="text-emerald" />;
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
            key={item.type}
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

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: Array<{
    id: string;
    type: string;
    data: {
      label: string;
      config: Record<string, any>;
    };
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
  }>;
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'lead_qualification_bot',
    name: 'Interactive Lead Qualification & Capture',
    category: 'Sales & Marketing',
    description: 'Welcome menu with interactive buttons, email & phone slot capture, and automatic CRM lead tagging.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Keyword Match',
          config: {
            triggerType: 'keyword_match',
            keyword: 'hi, hello, info, start, price',
            workingHoursOnly: false,
          },
        },
        position: { x: 300, y: 50 },
      },
      {
        id: 'node-welcome',
        type: 'send_message',
        data: {
          label: 'Welcome Greeting',
          config: {
            message: '👋 Welcome to our WhatsApp service! Thanks for reaching out.',
          },
        },
        position: { x: 300, y: 220 },
      },
      {
        id: 'node-menu',
        type: 'interactive_buttons',
        data: {
          label: 'Main Action Menu',
          config: {
            message: 'How can our team help you today?',
            mode: 'auto',
            timeoutMinutes: 60,
            buttons: [
              { id: 'btn_pricing', text: 'Pricing & Plans' },
              { id: 'btn_demo', text: 'Book Consultation' },
              { id: 'btn_support', text: 'Talk to Support' },
            ],
          },
        },
        position: { x: 300, y: 390 },
      },
      {
        id: 'node-pricing-info',
        type: 'send_message',
        data: {
          label: 'Send Pricing Details',
          config: {
            message: '💼 Our pricing plans start at $29/mo with full WhatsApp API features. View full details here: https://example.com/pricing',
          },
        },
        position: { x: 30, y: 640 },
      },
      {
        id: 'node-ask-email',
        type: 'ask_question',
        data: {
          label: 'Capture Business Email',
          config: {
            prompt: 'Great! Please provide your business email so we can send the meeting link:',
            slot: 'email',
            validation: 'email',
            retryPrompt: 'Please enter a valid email address (e.g. name@company.com):',
            maxRetries: 3,
            timeoutMinutes: 60,
          },
        },
        position: { x: 330, y: 640 },
      },
      {
        id: 'node-ask-phone',
        type: 'ask_question',
        data: {
          label: 'Capture Phone Number',
          config: {
            prompt: 'Please provide your direct contact number with country code:',
            slot: 'phone',
            validation: 'phone',
            retryPrompt: 'Please enter a valid phone number with country code (e.g. +1...):',
            maxRetries: 3,
            timeoutMinutes: 60,
          },
        },
        position: { x: 330, y: 880 },
      },
      {
        id: 'node-tag-lead',
        type: 'add_tag',
        data: {
          label: 'Tag as Hot Lead',
          config: {
            tag: 'hot-lead',
          },
        },
        position: { x: 330, y: 1100 },
      },
      {
        id: 'node-confirm',
        type: 'send_message',
        data: {
          label: 'Meeting Confirmation',
          config: {
            message: '🎉 Thank you! Your consultation has been requested. Our team will contact you shortly.',
          },
        },
        position: { x: 330, y: 1240 },
      },
      {
        id: 'node-handoff',
        type: 'handoff_to_human',
        data: {
          label: 'Transfer to Support',
          config: {
            assignedName: 'Customer Support Team',
            status: 'pending',
          },
        },
        position: { x: 670, y: 640 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-welcome', sourceHandle: 'out' },
      { id: 'e2', source: 'node-welcome', target: 'node-menu', sourceHandle: 'out' },
      { id: 'e3', source: 'node-menu', target: 'node-pricing-info', sourceHandle: 'btn_pricing' },
      { id: 'e4', source: 'node-menu', target: 'node-ask-email', sourceHandle: 'btn_demo' },
      { id: 'e5', source: 'node-menu', target: 'node-handoff', sourceHandle: 'btn_support' },
      { id: 'e6', source: 'node-ask-email', target: 'node-ask-phone', sourceHandle: 'default' },
      { id: 'e7', source: 'node-ask-phone', target: 'node-tag-lead', sourceHandle: 'default' },
      { id: 'e8', source: 'node-tag-lead', target: 'node-confirm', sourceHandle: 'out' },
    ],
  },
  {
    id: 'ai_hybrid_support',
    name: 'Hybrid AI Assistant & Human Handoff',
    category: 'Support & AI',
    description: 'Groq LLM and vector RAG auto-answers incoming questions with seamless handoff if requested.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Any Message',
          config: {
            triggerType: 'message_received',
            workingHoursOnly: false,
          },
        },
        position: { x: 280, y: 50 },
      },
      {
        id: 'node-ai',
        type: 'ai_assistant',
        data: {
          label: 'Groq RAG Assistant',
          config: {
            systemPrompt: 'You are an intelligent customer support assistant. Answer accurately based on the knowledge base. If customer asks for human or is frustrated, signal handoff.',
            useKnowledgeBase: true,
            enableHandoff: true,
          },
        },
        position: { x: 280, y: 230 },
      },
      {
        id: 'node-delay',
        type: 'wait',
        data: {
          label: 'Customer Rating Delay',
          config: {
            seconds: 60,
          },
        },
        position: { x: 280, y: 440 },
      },
      {
        id: 'node-feedback',
        type: 'interactive_buttons',
        data: {
          label: 'CSAT Feedback Poll',
          config: {
            message: 'Was this response helpful to you?',
            mode: 'auto',
            timeoutMinutes: 60,
            buttons: [
              { id: 'csat_good', text: '👍 Yes, Helpful' },
              { id: 'csat_bad', text: '👎 Need Human Help' },
            ],
          },
        },
        position: { x: 280, y: 620 },
      },
      {
        id: 'node-handoff',
        type: 'handoff_to_human',
        data: {
          label: 'Escalate to Agent',
          config: {
            assignedName: 'Live Support Specialist',
            status: 'pending',
          },
        },
        position: { x: 480, y: 850 },
      },
      {
        id: 'node-thankyou',
        type: 'send_message',
        data: {
          label: 'Thank Customer',
          config: {
            message: 'Thank you for your feedback! Have a wonderful day!',
          },
        },
        position: { x: 120, y: 850 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-ai', sourceHandle: 'out' },
      { id: 'e2', source: 'node-ai', target: 'node-delay', sourceHandle: 'out' },
      { id: 'e3', source: 'node-delay', target: 'node-feedback', sourceHandle: 'out' },
      { id: 'e4', source: 'node-feedback', target: 'node-thankyou', sourceHandle: 'csat_good' },
      { id: 'e5', source: 'node-feedback', target: 'node-handoff', sourceHandle: 'csat_bad' },
    ],
  },
  {
    id: 'ecommerce_order_tracking',
    name: 'Order Tracking & Razorpay UPI (n8n API Chain)',
    category: 'E-Commerce & Orders',
    description: 'Node-to-node data pipeline: captures Order ID, calls external API, branches status, and delivers dynamic shipping or Razorpay payment link.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Order Keyword Trigger',
          config: {
            triggerType: 'keyword_match',
            keyword: 'order, track, status, shipping, payment',
            workingHoursOnly: false,
          },
        },
        position: { x: 300, y: 50 },
      },
      {
        id: 'node-ask-order-id',
        type: 'ask_question',
        data: {
          label: 'Ask Order ID',
          config: {
            prompt: '🔍 Please reply with your Order ID (e.g. 10023):',
            slot: 'orderId',
            validation: 'any',
            retryPrompt: 'Please enter a valid order ID:',
            maxRetries: 3,
            timeoutMinutes: 60,
          },
        },
        position: { x: 300, y: 220 },
      },
      {
        id: 'node-fetch-order-api',
        type: 'webhook_call',
        data: {
          label: 'Fetch Order Details API',
          config: {
            url: 'http://localhost:2785/api/webhook-test/echo',
            method: 'POST',
            body: {
              orderId: '{{vars.orderId}}',
              sender: '{{trigger.phone}}',
              status: 'shipped',
              carrier: 'Delhivery / Shiprocket',
              amount: 1499,
            },
          },
        },
        position: { x: 300, y: 440 },
      },
      {
        id: 'node-branch-status',
        type: 'condition_branch',
        data: {
          label: 'Check Shipped Status',
          config: {
            field: 'steps.node-fetch-order-api.data.status',
            operator: 'equals',
            value: 'shipped',
          },
        },
        position: { x: 300, y: 660 },
      },
      {
        id: 'node-msg-shipped',
        type: 'send_message',
        data: {
          label: 'Send Tracking Details',
          config: {
            message: '🚚 Great news, {{trigger.contactName}}! Order #{{vars.orderId}} has SHIPPED via {{steps.node-fetch-order-api.data.carrier}}.\nAmount: ₹{{steps.node-fetch-order-api.data.amount}}\nEstimated Delivery: 2 business days.',
          },
        },
        position: { x: 100, y: 880 },
      },
      {
        id: 'node-msg-payment-pending',
        type: 'send_message',
        data: {
          label: 'Send Razorpay Payment Link',
          config: {
            message: '💳 Order #{{vars.orderId}} is awaiting payment of ₹{{steps.node-fetch-order-api.data.amount}}.\nPlease complete payment here: https://rzp.io/l/pay-{{vars.orderId}}',
          },
        },
        position: { x: 500, y: 880 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-ask-order-id', sourceHandle: 'out' },
      { id: 'e2', source: 'node-ask-order-id', target: 'node-fetch-order-api', sourceHandle: 'default' },
      { id: 'e3', source: 'node-fetch-order-api', target: 'node-branch-status', sourceHandle: 'out' },
      { id: 'e4', source: 'node-branch-status', target: 'node-msg-shipped', sourceHandle: 'true' },
      { id: 'e5', source: 'node-branch-status', target: 'node-msg-payment-pending', sourceHandle: 'false' },
    ],
  },
  {
    id: 'multilingual_smart_bot',
    name: 'Multi-Language Auto Bot (English / ગુજરાતી / हिंदी)',
    category: 'Smart Automation',
    description: 'Presents interactive language selection buttons and branches into dedicated native language menus with automated contact tagging.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'New Chat Received',
          config: {
            triggerType: 'message_received',
            workingHoursOnly: false,
          },
        },
        position: { x: 300, y: 50 },
      },
      {
        id: 'node-lang-menu',
        type: 'interactive_buttons',
        data: {
          label: 'Choose Language (ભાષા પસંદ કરો)',
          config: {
            message: '🙏 Namaste! Please choose your preferred language / કૃપા કરીને ભાષા પસંદ કરો:',
            mode: 'auto',
            timeoutMinutes: 60,
            buttons: [
              { id: 'lang_en', text: '1️⃣ English' },
              { id: 'lang_gu', text: '2️⃣ ગુજરાતી' },
              { id: 'lang_hi', text: '3️⃣ हिंदी' },
            ],
          },
        },
        position: { x: 300, y: 240 },
      },
      {
        id: 'node-msg-en',
        type: 'send_message',
        data: {
          label: 'English Welcome Menu',
          config: {
            message: '👋 Welcome! You have selected English. How can our team help you today?\n1. Product Catalog\n2. Track Order\n3. Talk to Agent',
          },
        },
        position: { x: 30, y: 500 },
      },
      {
        id: 'node-msg-gu',
        type: 'send_message',
        data: {
          label: 'ગુજરાતી મેનુ',
          config: {
            message: 'નમસ્તે {{trigger.contactName}}! ગુજરાતી પસંદ કરવા બદલ આભાર. અમે તમને શું મદદ કરી શકીએ?\n૧. પ્રોડક્ટ કેટાલોગ જુઓ\n૨. ઓર્ડર ટ્રેકિંગ\n૩. સપોર્ટ ટીમ સાથે વાત કરો',
          },
        },
        position: { x: 330, y: 500 },
      },
      {
        id: 'node-msg-hi',
        type: 'send_message',
        data: {
          label: 'हिंदी मेनू',
          config: {
            message: 'नमस्ते {{trigger.contactName}}! हमारे WhatsApp सेवा में आपका स्वागत है। हम आपकी क्या सहायता कर सकते हैं?\n१. कैटलॉग देखें\n२. आर्डर ट्रैक करें\n३. कस्टमर केयर से बात करें',
          },
        },
        position: { x: 630, y: 500 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-lang-menu', sourceHandle: 'out' },
      { id: 'e2', source: 'node-lang-menu', target: 'node-msg-en', sourceHandle: 'lang_en' },
      { id: 'e3', source: 'node-lang-menu', target: 'node-msg-gu', sourceHandle: 'lang_gu' },
      { id: 'e4', source: 'node-lang-menu', target: 'node-msg-hi', sourceHandle: 'lang_hi' },
    ],
  },
  {
    id: 'abandoned_cart_recovery',
    name: 'Abandoned Cart Recovery & Razorpay Discount',
    category: 'E-Commerce & Orders',
    description: 'Automatic follow-up for abandoned carts with personalized coupon code, timed delay, and CSAT recovery check.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Cart Abandoned Trigger',
          config: {
            triggerType: 'keyword_match',
            keyword: 'abandoned, cart, checkout',
            workingHoursOnly: false,
          },
        },
        position: { x: 280, y: 50 },
      },
      {
        id: 'node-discount-offer',
        type: 'send_message',
        data: {
          label: 'Send 15% Recovery Offer',
          config: {
            message: '🛍️ Hey {{trigger.contactName}}! We noticed you left items in your shopping cart.\nHere is an exclusive 15% discount coupon: *SAVE15* 🎁\nComplete your checkout now: https://rzp.io/l/quick-checkout?ref={{trigger.phone}}',
          },
        },
        position: { x: 280, y: 230 },
      },
      {
        id: 'node-delay-followup',
        type: 'wait',
        data: {
          label: 'Wait 3 Hours for Purchase',
          config: {
            seconds: 180,
          },
        },
        position: { x: 280, y: 420 },
      },
      {
        id: 'node-check-assistance',
        type: 'interactive_buttons',
        data: {
          label: 'Assistance Poll',
          config: {
            message: 'Need help completing your order or have questions about delivery?',
            mode: 'auto',
            timeoutMinutes: 60,
            buttons: [
              { id: 'btn_help', text: '🙋 Need Agent Help' },
              { id: 'btn_done', text: '✅ Already Ordered' },
            ],
          },
        },
        position: { x: 280, y: 600 },
      },
      {
        id: 'node-handoff-agent',
        type: 'handoff_to_human',
        data: {
          label: 'Assign to Sales Agent',
          config: {
            assignedName: 'Sales Specialist',
            status: 'pending',
          },
        },
        position: { x: 120, y: 820 },
      },
      {
        id: 'node-thankyou',
        type: 'send_message',
        data: {
          label: 'Thank You Message',
          config: {
            message: 'Awesome! Thank you for ordering with us. Your package will be prepared right away! 🚀',
          },
        },
        position: { x: 450, y: 820 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-discount-offer', sourceHandle: 'out' },
      { id: 'e2', source: 'node-discount-offer', target: 'node-delay-followup', sourceHandle: 'out' },
      { id: 'e3', source: 'node-delay-followup', target: 'node-check-assistance', sourceHandle: 'out' },
      { id: 'e4', source: 'node-check-assistance', target: 'node-handoff-agent', sourceHandle: 'btn_help' },
      { id: 'e5', source: 'node-check-assistance', target: 'node-thankyou', sourceHandle: 'btn_done' },
    ],
  },
  {
    id: 'google_sheets_sync',
    name: 'WhatsApp to Google Sheets Lead Capture',
    category: 'Integrations & CRM',
    description: 'Capture inbound inquiry, set lead score variables, append row directly to Google Sheets, and send instant confirmation.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Inbound Inquiry',
          config: {
            triggerType: 'keyword_match',
            keyword: 'lead, quote, inquire, order, demo',
            workingHoursOnly: false,
          },
        },
        position: { x: 300, y: 50 },
      },
      {
        id: 'node-set-vars',
        type: 'set_fields',
        data: {
          label: 'Assign Lead Score',
          config: {
            assignments: [
              { name: 'leadScore', value: '100' },
              { name: 'channel', value: 'WhatsApp Direct' },
            ],
          },
        },
        position: { x: 300, y: 220 },
      },
      {
        id: 'node-sync-sheets',
        type: 'google_sheets',
        data: {
          label: 'Append to Google Sheet',
          config: {
            webhookUrl: 'https://script.google.com/macros/s/AKfycbz_mock/exec',
            columns: {
              CustomerPhone: '{{trigger.phone}}',
              Inquiry: '{{trigger.message}}',
              Score: '{{vars.leadScore}}',
              Timestamp: '{{now}}',
            },
          },
        },
        position: { x: 300, y: 390 },
      },
      {
        id: 'node-reply-confirm',
        type: 'send_message',
        data: {
          label: 'Confirmation Reply',
          config: {
            message: '✅ Thanks! We have received your inquiry and recorded it in our system. A specialist will follow up shortly.',
          },
        },
        position: { x: 300, y: 560 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-set-vars', sourceHandle: 'out' },
      { id: 'e2', source: 'node-set-vars', target: 'node-sync-sheets', sourceHandle: 'out' },
      { id: 'e3', source: 'node-sync-sheets', target: 'node-reply-confirm', sourceHandle: 'out' },
    ],
  },
  {
    id: 'out_of_hours_responder',
    name: 'Smart Message Filter & Stop Workflow',
    category: 'Automation & Filtering',
    description: 'Filter messages containing specific keywords, send automated auto-reply notice, and terminate flow cleanly.',
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        data: {
          label: 'Incoming WhatsApp Message',
          config: {
            triggerType: 'message_received',
            workingHoursOnly: false,
          },
        },
        position: { x: 300, y: 50 },
      },
      {
        id: 'node-filter',
        type: 'filter',
        data: {
          label: 'Filter Urgent Keywords',
          config: {
            field: 'trigger.message',
            operator: 'contains',
            value: 'urgent',
          },
        },
        position: { x: 300, y: 220 },
      },
      {
        id: 'node-send-notice',
        type: 'send_message',
        data: {
          label: 'Send Priority Notice',
          config: {
            message: '🚨 Priority inquiry detected. Our on-call team has been alerted and will reach out to {{trigger.phone}} right away.',
          },
        },
        position: { x: 300, y: 390 },
      },
      {
        id: 'node-stop',
        type: 'stop_workflow',
        data: {
          label: 'Terminate Flow',
          config: {
            reason: 'Priority notification delivered',
          },
        },
        position: { x: 300, y: 560 },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-filter', sourceHandle: 'out' },
      { id: 'e2', source: 'node-filter', target: 'node-send-notice', sourceHandle: 'out' },
      { id: 'e3', source: 'node-send-notice', target: 'node-stop', sourceHandle: 'out' },
    ],
  },
];

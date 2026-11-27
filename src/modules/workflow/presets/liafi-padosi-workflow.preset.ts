import { VisualWorkflowNode, VisualWorkflowEdge } from '../entities/workflow-definition.entity';
import { LIAFI_LANGS, LIAFI_TRANSLATIONS, LiafiCopy } from './liafi-translations';

// TODO: replace with the real PadosiAgent links and numbers before the event.
export const LIAFI_LINKS = {
  profileBase: 'https://padosiagent.com/agent/',
  activate: 'https://padosiagent.com/activate',
  app: 'https://play.google.com/store/apps/details?id=com.padosiagent',
  group: 'https://chat.whatsapp.com/LIAFI-CONTEST-GROUP',
  salesNumber: '+910000000000',
  supportNumber: '+910000000001',
};

const L = LIAFI_LINKS;
const name = '{{vars.name}}';

export const LIAFI_PRESET_NODES: VisualWorkflowNode[] = [
  {
    id: 'liafi-trg',
    type: 'trigger',
    position: { x: 500, y: 50 },
    data: {
      label: 'WhatsApp Message Trigger',
      config: { triggerType: 'keyword_match', keyword: 'hi, hello, liafi, padosi, padosiagent, register, start' },
    },
  },

  // Message 01 · Welcome
  {
    id: 'liafi-welcome',
    type: 'interactive_buttons',
    position: { x: 500, y: 200 },
    data: {
      label: '01 · Welcome',
      config: {
        message:
          'Hello {{trigger.contactName}}! 👋\n\n' +
          'PadosiAgent warmly welcomes you to Vijayawada for the *LIAFI General Council Meeting*.\n\n' +
          '🤝 LIAFI is fighting for your Rights.\n' +
          '🚀 PadosiAgent empowers you with Digital Powers.\n\n' +
          'In just 6 months, we have become the Digital Partner of *1,200+ Expert Insurance Agents*, helping them build relationships with *1,500+ new nearby customers*.\n\n' +
          'Today, customers searching online for insurance services need experienced insurance professionals like YOU!\n' +
          "It's time to become visible where your customers are searching.\n\n" +
          '🎁 *SPECIAL EVENT OFFER*\n' +
          '• Special Gift for the First 150 Expert Agents.\n' +
          '• Exciting Lucky Draw after every 15 registrations!\n\n' +
          "Let's get you started.",
        buttons: [
          { id: 'btn_register', text: '🚀 Register Now' },
          { id: 'btn_language', text: '🌐 Change Language' },
          { id: 'btn_contact', text: '📞 Contact Us' },
        ],
      },
    },
  },

  // Message 02 · Language
  {
    id: 'liafi-lang',
    type: 'interactive_list',
    position: { x: 750, y: 380 },
    data: {
      label: '02 · Language',
      config: {
        message: 'Choose your preferred language to continue.\nPlease select your language. 👇',
        buttons: [
          { id: 'en', text: 'English' },
          { id: 'hi', text: 'हिंदी' },
          { id: 'gu', text: 'ગુજરાતી' },
          { id: 'te', text: 'తెలుగు' },
          { id: 'ta', text: 'தமிழ்' },
          { id: 'kn', text: 'ಕನ್ನಡ' },
          { id: 'ml', text: 'മലയാളം' },
          { id: 'mr', text: 'मराठी' },
        ],
      },
    },
  },

  // Remembers the chosen language so later nodes send their `translations` copy.
  {
    id: 'liafi-set-lang',
    type: 'set_fields',
    position: { x: 750, y: 470 },
    data: { label: 'Save Language', config: { fields: { language: '{{steps.liafi-lang.choice}}' } } },
  },

  // Message 03 · Agent details
  {
    id: 'liafi-reg-intro',
    type: 'send_message',
    position: { x: 500, y: 560 },
    data: {
      label: '03 · Registration',
      config: {
        message:
          "Great! Let's create your *Digital Identity* on PadosiAgent.\n\n" +
          'Please share the following details:\n' +
          '1️⃣ Full Name\n2️⃣ Email Address\n3️⃣ LIAFI Branch Code\n\n' +
          'Your details will help us create your professional digital presence and connect you with nearby insurance customers.',
      },
    },
  },
  {
    id: 'liafi-ask-name',
    type: 'ask_question',
    position: { x: 500, y: 700 },
    data: { label: 'Full Name', config: { slot: 'name', message: '1️⃣ Please type your *Full Name*:' } },
  },
  {
    id: 'liafi-ask-email',
    type: 'ask_question',
    position: { x: 500, y: 840 },
    data: {
      label: 'Email Address',
      config: {
        slot: 'email',
        validation: 'email',
        message: '2️⃣ Please type your *Email Address*:',
        retryPrompt: '⚠️ That does not look like a valid email. Please try again (e.g. name@gmail.com):',
        maxRetries: 3,
      },
    },
  },
  {
    id: 'liafi-ask-branch',
    type: 'ask_question',
    position: { x: 500, y: 980 },
    data: {
      label: 'LIAFI Branch Code',
      config: { slot: 'branchCode', message: '3️⃣ Please type your *LIAFI Branch Code*:' },
    },
  },
  {
    id: 'liafi-save-contact',
    type: 'update_contact',
    position: { x: 500, y: 1120 },
    data: {
      label: 'Save Agent Details',
      config: {
        name,
        email: '{{vars.email}}',
        notes: 'LIAFI GCM registration · Branch: {{vars.branchCode}} · Language: {{steps.liafi-lang.choice}}',
      },
    },
  },
  {
    id: 'liafi-tag',
    type: 'add_tag',
    position: { x: 500, y: 1240 },
    data: { label: 'Tag LIAFI Registration', config: { tag: 'liafi-gcm-registered' } },
  },
  {
    id: 'liafi-alert-sales',
    type: 'internal_alert',
    position: { x: 500, y: 1360 },
    data: {
      label: 'Alert Sales Team',
      config: {
        recipientPhone: L.salesNumber,
        message:
          '🚨 *New LIAFI registration*\n\n👤 ' +
          name +
          '\n📧 {{vars.email}}\n🏢 Branch: {{vars.branchCode}}\n📱 {{trigger.phone}}\n👉 https://wa.me/{{trigger.phone}}',
      },
    },
  },

  // Message 04 · Profile reserved
  {
    id: 'liafi-profile',
    type: 'interactive_buttons',
    position: { x: 500, y: 1500 },
    data: {
      label: '04 · Profile Reserved',
      config: {
        message:
          `🎉 Congratulations ${name}!\n\n` +
          'Your *Digital Profile Website* has been successfully reserved on PadosiAgent.\n' +
          'Your professional identity is now ready to take its first step towards online visibility.\n\n' +
          `🔗 *Preview Your Profile:*\n${L.profileBase}{{trigger.phone}}\n\n` +
          'Want customers to discover you online?\n' +
          'Activate your profile permanently and start building your digital presence.\n\n' +
          '*Your Expertise Deserves Visibility!*',
        buttons: [
          { id: 'btn_activate', text: 'Activate My Profile' },
          { id: 'btn_app', text: 'Download App' },
          { id: 'btn_group', text: 'Join Contest Group' },
        ],
      },
    },
  },
  {
    id: 'liafi-activate',
    type: 'send_message',
    position: { x: 250, y: 1680 },
    data: {
      label: 'Activation Link',
      config: {
        message:
          `💳 Activate your PadosiAgent Digital Presence Plan here:\n${L.activate}\n\n` +
          'Once your payment is confirmed, we will send your activation details right here on WhatsApp.',
      },
    },
  },
  {
    id: 'liafi-app',
    type: 'send_message',
    position: { x: 500, y: 1680 },
    data: { label: 'App Link', config: { message: `📱 Download the PadosiAgent Application:\n${L.app}` } },
  },
  {
    id: 'liafi-group',
    type: 'send_message',
    position: { x: 750, y: 1680 },
    data: {
      label: 'Contest Group Link',
      config: {
        message: `👥 Join our official *LIAFI Event Contest Group* for registration updates, lucky draws and announcements:\n${L.group}`,
      },
    },
  },

  // Message 07 · Save our contacts
  {
    id: 'liafi-contacts',
    type: 'send_message',
    position: { x: 1000, y: 1840 },
    data: {
      label: '07 · Save Our Contacts',
      config: {
        message:
          'Stay connected with your Digital Partner!\n\nSave these important contacts:\n\n' +
          `📞 *PadosiAgent Sales*\n${L.salesNumber}\n\n` +
          `🛠️ *PadosiAgent Support*\n${L.supportNumber}\n\n` +
          'We are always here to help you grow your digital presence.',
      },
    },
  },
  {
    id: 'liafi-vcard-sales',
    type: 'send_contact_vcard',
    position: { x: 1000, y: 1980 },
    data: {
      label: 'Sales Contact Card',
      config: { displayName: 'PadosiAgent Sales', phoneNumber: L.salesNumber, organization: 'PadosiAgent' },
    },
  },
  {
    id: 'liafi-vcard-support',
    type: 'send_contact_vcard',
    position: { x: 1000, y: 2120 },
    data: {
      label: 'Support Contact Card',
      config: { displayName: 'PadosiAgent Support', phoneNumber: L.supportNumber, organization: 'PadosiAgent' },
    },
  },
];

const fill = (s: string, url = '') =>
  s
    .replace('{name}', name)
    .replace('{link}', `${L.profileBase}{{trigger.phone}}`)
    .replace('{url}', url)
    .replace('{sales}', L.salesNumber)
    .replace('{support}', L.supportNumber);

const PROFILE_BUTTON_IDS = ['btn_activate', 'btn_app', 'btn_group'];

// Per-node copy for each non-English language; the executor swaps it in when `language` matches.
const LOCALIZED: Record<string, (c: LiafiCopy) => Record<string, unknown>> = {
  'liafi-reg-intro': c => ({ message: c.regIntro }),
  'liafi-ask-name': c => ({ message: c.askName }),
  'liafi-ask-email': c => ({ message: c.askEmail, retryPrompt: c.emailRetry }),
  'liafi-ask-branch': c => ({ message: c.askBranch }),
  'liafi-profile': c => ({
    message: fill(c.profile),
    buttons: c.profileButtons.map((text, i) => ({ id: PROFILE_BUTTON_IDS[i], text })),
  }),
  'liafi-activate': c => ({ message: fill(c.activate, L.activate) }),
  'liafi-app': c => ({ message: fill(c.app, L.app) }),
  'liafi-group': c => ({ message: fill(c.group, L.group) }),
  'liafi-contacts': c => ({ message: fill(c.contacts) }),
};

for (const node of LIAFI_PRESET_NODES) {
  const localize = LOCALIZED[node.id];
  if (localize) {
    node.data.config.translations = Object.fromEntries(LIAFI_LANGS.map(l => [l, localize(LIAFI_TRANSLATIONS[l])]));
  }
}

export const LIAFI_PRESET_EDGES: VisualWorkflowEdge[] = [
  { id: 'e-trg-welcome', source: 'liafi-trg', target: 'liafi-welcome' },
  { id: 'e-welcome-reg', source: 'liafi-welcome', sourceHandle: 'btn_register', target: 'liafi-reg-intro' },
  { id: 'e-welcome-lang', source: 'liafi-welcome', sourceHandle: 'btn_language', target: 'liafi-lang' },
  { id: 'e-welcome-contact', source: 'liafi-welcome', sourceHandle: 'btn_contact', target: 'liafi-contacts' },
  // Any language continues to registration; the choice is saved on the contact.
  { id: 'e-lang-set', source: 'liafi-lang', target: 'liafi-set-lang' },
  { id: 'e-set-reg', source: 'liafi-set-lang', target: 'liafi-reg-intro' },
  { id: 'e-reg-name', source: 'liafi-reg-intro', target: 'liafi-ask-name' },
  { id: 'e-name-email', source: 'liafi-ask-name', target: 'liafi-ask-email' },
  { id: 'e-email-branch', source: 'liafi-ask-email', target: 'liafi-ask-branch' },
  { id: 'e-branch-save', source: 'liafi-ask-branch', target: 'liafi-save-contact' },
  { id: 'e-save-tag', source: 'liafi-save-contact', target: 'liafi-tag' },
  { id: 'e-tag-alert', source: 'liafi-tag', target: 'liafi-alert-sales' },
  { id: 'e-alert-profile', source: 'liafi-alert-sales', target: 'liafi-profile' },
  { id: 'e-profile-activate', source: 'liafi-profile', sourceHandle: 'btn_activate', target: 'liafi-activate' },
  { id: 'e-profile-app', source: 'liafi-profile', sourceHandle: 'btn_app', target: 'liafi-app' },
  { id: 'e-profile-group', source: 'liafi-profile', sourceHandle: 'btn_group', target: 'liafi-group' },
  { id: 'e-activate-contacts', source: 'liafi-activate', target: 'liafi-contacts' },
  { id: 'e-app-contacts', source: 'liafi-app', target: 'liafi-contacts' },
  { id: 'e-group-contacts', source: 'liafi-group', target: 'liafi-contacts' },
  { id: 'e-contacts-sales', source: 'liafi-contacts', target: 'liafi-vcard-sales' },
  { id: 'e-sales-support', source: 'liafi-vcard-sales', target: 'liafi-vcard-support' },
];

/** Message 05 · sent once payment is confirmed (not part of the chat flow: the bot cannot see payments). */
export const LIAFI_ACTIVATED_MESSAGE =
  '🎊 Congratulations {{Name}}!\n\nYour *PadosiAgent Digital Presence Plan* is now activated!\n' +
  "You are officially taking your insurance expertise online.\n\nHere's what to do next:\n\n" +
  `📱 *Step 1:* Download the PadosiAgent Application.\n${L.app}\n\n` +
  `👥 *Step 2:* Join our official LIAFI Event Contest Group for registration updates, lucky draws and announcements.\n${L.group}\n\n` +
  '🌐 *Step 3:* Share your Digital Profile with your customers and network.\n\n' +
  "Let's make you visible to customers in your neighbourhood!\n*PadosiAgent – Your Digital Partner.*";

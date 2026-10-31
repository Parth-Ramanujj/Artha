/**
 * Ready-made content for insurance agents: messages to copy into the library and branded posters.
 * Wording stays general on purpose (no prices, returns or benefit promises): the agent adds product facts.
 */

export type Lang = 'English' | 'Hindi' | 'Gujarati';

export interface MessageTemplate {
  id: string;
  title: string;
  category: string;
  lang: Lang;
  text: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // ── English ──
  {
    id: 'en-intro',
    title: 'Introduce yourself',
    category: 'Agent branding',
    lang: 'English',
    text: `Namaste 🙏

I'm [Your name], your neighbourhood insurance advisor on Padosi Agent.

I help families choose the right *life, health, term and motor* insurance, explain every policy in simple words, and stay with you when you need to claim.

Have a question about your current policy, or want to check if your family is covered enough? Just reply here, it's free to ask.

📞 [Your number]`,
  },
  {
    id: 'en-followup',
    title: 'Follow-up after enquiry',
    category: 'Follow-up',
    lang: 'English',
    text: `Hello 🙂

Thank you for your interest in insurance. I wanted to check if you had a moment to look at the options we discussed.

If you have any questions about cover, premium or documents, reply here and I'll explain. No pressure, take your time.

[Your name]`,
  },
  {
    id: 'en-renewal',
    title: 'Renewal reminder',
    category: 'Policy renewal',
    lang: 'English',
    text: `Hello 🙏

A gentle reminder: your insurance policy is due for renewal soon.

Renewing before the due date keeps your cover active without a break. Reply *RENEW* and I'll help you with the payment and the documents.

[Your name] | [Your number]`,
  },
  {
    id: 'en-health',
    title: 'Health insurance awareness',
    category: 'Health insurance',
    lang: 'English',
    text: `🏥 One hospital stay can use up years of savings.

A health insurance policy can help pay for hospital bills, so your savings stay safe. Many policies also offer cashless treatment at network hospitals.

Every policy has its own waiting periods and exclusions, so read them carefully. I'm happy to explain them in simple words.

Reply *HEALTH* to talk to me.`,
  },
  {
    id: 'en-term',
    title: 'Term insurance awareness',
    category: 'Life insurance',
    lang: 'English',
    text: `👨‍👩‍👧 If something happens to you, will your family manage?

Term insurance gives your family a lump sum if you are not around, so they can handle home loans, education and daily expenses.

The right cover depends on your income, loans and family needs. Let me help you work it out, free of cost.

Reply *TERM* to know more.`,
  },
  {
    id: 'en-claim',
    title: 'Claim help',
    category: 'Claim assistance',
    lang: 'English',
    text: `Need to make an insurance claim? Don't worry, I'll guide you step by step. 🤝

Keep these ready:
• Policy number
• ID proof
• Bills / reports / FIR (as applicable)
• Cancelled cheque or bank details

Message me and I'll tell you exactly what your insurer needs.

[Your name] | [Your number]`,
  },
  {
    id: 'en-review',
    title: 'Ask for a referral',
    category: 'Lead generation',
    lang: 'English',
    text: `Thank you for trusting me with your insurance 🙏

If you know a friend or family member who has questions about life, health or motor insurance, please share my number. I'll take good care of them.

[Your name] | [Your number]`,
  },

  // ── Hindi ──
  {
    id: 'hi-intro',
    title: 'अपना परिचय',
    category: 'Agent branding',
    lang: 'Hindi',
    text: `नमस्ते 🙏

मैं [आपका नाम], Padosi Agent पर आपका पड़ोसी बीमा सलाहकार।

मैं परिवारों को *जीवन, स्वास्थ्य, टर्म और मोटर* बीमा चुनने में मदद करता/करती हूँ, हर पॉलिसी आसान भाषा में समझाता/समझाती हूँ, और क्लेम के समय साथ रहता/रहती हूँ।

अपनी पॉलिसी से जुड़ा कोई भी सवाल हो, यहाँ जवाब दें। पूछना बिल्कुल मुफ़्त है।

📞 [आपका नंबर]`,
  },
  {
    id: 'hi-renewal',
    title: 'रिन्यूअल रिमाइंडर',
    category: 'Policy renewal',
    lang: 'Hindi',
    text: `नमस्ते 🙏

याद दिलाना था कि आपकी बीमा पॉलिसी का रिन्यूअल जल्द ही है।

तारीख से पहले रिन्यू करने पर आपका कवर बिना रुकावट चलता रहता है। *RENEW* लिखकर भेजें, मैं पेमेंट और कागज़ात में मदद करूँगा/करूँगी।

[आपका नाम] | [आपका नंबर]`,
  },
  {
    id: 'hi-health',
    title: 'स्वास्थ्य बीमा जागरूकता',
    category: 'Health insurance',
    lang: 'Hindi',
    text: `🏥 अस्पताल का एक बिल सालों की बचत खत्म कर सकता है।

स्वास्थ्य बीमा अस्पताल के खर्च में मदद करता है, ताकि आपकी बचत सुरक्षित रहे। कई पॉलिसी में नेटवर्क अस्पतालों में कैशलेस इलाज की सुविधा भी होती है।

हर पॉलिसी के वेटिंग पीरियड और शर्तें अलग होती हैं, मैं आपको आसान भाषा में समझा दूँगा/दूँगी।

बात करने के लिए *HEALTH* लिखें।`,
  },
  {
    id: 'hi-diwali',
    title: 'दिवाली की शुभकामनाएँ',
    category: 'Festivals',
    lang: 'Hindi',
    text: `🪔 आपको और आपके परिवार को दिवाली की हार्दिक शुभकामनाएँ! 🪔

यह रोशनी का त्योहार आपके घर में खुशियाँ, अच्छी सेहत और सुरक्षा लेकर आए।

[आपका नाम]
आपका पड़ोसी बीमा सलाहकार`,
  },
  {
    id: 'hi-claim',
    title: 'क्लेम में मदद',
    category: 'Claim assistance',
    lang: 'Hindi',
    text: `क्लेम करना है? चिंता न करें, मैं हर कदम पर साथ हूँ। 🤝

ये तैयार रखें:
• पॉलिसी नंबर
• पहचान पत्र
• बिल / रिपोर्ट / FIR (जो लागू हो)
• कैंसल चेक या बैंक डिटेल

मुझे मैसेज करें, मैं बताऊँगा/बताऊँगी कि आपकी कंपनी को क्या चाहिए।

[आपका नाम] | [आपका नंबर]`,
  },

  // ── Gujarati ──
  {
    id: 'gu-intro',
    title: 'પોતાનો પરિચય',
    category: 'Agent branding',
    lang: 'Gujarati',
    text: `નમસ્તે 🙏

હું [તમારું નામ], Padosi Agent પર તમારો પાડોશી વીમા સલાહકાર.

હું પરિવારોને *જીવન, આરોગ્ય, ટર્મ અને મોટર* વીમો પસંદ કરવામાં મદદ કરું છું, દરેક પોલિસી સરળ ભાષામાં સમજાવું છું અને ક્લેમ વખતે સાથે રહું છું.

તમારી પોલિસી વિશે કોઈ પણ પ્રશ્ન હોય તો અહીં જવાબ આપો. પૂછવું સંપૂર્ણ મફત છે.

📞 [તમારો નંબર]`,
  },
  {
    id: 'gu-followup',
    title: 'પૂછપરછ પછી ફોલો-અપ',
    category: 'Follow-up',
    lang: 'Gujarati',
    text: `નમસ્તે 🙂

વીમામાં રસ બતાવવા બદલ આભાર. આપણે જે વિકલ્પોની વાત કરી હતી તે તમે જોઈ શક્યા?

કવર, પ્રીમિયમ કે દસ્તાવેજો વિશે કોઈ પ્રશ્ન હોય તો અહીં જવાબ આપો, હું સમજાવીશ. કોઈ ઉતાવળ નથી.

[તમારું નામ]`,
  },
  {
    id: 'gu-renewal',
    title: 'રિન્યુઅલ રિમાઇન્ડર',
    category: 'Policy renewal',
    lang: 'Gujarati',
    text: `નમસ્તે 🙏

યાદ અપાવવાનું કે તમારી વીમા પોલિસીનું રિન્યુઅલ ટૂંક સમયમાં છે.

તારીખ પહેલાં રિન્યુ કરવાથી તમારું કવર કોઈ બ્રેક વગર ચાલુ રહે છે. *RENEW* લખીને મોકલો, હું પેમેન્ટ અને દસ્તાવેજોમાં મદદ કરીશ.

[તમારું નામ] | [તમારો નંબર]`,
  },
  {
    id: 'gu-term',
    title: 'ટર્મ વીમા જાગૃતિ',
    category: 'Life insurance',
    lang: 'Gujarati',
    text: `👨‍👩‍👧 તમને કંઈ થાય તો તમારો પરિવાર કેવી રીતે સંભાળશે?

ટર્મ વીમો તમારી ગેરહાજરીમાં પરિવારને એકસાથે રકમ આપે છે, જેથી હોમ લોન, બાળકોનું ભણતર અને ઘરખર્ચ ચાલુ રહે.

કેટલું કવર જોઈએ તે તમારી આવક, લોન અને પરિવાર પર આધાર રાખે છે. હું મફતમાં ગણતરી કરવામાં મદદ કરીશ.

વધુ જાણવા *TERM* લખો.`,
  },
  {
    id: 'gu-diwali',
    title: 'દિવાળીની શુભેચ્છા',
    category: 'Festivals',
    lang: 'Gujarati',
    text: `🪔 આપને અને આપના પરિવારને દિવાળી અને નૂતન વર્ષની હાર્દિક શુભેચ્છાઓ! 🪔

આ પ્રકાશનો તહેવાર આપના ઘરમાં ખુશી, સારું સ્વાસ્થ્ય અને સુરક્ષા લાવે.

[તમારું નામ]
તમારો પાડોશી વીમા સલાહકાર`,
  },
  {
    id: 'gu-birthday',
    title: 'જન્મદિવસની શુભેચ્છા',
    category: 'Customer relationship',
    lang: 'Gujarati',
    text: `🎂 જન્મદિવસની હાર્દિક શુભેચ્છાઓ! 🎉

આવનારું વર્ષ આપને સારું સ્વાસ્થ્ય, ખુશી અને સફળતા આપે.

[તમારું નામ]`,
  },
  {
    id: 'gu-claim',
    title: 'ક્લેમમાં મદદ',
    category: 'Claim assistance',
    lang: 'Gujarati',
    text: `ક્લેમ કરવો છે? ચિંતા ન કરો, હું દરેક પગલે સાથે છું. 🤝

આ તૈયાર રાખો:
• પોલિસી નંબર
• ઓળખપત્ર
• બિલ / રિપોર્ટ / FIR (જે લાગુ પડે)
• કેન્સલ ચેક અથવા બેંક વિગત

મને મેસેજ કરો, હું જણાવીશ કે તમારી કંપનીને શું જોઈએ છે.

[તમારું નામ] | [તમારો નંબર]`,
  },
];

export interface PosterTemplate {
  id: string;
  title: string;
  category: string;
  /** Small label at the top of the poster. */
  tag: string;
  emoji: string;
  headline: string;
  sub: string;
  /** Gradient top-left → bottom-right. */
  colors: [string, string];
  /** Festivals and greetings skip the solicitation line. */
  greeting?: boolean;
  /** Caption saved with the poster. */
  caption: string;
}

const BRAND: [string, string] = ['#134f7a', '#17705a'];

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'p-advisor',
    title: 'Your neighbourhood advisor',
    category: 'Agent branding',
    tag: 'PADOSI AGENT',
    emoji: '🤝',
    headline: 'Your Neighbourhood Insurance Advisor',
    sub: 'Life • Health • Term • Motor\nHonest advice, right next door.',
    colors: BRAND,
    caption: 'Looking for honest insurance advice? I am right here in your neighbourhood. Message me any time 🙏',
  },
  {
    id: 'p-term',
    title: 'Term insurance',
    category: 'Life insurance',
    tag: 'TERM INSURANCE',
    emoji: '👨‍👩‍👧',
    headline: "Protect Your Family's Tomorrow, Today",
    sub: 'Ask me how much cover your family really needs.',
    colors: ['#0f3d6b', '#1b6a8f'],
    caption: 'Is your family protected if you are not around? Let me help you find the right term cover. Reply TERM.',
  },
  {
    id: 'p-health',
    title: 'Health insurance',
    category: 'Health insurance',
    tag: 'HEALTH INSURANCE',
    emoji: '🏥',
    headline: "Medical Bills Shouldn't Eat Your Savings",
    sub: 'Check if your family has enough health cover.',
    colors: ['#0e6655', '#1aa085'],
    caption: 'One hospital stay can use up years of savings. Let me check your health cover for free. Reply HEALTH.',
  },
  {
    id: 'p-motor',
    title: 'Motor insurance renewal',
    category: 'Motor insurance',
    tag: 'MOTOR INSURANCE',
    emoji: '🚗',
    headline: 'Is Your Vehicle Insurance Up To Date?',
    sub: 'Car • Bike • Commercial vehicles\nRenew before it lapses.',
    colors: ['#1f3a68', '#3a5ba0'],
    caption: 'Car or bike insurance expiring soon? Renew on time and drive worry-free. Message me to renew.',
  },
  {
    id: 'p-renewal',
    title: 'Policy renewal reminder',
    category: 'Policy renewal',
    tag: 'RENEWAL REMINDER',
    emoji: '⏰',
    headline: "Don't Let Your Policy Lapse",
    sub: 'Pay your premium before the due date\nand keep your cover active.',
    colors: ['#7a2e0e', '#c2581b'],
    caption: 'Gentle reminder: pay your premium before the due date so your cover stays active. I can help 🙏',
  },
  {
    id: 'p-claim',
    title: 'Claim help',
    category: 'Claim assistance',
    tag: 'CLAIM SUPPORT',
    emoji: '🛟',
    headline: "Need Help With a Claim? I'm Here.",
    sub: 'Step-by-step guidance on documents\nand the claim process.',
    colors: ['#3b2c6b', '#5b47a8'],
    caption: 'Claims can feel confusing. Message me and I will guide you step by step 🤝',
  },
  {
    id: 'p-child',
    title: 'Child future planning',
    category: 'Life insurance',
    tag: 'CHILD PLANNING',
    emoji: '🎓',
    headline: "Plan Today For Their Dreams Tomorrow",
    sub: "Secure your child's education goals.",
    colors: ['#14557a', '#2a8fbd'],
    caption: "Your child's dreams deserve a plan. Let's talk about securing their future goals.",
  },
  {
    id: 'p-retire',
    title: 'Retirement planning',
    category: 'Life insurance',
    tag: 'RETIREMENT',
    emoji: '🌅',
    headline: 'Retire With Peace of Mind',
    sub: 'Start planning early for a regular income later.',
    colors: ['#6b3a12', '#b8742a'],
    caption: 'The earlier you plan for retirement, the easier it gets. Message me to start planning.',
  },
  {
    id: 'p-myth',
    title: 'Myth vs fact',
    category: 'Customer education',
    tag: 'MYTH vs FACT',
    emoji: '💡',
    headline: 'Myth: "Insurance is only for older people."',
    sub: 'Fact: Starting young usually means\na lower premium for the same cover.',
    colors: ['#123c55', '#1f6f8b'],
    caption: 'Myth busted 💡 Starting early usually costs less. Have a question about insurance? Ask me.',
  },
  {
    id: 'p-hindi',
    title: 'पड़ोसी बीमा सलाहकार (Hindi)',
    category: 'Agent branding',
    tag: 'PADOSI AGENT',
    emoji: '🤝',
    headline: 'आपका पड़ोसी, आपका बीमा सलाहकार',
    sub: 'जीवन • स्वास्थ्य • टर्म • मोटर बीमा',
    colors: BRAND,
    caption: 'बीमा से जुड़ा कोई भी सवाल? आपका पड़ोसी बीमा सलाहकार हमेशा साथ है 🙏',
  },
  {
    id: 'p-gujarati',
    title: 'પાડોશી વીમા સલાહકાર (Gujarati)',
    category: 'Agent branding',
    tag: 'PADOSI AGENT',
    emoji: '🤝',
    headline: 'તમારો પાડોશી, તમારો વીમા સલાહકાર',
    sub: 'જીવન • આરોગ્ય • ટર્મ • મોટર વીમો',
    colors: BRAND,
    caption: 'વીમા વિશે કોઈ પણ પ્રશ્ન? તમારો પાડોશી વીમા સલાહકાર હંમેશાં સાથે છે 🙏',
  },
  {
    id: 'p-diwali',
    title: 'Happy Diwali (Gujarati)',
    category: 'Festivals',
    tag: 'DIWALI',
    emoji: '🪔',
    headline: 'શુભ દીપાવલી',
    sub: 'Wishing your family light, health\nand happiness.',
    colors: ['#5a0f2e', '#c2410c'],
    greeting: true,
    caption: '🪔 Happy Diwali to you and your family! May this festival bring light, health and happiness.',
  },
  {
    id: 'p-newyear',
    title: 'Nutan Varsh (Gujarati)',
    category: 'Festivals',
    tag: 'NEW YEAR',
    emoji: '✨',
    headline: 'નૂતન વર્ષાભિનંદન',
    sub: 'May the new year keep your family\nsafe, healthy and happy.',
    colors: ['#4a1d6b', '#a8326e'],
    greeting: true,
    caption: '✨ નૂતન વર્ષાભિનંદન! May the new year keep your family safe, healthy and happy.',
  },
  {
    id: 'p-uttarayan',
    title: 'Happy Uttarayan',
    category: 'Festivals',
    tag: 'UTTARAYAN',
    emoji: '🪁',
    headline: 'Happy Uttarayan!',
    sub: 'હેપ્પી ઉત્તરાયણ\nFly high, stay safe!',
    colors: ['#0b5c8a', '#f59e0b'],
    greeting: true,
    caption: '🪁 Happy Uttarayan! Fly high and stay safe on the terrace.',
  },
  {
    id: 'p-thanks',
    title: 'Thank you customers',
    category: 'Customer relationship',
    tag: 'THANK YOU',
    emoji: '🙏',
    headline: 'Thank You For Your Trust',
    sub: "Protecting your family is my\nresponsibility and my pride.",
    colors: BRAND,
    greeting: true,
    caption: 'Thank you for trusting me with your family’s protection 🙏',
  },
];

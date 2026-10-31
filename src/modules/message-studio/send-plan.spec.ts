import { buildSendPlan, PlanInput } from './send-plan';
import { ResolvedProduct, StudioContent, StudioKind, TemplateInfo } from './studio-content';

const kurta: ResolvedProduct = {
  id: 'p1',
  name: 'Cotton Kurta',
  price: 499,
  currency: 'INR',
  imageUrl: 'https://shop.example.com/kurta.jpg',
  productUrl: 'https://shop.example.com/kurta',
  inStock: true,
  retailerId: 'KUR-001',
  archived: false,
};
const scarf: ResolvedProduct = {
  ...kurta,
  id: 'p2',
  name: 'Silk Scarf',
  price: 299,
  imageUrl: null,
  retailerId: 'SCF-9',
};

function plan(kind: StudioKind, content: StudioContent, over: Partial<PlanInput> = {}) {
  return buildSendPlan({
    kind,
    content,
    products: new Map([
      [kurta.id, kurta],
      [scarf.id, scarf],
    ]),
    templates: [],
    caps: { cloudApi: false, catalogConfigured: false },
    catalogId: null,
    ...over,
  });
}

const CLOUD = { caps: { cloudApi: true, catalogConfigured: true }, catalogId: '123456789' };

describe('buildSendPlan', () => {
  it('appends the optional link to a text message and fills variables', () => {
    const p = plan(
      'text',
      { text: 'Hi {{name}}', url: 'https://shop.example.com' },
      { fill: t => t.replace('{{name}}', 'Asha') },
    );
    expect(p.parts).toEqual([{ type: 'text', text: 'Hi Asha\n\nhttps://shop.example.com' }]);
    expect(p.choices).toEqual([]);
  });

  it('sends reply buttons natively on Cloud API, and as a numbered menu elsewhere', () => {
    const content: StudioContent = {
      text: 'How can we help?',
      buttons: [
        { id: 'track', label: 'Track order', action: 'quick_reply' },
        { id: 'x', label: 'Talk to us', action: 'talk_to_human' },
      ],
    };
    const cloud = plan('buttons', content, CLOUD);
    expect(cloud.parts[0]).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'track', title: 'Track order' } },
            { type: 'reply', reply: { id: 'talk_to_human', title: 'Talk to us' } },
          ],
        },
      },
    });
    const web = plan('buttons', content);
    expect(web.parts[0].type).toBe('text');
    expect((web.parts[0] as { text: string }).text).toContain('1️⃣  *Track order*');
    expect(web.choices.map(c => c.id)).toEqual(['track', 'talk_to_human']);
  });

  it('uses a cta_url message for a link button on Cloud API and puts the link in the text elsewhere', () => {
    const content: StudioContent = {
      text: 'New arrivals',
      media: { source: 'url', url: 'https://cdn.example.com/banner.jpg' },
      buttons: [{ id: 'b', label: 'Shop now', action: 'open_url', url: 'https://shop.example.com' }],
    };
    const cloud = plan('image', content, CLOUD);
    expect(cloud.parts).toHaveLength(1);
    expect(cloud.parts[0]).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        header: { type: 'image', image: { link: 'https://cdn.example.com/banner.jpg' } },
        action: { name: 'cta_url', parameters: { display_text: 'Shop now', url: 'https://shop.example.com' } },
      },
    });
    const web = plan('image', content);
    expect(web.parts).toEqual([
      {
        type: 'media',
        mediaKind: 'image',
        url: 'https://cdn.example.com/banner.jpg',
        mimetype: 'image/jpeg',
        caption: 'New arrivals\n\nShop now: https://shop.example.com',
      },
    ]);
  });

  it('a view-product button links to the stored product URL', () => {
    const p = plan(
      'text',
      { text: 'Look', buttons: [{ id: 'v', label: 'View', action: 'view_product', productId: 'p1' }] },
      CLOUD,
    );
    expect(p.parts[0]).toMatchObject({
      interactive: { action: { parameters: { url: 'https://shop.example.com/kurta' } } },
    });
  });

  it('individual product messages use catalog data, in the chosen order', () => {
    const p = plan('products', {
      productLayout: 'individual',
      text: 'Our picks for you',
      products: [{ productId: 'p2' }, { productId: 'p1', note: 'Bestseller' }],
    });
    expect(p.parts).toEqual([
      { type: 'text', text: 'Our picks for you' },
      { type: 'text', text: '*Silk Scarf*\n₹299\nhttps://shop.example.com/kurta' },
      {
        type: 'media',
        mediaKind: 'image',
        url: 'https://shop.example.com/kurta.jpg',
        mimetype: 'image/jpeg',
        caption: '*Cotton Kurta*\n₹499\nBestseller\nhttps://shop.example.com/kurta',
      },
    ]);
  });

  it('native layout sends a single product or a product list with the catalog id', () => {
    const single = plan(
      'products',
      { productLayout: 'native', text: 'For you', products: [{ productId: 'p1' }] },
      CLOUD,
    );
    expect(single.parts[0]).toEqual({
      type: 'interactive',
      interactive: {
        type: 'product',
        body: { text: 'For you' },
        action: { catalog_id: '123456789', product_retailer_id: 'KUR-001' },
      },
    });
    const multi = plan(
      'products',
      {
        productLayout: 'native',
        header: 'New in',
        text: 'For you',
        products: [{ productId: 'p1' }, { productId: 'p2' }],
      },
      CLOUD,
    );
    expect(multi.parts[0]).toMatchObject({
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: 'New in' },
        action: {
          catalog_id: '123456789',
          sections: [{ product_items: [{ product_retailer_id: 'KUR-001' }, { product_retailer_id: 'SCF-9' }] }],
        },
      },
    });
  });

  it('a list goes native on Cloud API and lists rows as choices', () => {
    const content: StudioContent = {
      text: 'Pick a category',
      list: {
        buttonLabel: 'Browse',
        sections: [
          {
            title: 'Shop',
            rows: [
              { id: 'men', title: 'Men' },
              { id: 'women', title: 'Women', description: 'New' },
            ],
          },
        ],
      },
    };
    const cloud = plan('list', content, CLOUD);
    expect(cloud.parts[0]).toMatchObject({
      interactive: {
        type: 'list',
        action: {
          button: 'Browse',
          sections: [
            {
              title: 'Shop',
              rows: [
                { id: 'men', title: 'Men' },
                { id: 'women', title: 'Women', description: 'New' },
              ],
            },
          ],
        },
      },
    });
    expect(cloud.choices).toEqual([
      { id: 'men', text: 'Men' },
      { id: 'women', text: 'Women' },
    ]);
  });

  it('builds template components from the approved template', () => {
    const p = plan(
      'template',
      {
        template: {
          name: 'order_update',
          language: 'en_US',
          variables: ['{{name}}', '#42'],
          headerMediaUrl: 'https://cdn.example.com/a.jpg',
        },
      },
      {
        ...CLOUD,
        fill: t => t.replace('{{name}}', 'Asha'),
        templates: [
          {
            name: 'order_update',
            language: 'en_US',
            status: 'APPROVED',
            category: 'UTILITY',
            bodyText: 'Hi {{1}}, order {{2}}',
            bodyVariableCount: 2,
            headerFormat: 'IMAGE',
            buttons: [],
            isCarousel: false,
          },
        ],
      },
    );
    expect(p.parts).toEqual([
      {
        type: 'template',
        name: 'order_update',
        language: 'en_US',
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/a.jpg' } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Asha' },
              { type: 'text', text: '#42' },
            ],
          },
        ],
      },
    ]);
  });

  it('location and contact', () => {
    expect(plan('location', { location: { latitude: 23.02, longitude: 72.57, name: 'Store' } }).parts[0]).toMatchObject(
      {
        type: 'location',
        latitude: 23.02,
      },
    );
    expect(plan('contact', { contact: { name: 'Shop', phone: '+91 98765-43210' } }).parts[0]).toEqual({
      type: 'contact',
      name: 'Shop',
      phone: '+919876543210',
    });
  });
});

describe('carousel template', () => {
  const carousel: TemplateInfo = {
    name: 'new_arrivals',
    language: 'en_US',
    status: 'APPROVED',
    category: 'MARKETING',
    bodyText: 'Fresh picks for {{1}}',
    bodyVariableCount: 1,
    headerFormat: 'NONE',
    buttons: [],
    isCarousel: true,
    carouselCards: [
      { headerFormat: 'IMAGE', bodyVariableCount: 1 },
      { headerFormat: 'IMAGE', bodyVariableCount: 0 },
    ],
  };

  it('sends one carousel component with each card’s own header and values', () => {
    const p = plan(
      'template',
      {
        template: {
          name: 'new_arrivals',
          language: 'en_US',
          variables: ['Asha'],
          cards: [
            { headerMediaUrl: 'https://cdn.example.com/a.jpg', variables: ['Kurta'] },
            { headerMediaUrl: 'https://cdn.example.com/b.jpg', variables: [] },
          ],
        },
      },
      { ...CLOUD, templates: [carousel] },
    );
    const comps = (p.parts[0] as { components: Array<Record<string, unknown>> }).components;
    expect(comps.find(c => c.type === 'carousel')).toEqual({
      type: 'carousel',
      cards: [
        {
          card_index: 0,
          components: [
            { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/a.jpg' } }] },
            { type: 'body', parameters: [{ type: 'text', text: 'Kurta' }] },
          ],
        },
        {
          card_index: 1,
          components: [
            { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/b.jpg' } }] },
          ],
        },
      ],
    });
  });
});

describe('new message formats', () => {
  it('audio and sticker go out as media parts', () => {
    const audio = plan('audio', {
      media: { source: 'url', url: 'https://cdn.example.com/hi.ogg', mimetype: 'audio/ogg' },
    });
    expect(audio.parts[0]).toMatchObject({ type: 'media', mediaKind: 'audio', url: 'https://cdn.example.com/hi.ogg' });
    const sticker = plan('sticker', { media: { source: 'url', url: 'https://cdn.example.com/s.webp' } });
    expect(sticker.parts[0]).toMatchObject({ type: 'media', mediaKind: 'sticker', mimetype: 'image/webp' });
  });

  it('address and location request are interactive messages with the right action', () => {
    const address = plan('address', { text: 'Where should we deliver?', addressCountry: 'IN' }, CLOUD);
    expect(address.parts[0]).toEqual({
      type: 'interactive',
      interactive: {
        type: 'address_message',
        body: { text: 'Where should we deliver?' },
        action: { name: 'address_message', parameters: { country: 'IN' } },
      },
    });
    const loc = plan('location_request', { text: 'Share your location' }, CLOUD);
    expect(loc.parts[0]).toEqual({
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: 'Share your location' },
        action: { name: 'send_location' },
      },
    });
  });

  it('a flow sends its id, button text and first screen', () => {
    const p = plan('flow', { text: 'Book a slot', flow: { id: '123456', cta: 'Book now', screen: 'SLOTS' } }, CLOUD);
    expect(p.parts[0]).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'flow',
        action: {
          name: 'flow',
          parameters: { flow_id: '123456', flow_cta: 'Book now', flow_action_payload: { screen: 'SLOTS' } },
        },
      },
    });
  });

  it('a reaction goes on the target message, and needs one', () => {
    const p = plan('reaction', { reaction: { emoji: '👍' } }, { targetMessageId: 'wamid.ABC' });
    expect(p.parts[0]).toEqual({ type: 'reaction', messageId: 'wamid.ABC', emoji: '👍' });
    expect(() => plan('reaction', { reaction: { emoji: '👍' } })).toThrow('A reaction needs a customer message');
  });
});

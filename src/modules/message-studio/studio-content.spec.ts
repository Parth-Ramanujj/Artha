import {
  ResolvedProduct,
  SendCapabilities,
  StudioContent,
  StudioKind,
  TemplateInfo,
  allowedButtonActions,
  base64Bytes,
  checkReadiness,
  countTemplateVariables,
  isHttpsUrl,
  normalizeContent,
  productCaption,
  replyChoices,
} from './studio-content';

const CLOUD: SendCapabilities = { cloudApi: true, catalogConfigured: true };
const WEB: SendCapabilities = { cloudApi: false, catalogConfigured: false };

const product = (over: Partial<ResolvedProduct> = {}): ResolvedProduct => ({
  id: 'p1',
  name: 'Cotton Kurta',
  price: 499,
  currency: 'INR',
  imageUrl: 'https://shop.example.com/kurta.jpg',
  productUrl: 'https://shop.example.com/kurta',
  inStock: true,
  retailerId: 'KUR-001',
  archived: false,
  ...over,
});

const template = (over: Partial<TemplateInfo> = {}): TemplateInfo => ({
  name: 'order_update',
  language: 'en_US',
  status: 'APPROVED',
  category: 'UTILITY',
  bodyText: 'Hi {{1}}, your order {{2}} has shipped.',
  bodyVariableCount: 2,
  headerFormat: 'NONE',
  buttons: [],
  isCarousel: false,
  ...over,
});

function check(
  kind: StudioKind,
  content: StudioContent,
  opts: { caps?: SendCapabilities; products?: ResolvedProduct[]; templates?: TemplateInfo[] | null } = {},
) {
  return checkReadiness({
    kind,
    content,
    caps: opts.caps ?? WEB,
    products: new Map((opts.products ?? []).map(p => [p.id, p])),
    templates: opts.templates === undefined ? [] : opts.templates,
  });
}

const errorFields = (r: ReturnType<typeof check>) => r.issues.filter(i => i.severity === 'error').map(i => i.field);

describe('studio content readiness', () => {
  it('a plain text message with text is ready on any number', () => {
    expect(check('text', { text: 'Hello!' }).readiness).toBe('ready');
  });

  it('flags missing text next to the text field', () => {
    const r = check('text', { text: '  ' });
    expect(r.readiness).toBe('needs_attention');
    expect(errorFields(r)).toEqual(['text']);
  });

  it('refuses a non-https link', () => {
    expect(errorFields(check('text', { text: 'Hi', url: 'http://example.com' }))).toContain('url');
  });

  it('warns about the 24-hour window only on Cloud API, and never for templates', () => {
    expect(check('text', { text: 'Hi' }, { caps: CLOUD }).issues.map(i => i.field)).toContain('window');
    expect(check('text', { text: 'Hi' }).issues.map(i => i.field)).not.toContain('window');
  });

  describe('media', () => {
    it('needs a file', () => {
      expect(errorFields(check('image', { text: 'caption' }))).toContain('media');
    });

    it('accepts an https link', () => {
      expect(check('image', { media: { source: 'url', url: 'https://x.example/a.jpg' } }).readiness).toBe('ready');
    });

    it('refuses an upload of the wrong type and one larger than 5 MB', () => {
      const wrongType = check('image', { media: { source: 'upload', base64: 'AAAA', mimetype: 'application/pdf' } });
      expect(wrongType.issues[0].message).toMatch(/can't be sent as an image/);
      const big = 'A'.repeat(Math.ceil((6 * 1024 * 1024 * 4) / 3));
      const tooBig = check('document', { media: { source: 'upload', base64: big, mimetype: 'application/pdf' } });
      expect(tooBig.issues.some(i => /5 MB/.test(i.message))).toBe(true);
    });
  });

  describe('buttons', () => {
    const replies = (n: number): StudioContent['buttons'] =>
      Array.from({ length: n }, (_, i) => ({
        id: `opt_${i + 1}`,
        label: `Option ${i + 1}`,
        action: 'quick_reply' as const,
      }));

    it('allows 1-3 reply buttons and says a web number gets a numbered menu', () => {
      const r = check('buttons', { text: 'Pick one', buttons: replies(3) });
      expect(r.readiness).toBe('ready');
      expect(r.deliveryNote).toMatch(/numbered menu/);
      expect(check('buttons', { text: 'Pick one', buttons: replies(3) }, { caps: CLOUD }).deliveryNote).toBeUndefined();
    });

    it('refuses a fourth button, a long label and duplicate ids', () => {
      expect(errorFields(check('buttons', { text: 'Pick', buttons: replies(4) }))).toContain('buttons');
      const long = check('buttons', {
        text: 'Pick',
        buttons: [{ id: 'a', label: 'x'.repeat(21), action: 'quick_reply' }],
      });
      expect(long.issues[0].message).toMatch(/at most 20/);
      const dup = check('buttons', {
        text: 'Pick',
        buttons: [
          { id: 'a', label: 'Talk', action: 'talk_to_human' },
          { id: 'b', label: 'Human', action: 'talk_to_human' },
        ],
      });
      expect(dup.issues.some(i => /same thing/.test(i.message))).toBe(true);
    });

    it('only offers link-type buttons on text and media, and reply buttons on button messages', () => {
      expect(allowedButtonActions('buttons')).toEqual(['quick_reply', 'talk_to_human', 'browse_products']);
      expect(allowedButtonActions('image')).not.toContain('quick_reply');
      expect(allowedButtonActions('list')).toEqual([]);
      const r = check('text', { text: 'Hi', buttons: [{ id: 'a', label: 'Yes', action: 'quick_reply' }] });
      expect(r.issues[0].message).toMatch(/not available/);
    });

    it('needs a template for call buttons and a catalog for catalog buttons', () => {
      expect(check('text', { text: 'Hi', buttons: [{ id: 'c', label: 'Call', action: 'call' }] }).readiness).toBe(
        'template_required',
      );
      const catalog = { text: 'Hi', buttons: [{ id: 'v', label: 'Shop', action: 'view_catalog' as const }] };
      expect(check('text', catalog, { caps: { cloudApi: true, catalogConfigured: false } }).readiness).toBe(
        'catalog_required',
      );
      expect(check('text', catalog).readiness).toBe('unsupported');
    });

    it('a view-product button needs a product with an https link', () => {
      const content: StudioContent = {
        text: 'See it',
        buttons: [{ id: 'v', label: 'View', action: 'view_product', productId: 'p1' }],
      };
      expect(check('text', content, { products: [product()] }).readiness).toBe('ready');
      expect(check('text', content, { products: [product({ productUrl: null })] }).readiness).toBe('needs_attention');
    });
  });

  describe('list', () => {
    const list = (rows: number): StudioContent['list'] => ({
      buttonLabel: 'View options',
      sections: [
        { title: 'Menu', rows: Array.from({ length: rows }, (_, i) => ({ id: `row_${i}`, title: `Row ${i}` })) },
      ],
    });

    it('is ready with body, button label and rows', () => {
      expect(check('list', { text: 'Choose', list: list(3) }).readiness).toBe('ready');
    });

    it('refuses more than 10 rows and an empty list', () => {
      expect(errorFields(check('list', { text: 'Choose', list: list(11) }))).toContain('list');
      expect(errorFields(check('list', { text: 'Choose', list: list(0) }))).toContain('list');
    });
  });

  describe('products', () => {
    it('asks for at least one product', () => {
      const r = check('products', { products: [] });
      expect(r.issues[0].message).toBe('Select at least one product to continue.');
    });

    it('refuses an out-of-stock or deleted product', () => {
      const r = check(
        'products',
        { products: [{ productId: 'p1' }, { productId: 'gone' }] },
        { products: [product({ inStock: false })] },
      );
      expect(errorFields(r)).toEqual(['products.0', 'products.1']);
    });

    it('individual product messages work on every number', () => {
      expect(
        check('products', { productLayout: 'individual', products: [{ productId: 'p1' }] }, { products: [product()] })
          .readiness,
      ).toBe('ready');
    });

    it('carousel is never presented as sendable and points to the fallback', () => {
      const r = check(
        'products',
        { productLayout: 'carousel', products: [{ productId: 'p1' }] },
        { caps: CLOUD, products: [product()] },
      );
      expect(r.readiness).toBe('template_required');
      expect(r.issues.find(i => i.field === 'productLayout')?.message).toMatch(
        /Use Multiple Product Messages Instead/i,
      );
    });

    it('native product messages need Cloud API, a catalog and catalog ids', () => {
      const content: StudioContent = {
        productLayout: 'native',
        text: 'Our picks',
        header: 'New in',
        products: [{ productId: 'p1' }],
      };
      expect(check('products', content, { products: [product()] }).readiness).toBe('unsupported');
      expect(
        check('products', content, { caps: { cloudApi: true, catalogConfigured: false }, products: [product()] })
          .readiness,
      ).toBe('catalog_required');
      expect(check('products', content, { caps: CLOUD, products: [product({ retailerId: null })] }).readiness).toBe(
        'catalog_required',
      );
      expect(check('products', content, { caps: CLOUD, products: [product()] }).readiness).toBe('ready');
    });
  });

  describe('template', () => {
    it('is unsupported on a non-Cloud number with a text-message alternative', () => {
      const r = check('template', { template: { name: 'order_update', language: 'en_US', variables: [] } });
      expect(r.readiness).toBe('unsupported');
      expect(r.issues[0].message).toMatch(/Use a Text Message instead/);
    });

    it('requires approval and every variable', () => {
      const t = { name: 'order_update', language: 'en_US', variables: ['Asha'] };
      expect(
        check('template', { template: t }, { caps: CLOUD, templates: [template({ status: 'PENDING' })] }).readiness,
      ).toBe('template_required');
      const missing = check('template', { template: t }, { caps: CLOUD, templates: [template()] });
      expect(errorFields(missing)).toEqual(['template.variables.1']);
      expect(
        check('template', { template: { ...t, variables: ['Asha', '#42'] } }, { caps: CLOUD, templates: [template()] })
          .readiness,
      ).toBe('ready');
    });

    it('needs a header link for media-header templates and says when templates could not be loaded', () => {
      const t = { name: 'order_update', language: 'en_US', variables: ['a', 'b'] };
      const media = check(
        'template',
        { template: t },
        { caps: CLOUD, templates: [template({ headerFormat: 'IMAGE' })] },
      );
      expect(errorFields(media)).toEqual(['template.headerMediaUrl']);
      expect(check('template', { template: t }, { caps: CLOUD, templates: null }).readiness).toBe('template_required');
    });
  });

  it('checks location and contact values', () => {
    expect(check('location', { location: { latitude: 91, longitude: 0 } }).readiness).toBe('needs_attention');
    expect(check('location', { location: { latitude: 23.02, longitude: 72.57 } }).readiness).toBe('ready');
    const blank = normalizeContent('location', { location: { latitude: null, longitude: '' } });
    expect(check('location', blank).readiness).toBe('needs_attention');
    expect(check('contact', { contact: { name: 'Shop', phone: '12' } }).readiness).toBe('needs_attention');
    expect(check('contact', { contact: { name: 'Shop', phone: '+91 98765 43210' } }).readiness).toBe('ready');
  });
});

describe('studio content helpers', () => {
  it('normalizeContent keeps only what belongs to the kind', () => {
    const out = normalizeContent('text', {
      text: 'Hi',
      media: { source: 'url', url: 'https://x' },
      evil: '<script>',
      products: [],
    });
    expect(out).toEqual({ text: 'Hi' });
    const products = normalizeContent('products', {
      productLayout: 'bogus',
      products: [{ productId: 'p1', price: 1 }],
    });
    expect(products).toEqual({ productLayout: 'individual', products: [{ productId: 'p1' }] });
  });

  it('strips a data: prefix from uploads', () => {
    const out = normalizeContent('image', {
      media: { source: 'upload', base64: 'data:image/png;base64,AAAA', mimetype: 'image/png' },
    });
    expect(out.media).toEqual({ source: 'upload', base64: 'AAAA', mimetype: 'image/png' });
  });

  it('reply choices map internal actions to fixed ids and include list rows', () => {
    expect(
      replyChoices('buttons', {
        buttons: [
          { id: 'yes', label: 'Yes', action: 'quick_reply' },
          { id: 'x', label: 'Agent', action: 'talk_to_human' },
        ],
      }),
    ).toEqual([
      { id: 'yes', text: 'Yes' },
      { id: 'talk_to_human', text: 'Agent' },
    ]);
    expect(
      replyChoices('list', {
        list: { buttonLabel: 'Go', sections: [{ title: '', rows: [{ id: 'r1', title: 'One' }] }] },
      }),
    ).toEqual([{ id: 'r1', text: 'One' }]);
  });

  it('builds the product caption from the stored product', () => {
    expect(productCaption(product(), 'Free delivery')).toBe(
      '*Cotton Kurta*\n₹499\nFree delivery\nhttps://shop.example.com/kurta',
    );
  });

  it('small helpers', () => {
    expect(isHttpsUrl('https://a.b/c')).toBe(true);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(countTemplateVariables('Hi {{1}}, {{2}} and {{1}}')).toBe(2);
    expect(base64Bytes('AAAA')).toBe(3);
  });
});

describe('new message formats readiness', () => {
  const cloud = { cloudApi: true, catalogConfigured: false };
  const web = { cloudApi: false, catalogConfigured: false };
  const run = (kind: StudioKind, content: StudioContent, caps = cloud) =>
    checkReadiness({ kind, content, caps, products: new Map(), templates: [] });

  it('flow needs a Cloud API number, digit-only id, short button text and a screen', () => {
    const ok = { text: 'Book', flow: { id: '123456', cta: 'Book now', screen: 'SLOTS' } };
    expect(run('flow', ok).readiness).toBe('ready');
    expect(run('flow', ok, web).readiness).toBe('unsupported');
    expect(run('flow', { ...ok, flow: { ...ok.flow, id: 'abc' } }).issues.map(i => i.field)).toContain('flow.id');
    expect(run('flow', { ...ok, flow: { ...ok.flow, cta: 'x'.repeat(21) } }).issues.map(i => i.field)).toContain(
      'flow.cta',
    );
    expect(run('flow', { ...ok, flow: { ...ok.flow, screen: '' } }).issues.map(i => i.field)).toContain('flow.screen');
  });

  it('address and location request need Cloud API and a message body', () => {
    expect(run('address', { text: 'Your address?' }).readiness).toBe('ready');
    expect(run('address', { text: 'Your address?' }, web).readiness).toBe('unsupported');
    expect(run('location_request', { text: '' }).readiness).toBe('needs_attention');
  });

  it('a reaction needs one emoji and says it is sent from a workflow', () => {
    const r = run('reaction', { reaction: { emoji: '👍' } });
    expect(r.readiness).toBe('ready');
    expect(r.deliveryNote).toMatch(/from a workflow/);
    expect(run('reaction', { reaction: { emoji: '' } }).readiness).toBe('needs_attention');
  });

  it('audio and sticker check their media type', () => {
    expect(run('audio', { media: { source: 'url', url: 'https://x.example/a.ogg' } }).readiness).toBe('ready');
    const wrong = run('sticker', { media: { source: 'upload', base64: 'AAAA', mimetype: 'image/png' } });
    expect(wrong.readiness).toBe('needs_attention');
  });
});

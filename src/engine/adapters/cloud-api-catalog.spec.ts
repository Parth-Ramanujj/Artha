import { CloudApiAdapter } from './cloud-api.adapter';
import { EngineStatus } from '../interfaces/whatsapp-engine.interface';

describe('CloudApiAdapter catalog', () => {
  let adapter: CloudApiAdapter;
  let graph: jest.Mock;

  beforeEach(() => {
    adapter = new CloudApiAdapter({ sessionId: 's1', accessToken: 't', phoneNumberId: 'PN1', wabaId: 'WABA1' });
    const internals = adapter as unknown as { status: EngineStatus; phoneNumber: string; graphRequest: jest.Mock };
    internals.status = EngineStatus.READY;
    internals.phoneNumber = '+91 98765 43210';
    graph = jest.fn((method: string, path: string) => {
      if (path.startsWith('/WABA1/product_catalogs'))
        return Promise.resolve({ data: [{ id: 'CAT1', name: 'Plans', product_count: 2 }] });
      if (path.startsWith('/CAT1/products')) {
        return Promise.resolve({
          data: [
            {
              id: 'p1',
              name: 'Term plan',
              price: '₹1,499.00',
              currency: 'INR',
              retailer_id: 'SKU-1',
              availability: 'in stock',
            },
            {
              id: 'p2',
              name: 'Car cover',
              price: '₹999.00',
              currency: 'INR',
              retailer_id: 'SKU-2',
              availability: 'out of stock',
            },
          ],
        });
      }
      return Promise.resolve({ messages: [{ id: 'wamid.1' }] });
    });
    internals.graphRequest = graph;
  });

  it('reads the connected catalog and its products', async () => {
    expect(await adapter.getCatalog()).toEqual({
      id: 'CAT1',
      name: 'Plans',
      productCount: 2,
      url: 'https://wa.me/c/919876543210',
    });
    const { products, pagination } = await adapter.getProducts({ limit: 1 });
    expect(products[0]).toMatchObject({
      id: 'p1',
      price: 1499,
      priceFormatted: '₹1,499.00',
      retailerId: 'SKU-1',
      isAvailable: true,
    });
    expect(pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect((await adapter.getProduct('SKU-2'))?.isAvailable).toBe(false);
  });

  it('sends a product by its retailer id, and a catalog message', async () => {
    await adapter.sendProduct('919111111111@c.us', 'p1', 'Our best plan');
    await adapter.sendCatalog('919111111111@c.us');
    const calls = graph.mock.calls as Array<[string, string, Record<string, unknown>]>;
    const bodies = calls.filter(c => c[1] === '/PN1/messages').map(c => c[2]);
    expect(bodies[0]).toMatchObject({
      to: '919111111111',
      type: 'interactive',
      interactive: {
        type: 'product',
        body: { text: 'Our best plan' },
        action: { catalog_id: 'CAT1', product_retailer_id: 'SKU-1' },
      },
    });
    expect(bodies[1]).toMatchObject({
      interactive: {
        type: 'catalog_message',
        body: { text: 'Browse our catalog' },
        action: { name: 'catalog_message' },
      },
    });
  });

  it('needs the WABA id to find the catalog', async () => {
    const bare = new CloudApiAdapter({ sessionId: 's1', accessToken: 't', phoneNumberId: 'PN1' });
    (bare as unknown as { status: EngineStatus }).status = EngineStatus.READY;
    await expect(bare.getCatalog()).rejects.toThrow(/WABA id/);
  });
});

import { BadRequestException } from '@nestjs/common';
import { cellMatches, extractPhoneFromText, fieldKey, looksLikePhone, phoneKey } from './sheet-lookup';
import { GoogleWorkspaceService } from './google-workspace.service';
import { encryptSecret } from './google-token-crypto';
import { Integration, IntegrationType } from '../entities/integration.entity';

process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-key-for-unit-tests';

describe('phone matching for sheet lookups', () => {
  it('treats the same number in different formats as one number', () => {
    const forms = ['+91 98765 43210', '98765-43210', '09876543210', '919876543210', '+91-98765-43210'];
    for (const f of forms) expect(phoneKey(f)).toBe('9876543210');
    expect(cellMatches('+91 98765 43210', '9876543210')).toBe(true);
    expect(cellMatches('98765 43210', '+91 98765 43210')).toBe(true);
    expect(cellMatches('+91 98765 43211', '+91 98765 43210')).toBe(false);
  });

  it('keeps short numbers whole and recognises phone-like values', () => {
    expect(phoneKey('12345')).toBe('12345');
    expect(looksLikePhone('+91 98765 43210')).toBe(true);
    expect(looksLikePhone('ORD-1001')).toBe(false);
    expect(looksLikePhone('12')).toBe(false);
  });

  it('matches text cells by value, ignoring case and spaces', () => {
    expect(cellMatches(' ORD-1001 ', 'ord-1001')).toBe(true);
    expect(cellMatches('ORD-1002', 'ORD-1001')).toBe(false);
    expect(cellMatches('', '')).toBe(false);
  });

  it('finds the phone number a customer wrote in their message', () => {
    expect(extractPhoneFromText('Hi, my number is +91 98765 43210 please check')).toBe('+91 98765 43210');
    expect(extractPhoneFromText('my order is 12345 and phone 9876543210')).toBe('9876543210');
    expect(extractPhoneFromText('hello there')).toBeNull();
  });

  it('makes header names safe for workflow tokens', () => {
    expect(fieldKey('Order No.')).toBe('order_no');
    expect(fieldKey('  Full Name ')).toBe('full_name');
  });
});

describe('looking up a row in a Google Sheet', () => {
  const sheet = {
    values: [
      ['Name', 'Phone', 'Order No.', 'Status'],
      ['Asha Patel', '+91 98765 43210', 'A-1001', 'Shipped'],
      ['Ravi Shah', '98765 11111', 'A-1002', 'Packed'],
    ],
  };

  const integration = {
    id: 'int-1',
    type: IntegrationType.GOOGLE_SHEETS,
    config: {
      services: ['sheets'],
      refreshToken: encryptSecret('refresh'),
      accountEmail: 'owner@example.com',
      grantedScopes: [],
    },
  } as unknown as Integration;

  let service: GoogleWorkspaceService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-key-for-unit-tests';
    service = new GoogleWorkspaceService({} as never);
    jest.spyOn(service, 'accessToken').mockResolvedValue('token');
    // Metadata (the tab list) and the values come from two calls; answer each by its URL.
    fetchMock = jest.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).includes('fields=sheets')
              ? { sheets: [{ properties: { title: 'Sheet1' } }, { properties: { title: 'Orders' } }] }
              : sheet,
          ),
      }),
    );
    global.fetch = fetchMock;
  });

  const SHEET_ID = 'abcdefghijklmnopqrstuvwxyz12';

  it('returns the matching row with its fields and raw text', async () => {
    const r = await service.lookupRow(integration, {
      spreadsheetId: SHEET_ID,
      keyColumn: 'Phone',
      value: '9876543210',
    });
    expect(r.found).toBe(true);
    expect(r.rowNumber).toBe(2);
    expect(r.fields).toEqual({ name: 'Asha Patel', phone: '+91 98765 43210', order_no: 'A-1001', status: 'Shipped' });
    expect(r.rowText).toBe('Name: Asha Patel\nPhone: +91 98765 43210\nOrder No.: A-1001\nStatus: Shipped');
  });

  it('reports not found when no row has the number', async () => {
    const r = await service.lookupRow(integration, {
      spreadsheetId: SHEET_ID,
      keyColumn: 'Phone',
      value: '9000000000',
    });
    expect(r.found).toBe(false);
    expect(r.headers).toEqual(['Name', 'Phone', 'Order No.', 'Status']);
  });

  it('finds a row by any text column, such as an order number', async () => {
    const r = await service.lookupRow(integration, {
      spreadsheetId: SHEET_ID,
      keyColumn: 'Order No.',
      value: 'a-1002',
    });
    expect(r.found).toBe(true);
    expect(r.fields?.['name']).toBe('Ravi Shah');
  });

  it('tells the user when the key column is missing', async () => {
    await expect(
      service.lookupRow(integration, { spreadsheetId: SHEET_ID, keyColumn: 'Email', value: 'x@y.z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a spreadsheet id that is not an id', async () => {
    await expect(service.lookupRow(integration, { spreadsheetId: 'bad id', value: '1' })).rejects.toThrow(
      'Enter a valid spreadsheet ID',
    );
  });

  it('reads the tab the user chose', async () => {
    await service.lookupRow(integration, { spreadsheetId: SHEET_ID, sheetName: 'Orders', value: '9876543210' });
    const urls = (fetchMock.mock.calls as Array<[string]>).map(c => String(c[0]));
    expect(urls.some(u => u.includes('/values/Orders'))).toBe(true);
  });

  it('refuses a tab that does not exist and lists the real tabs', async () => {
    await expect(
      service.lookupRow(integration, { spreadsheetId: SHEET_ID, sheetName: 'Sheet9', value: '9876543210' }),
    ).rejects.toThrow('No tab named "Sheet9" in this spreadsheet. Tabs here: Sheet1, Orders');
  });
});

import { WebhookTestController } from './webhook-test.controller';

describe('WebhookTestController', () => {
  let controller: WebhookTestController;

  beforeEach(() => {
    controller = new WebhookTestController();
    controller.clearRequests();
  });

  it('captures incoming webhook and echoes details', () => {
    const mockReq: any = {
      method: 'POST',
      path: '/api/webhook-test/echo',
      originalUrl: '/api/webhook-test/echo?test=123',
      query: { test: '123' },
      headers: { 'content-type': 'application/json', 'x-custom': 'openwa' },
      body: { message: 'hello world' },
      ip: '127.0.0.1',
    };

    let responseStatus = 0;
    let responseBody: any = null;

    const mockRes: any = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: any) => {
            responseBody = data;
            return data;
          },
        };
      },
    };

    controller.handleEchoWebhook(mockReq, mockRes);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.query.test).toBe('123');
    expect(responseBody.body.message).toBe('hello world');

    const requests = controller.getRequests();
    expect(requests.total).toBe(1);
    expect(requests.requests[0].body.message).toBe('hello world');
  });

  it('clears requests correctly', () => {
    const mockReq: any = {
      method: 'GET',
      path: '/api/webhook-test',
      query: {},
      headers: {},
      body: null,
    };
    const mockRes: any = {
      status: () => ({ json: (d: any) => d }),
    };

    controller.handleRootWebhook(mockReq, mockRes);
    expect(controller.getRequests().total).toBe(1);

    controller.clearRequests();
    expect(controller.getRequests().total).toBe(0);
  });

  it('renders HTML UI when request Accept header contains text/html', () => {
    const mockReq: any = {
      method: 'GET',
      path: '/api/webhook-test/echo',
      originalUrl: '/api/webhook-test/echo',
      query: {},
      headers: { accept: 'text/html,application/xhtml+xml' },
      body: null,
      protocol: 'http',
      get: (header: string) => {
        if (header.toLowerCase() === 'host') return 'localhost:2785';
        if (header.toLowerCase() === 'accept') return 'text/html,application/xhtml+xml';
        return undefined;
      },
    };

    let responseStatus = 0;
    let htmlOutput = '';
    const mockRes: any = {
      setHeader: jest.fn(),
      status: (code: number) => {
        responseStatus = code;
        return {
          send: (html: string) => {
            htmlOutput = html;
            return html;
          },
        };
      },
    };

    controller.handleEchoWebhook(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(htmlOutput).toContain('<!DOCTYPE html>');
    expect(htmlOutput).toContain('OpenWA Webhook Echo & Live Inspector');
  });

  it('renders HTML UI via handleInspectorUi directly', () => {
    const mockReq: any = {
      method: 'GET',
      path: '/api/webhook-test/ui',
      originalUrl: '/api/webhook-test/ui',
      query: {},
      headers: {},
      protocol: 'http',
      get: (header: string) => (header === 'host' ? 'localhost:2785' : undefined),
    };

    let htmlOutput = '';
    const mockRes: any = {
      setHeader: jest.fn(),
      status: () => ({
        send: (html: string) => {
          htmlOutput = html;
          return html;
        },
      }),
    };

    controller.handleInspectorUi(mockReq, mockRes);
    expect(htmlOutput).toContain('OpenWA Webhook Echo & Live Inspector');
  });
});

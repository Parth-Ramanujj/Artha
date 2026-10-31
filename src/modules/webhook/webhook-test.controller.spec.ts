import type { Request, Response } from 'express';
import { WebhookTestController } from './webhook-test.controller';

interface EchoBody {
  success: boolean;
  query: { test: string };
  body: { message: string };
}

describe('WebhookTestController', () => {
  let controller: WebhookTestController;

  beforeEach(() => {
    controller = new WebhookTestController();
    controller.clearRequests();
  });

  it('captures incoming webhook and echoes details', () => {
    const mockReq = {
      method: 'POST',
      path: '/api/webhook-test/echo',
      originalUrl: '/api/webhook-test/echo?test=123',
      query: { test: '123' },
      headers: { 'content-type': 'application/json', 'x-custom': 'openwa' },
      body: { message: 'hello world' },
      ip: '127.0.0.1',
    } as unknown as Request;

    let responseStatus = 0;
    let responseBody = {} as EchoBody;

    const mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (data: EchoBody) => {
            responseBody = data;
            return data;
          },
        };
      },
    } as unknown as Response;

    controller.handleEchoWebhook(mockReq, mockRes);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.query.test).toBe('123');
    expect(responseBody.body.message).toBe('hello world');

    const requests = controller.getRequests();
    expect(requests.total).toBe(1);
    expect((requests.requests[0].body as { message: string }).message).toBe('hello world');
  });

  it('clears requests correctly', () => {
    const mockReq = {
      method: 'GET',
      path: '/api/webhook-test',
      query: {},
      headers: {},
      body: null,
    } as unknown as Request;
    const mockRes = {
      status: () => ({ json: (d: unknown) => d }),
    } as unknown as Response;

    controller.handleRootWebhook(mockReq, mockRes);
    expect(controller.getRequests().total).toBe(1);

    controller.clearRequests();
    expect(controller.getRequests().total).toBe(0);
  });

  it('renders HTML UI when request Accept header contains text/html', () => {
    const mockReq = {
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
    } as unknown as Request;

    let responseStatus = 0;
    let htmlOutput = '';
    const mockRes = {
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
    } as unknown as Response;

    controller.handleEchoWebhook(mockReq, mockRes);
    expect(responseStatus).toBe(200);
    expect(htmlOutput).toContain('<!DOCTYPE html>');
    expect(htmlOutput).toContain('OpenWA Webhook Echo & Live Inspector');
  });

  it('renders HTML UI via handleInspectorUi directly', () => {
    const mockReq = {
      method: 'GET',
      path: '/api/webhook-test/ui',
      originalUrl: '/api/webhook-test/ui',
      query: {},
      headers: {},
      protocol: 'http',
      get: (header: string) => (header === 'host' ? 'localhost:2785' : undefined),
    } as unknown as Request;

    let htmlOutput = '';
    const mockRes = {
      setHeader: jest.fn(),
      status: () => ({
        send: (html: string) => {
          htmlOutput = html;
          return html;
        },
      }),
    } as unknown as Response;

    controller.handleInspectorUi(mockReq, mockRes);
    expect(htmlOutput).toContain('OpenWA Webhook Echo & Live Inspector');
  });
});

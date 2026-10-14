import { Controller, All, Get, Delete, Req, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/auth.decorators';
import { renderWebhookInspectorHtml } from './webhook-inspector.html';

export interface CapturedWebhookRequest {
  id: string;
  method: string;
  path: string;
  url: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
  receivedAt: string;
}

@ApiTags('webhook-test')
@Controller('webhook-test')
@Public()
export class WebhookTestController {
  private static readonly MAX_HISTORY = 100;
  private static readonly requestHistory: CapturedWebhookRequest[] = [];

  /**
   * Dedicated interactive UI endpoint: /api/webhook-test/ui
   */
  @Get('ui')
  @ApiOperation({ summary: 'Interactive Webhook Inspector & Live Tester UI' })
  handleInspectorUi(@Req() req: Request, @Res() res: Response) {
    const host = (req.get ? req.get('host') : req.headers?.host) || 'localhost:2785';
    const protocol = req.protocol || 'http';
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;
    const nonce = (res.locals?.cspNonce as string) || '';
    const html = renderWebhookInspectorHtml(
      fullUrl,
      WebhookTestController.requestHistory[WebhookTestController.requestHistory.length - 1],
      WebhookTestController.requestHistory,
      nonce,
    );
    res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
    return res.status(HttpStatus.OK).send(html);
  }

  /**
   * Get recently received webhook requests (newest first)
   */
  @Get('requests')
  @ApiOperation({ summary: 'Get list of recently received webhook test calls' })
  @ApiResponse({ status: 200, description: 'List of received webhook calls' })
  getRequests() {
    return {
      total: WebhookTestController.requestHistory.length,
      requests: [...WebhookTestController.requestHistory].reverse(),
    };
  }

  /**
   * Get the single latest received webhook request
   */
  @Get('latest')
  @ApiOperation({ summary: 'Get the latest received webhook test call' })
  @ApiResponse({ status: 200, description: 'Latest received webhook call' })
  getLatestRequest(@Res() res: Response) {
    const latest = WebhookTestController.requestHistory[WebhookTestController.requestHistory.length - 1];
    if (!latest) {
      return res.status(HttpStatus.NOT_FOUND).json({
        message: 'No webhook requests captured yet',
      });
    }
    return res.status(HttpStatus.OK).json(latest);
  }

  /**
   * Clear captured requests history
   */
  @Delete('requests')
  @ApiOperation({ summary: 'Clear captured webhook request history' })
  @ApiResponse({ status: 200, description: 'History cleared' })
  clearRequests() {
    WebhookTestController.requestHistory.length = 0;
    return {
      success: true,
      message: 'Captured webhook request history cleared',
    };
  }

  /**
   * Dedicated echo endpoint for testing webhooks: /api/webhook-test/echo
   */
  @All('echo')
  @ApiOperation({ summary: 'Dedicated echo endpoint for testing webhooks' })
  handleEchoWebhook(@Req() req: Request, @Res() res: Response) {
    return this.captureAndRespond(req, res);
  }

  /**
   * Catch-all endpoint: /api/webhook-test/catch
   */
  @All('catch')
  @ApiOperation({ summary: 'Catch endpoint for testing webhooks' })
  handleCatchWebhook(@Req() req: Request, @Res() res: Response) {
    return this.captureAndRespond(req, res);
  }

  /**
   * Parameter-scoped receiver endpoint: /api/webhook-test/receiver/:id
   */
  @All('receiver/:id')
  @ApiOperation({ summary: 'Parameter-scoped receiver endpoint' })
  handleScopedWebhook(@Req() req: Request, @Res() res: Response) {
    return this.captureAndRespond(req, res);
  }

  /**
   * Root catch-all endpoint: /api/webhook-test
   */
  @All()
  @ApiOperation({ summary: 'Catch and echo any webhook or API call' })
  handleRootWebhook(@Req() req: Request, @Res() res: Response) {
    return this.captureAndRespond(req, res);
  }

  private captureAndRespond(req: Request, res: Response) {
    const headers: Record<string, string> = {};
    if (req.headers) {
      for (const [key, val] of Object.entries(req.headers)) {
        if (val !== undefined) {
          headers[key] = Array.isArray(val) ? val.join(', ') : String(val);
        }
      }
    }

    const captured: CapturedWebhookRequest = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      method: req.method || 'GET',
      path: req.path || '/api/webhook-test/echo',
      url: req.originalUrl || req.url || '/api/webhook-test/echo',
      query: (req.query as Record<string, unknown>) || {},
      headers,
      body: req.body ?? null,
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      receivedAt: new Date().toISOString(),
    };

    WebhookTestController.requestHistory.push(captured);
    if (WebhookTestController.requestHistory.length > WebhookTestController.MAX_HISTORY) {
      WebhookTestController.requestHistory.shift();
    }

    // If request comes from a browser navigation (Accept: text/html) and doesn't explicitly want json
    const rawAccept = (typeof req.get === 'function' ? req.get('accept') : undefined) || req.headers?.accept || (req.headers as any)?.Accept || '';
    const acceptHeader = typeof rawAccept === 'string' ? rawAccept : '';
    const isBrowserHtml =
      (req.method === 'GET' || !req.method) &&
      !req.query?.json &&
      req.query?.format !== 'json' &&
      acceptHeader.includes('text/html');

    if (isBrowserHtml) {
      const host = (req.get ? req.get('host') : req.headers?.host) || 'localhost:2785';
      const protocol = req.protocol || 'http';
      const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;
      const nonce = (res.locals?.cspNonce as string) || '';
      const html = renderWebhookInspectorHtml(
        fullUrl,
        captured,
        WebhookTestController.requestHistory,
        nonce,
      );
      res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
      const statusRes = res.status(HttpStatus.OK);
      if (typeof statusRes?.send === 'function') {
        return statusRes.send(html);
      }
      if (typeof (res as any).send === 'function') {
        return (res as any).send(html);
      }
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'Webhook received successfully by OpenWA test receiver!',
      id: captured.id,
      receivedAt: captured.receivedAt,
      method: captured.method,
      url: captured.url,
      query: captured.query,
      headers: captured.headers,
      body: captured.body,
      ip: captured.ip,
    });
  }
}

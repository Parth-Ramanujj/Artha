import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { CallRunnerService } from './call-runner.service';
import { BrowserTransport, TwilioTransport } from './transports';
import { createLogger } from '../../common/services/logger.service';

export const TWILIO_STREAM_PATH = '/api/ai-calling/stream';
export const BROWSER_STREAM_PATH = '/api/ai-calling/browser';
// The first message (Twilio "start" / browser "start") must carry the call token within this time.
const START_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD = 256 * 1024;

/** Accepts the audio websockets for AI calls on the API's own HTTP server. */
@Injectable()
export class MediaGatewayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = createLogger('AiCallMediaGateway');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  private server?: Server;
  private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) =>
    this.handleUpgrade(req, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly runner: CallRunnerService,
  ) {}

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter?.getHttpServer() as Server | undefined;
    if (!server) return;
    this.server = server;
    server.on('upgrade', this.onUpgrade);
  }

  onModuleDestroy(): void {
    this.server?.off('upgrade', this.onUpgrade);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = (req.url ?? '').split('?')[0];
    if (path !== TWILIO_STREAM_PATH && path !== BROWSER_STREAM_PATH) return; // socket.io and others handle theirs
    this.wss.handleUpgrade(req, socket, head, ws => {
      const browser = path === BROWSER_STREAM_PATH;
      const transport = browser ? new BrowserTransport(ws) : new TwilioTransport(ws);
      const timeout = setTimeout(() => ws.close(), START_TIMEOUT_MS);
      transport.once('start', ({ token }: { token?: string }) => {
        clearTimeout(timeout);
        void this.runner
          .attach(token, transport, browser ? 'browser' : 'phone')
          .then(ok => {
            if (!ok)
              this.logger.warn(`Rejected ${browser ? 'browser' : 'Twilio'} stream with an invalid or stale token`);
          })
          .catch(err => {
            this.logger.error('Could not start AI call', err instanceof Error ? err.message : String(err));
            ws.close();
          });
      });
    });
  }
}

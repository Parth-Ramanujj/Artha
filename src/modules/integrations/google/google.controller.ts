import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireActiveBusiness } from '../../auth/guards/business-scope.guard';
import { CurrentApiKey, Public, RequireRole, RequireUnscopedKey } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { Integration } from '../entities/integration.entity';
import { GoogleServiceId, GoogleWorkspaceService, googleServiceForType } from './google-workspace.service';
import { IntegrationService } from '../integration.service';

/**
 * Where to send the user after Google: the dashboard they started from, if it is localhost or the
 * configured DASHBOARD_URL. Anything else falls back to DASHBOARD_URL, so a foreign page can't redirect us.
 */
export function returnOriginFor(req: Request): string {
  const fallback = (process.env.DASHBOARD_URL ?? '').replace(/\/$/, '');
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!origin) return fallback;
  try {
    const u = new URL(origin);
    const configured = fallback ? new URL(fallback).origin : '';
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return local || u.origin === configured ? u.origin : fallback;
  } catch {
    return fallback;
  }
}

/** Starts "Sign in with Google" and runs test calls. Admin keys only (they connect a whole account). */
@ApiTags('google')
@Controller('google')
@RequireActiveBusiness()
export class GoogleController {
  constructor(
    private readonly google: GoogleWorkspaceService,
    private readonly integrations: IntegrationService,
  ) {}

  @Get(':id/sheet-preview')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Column headers and first rows of a sheet tab' })
  async sheetPreview(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('spreadsheetId') spreadsheetId: string,
    @Query('sheetName') sheetName?: string,
  ) {
    const integration: Integration = await this.integrations.findOne(id, apiKey.businessId ?? '');
    return this.google.sheetPreview(integration, { spreadsheetId: String(spreadsheetId ?? ''), sheetName });
  }

  @Post(':id/lookup')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Find a row in a sheet by key, to preview a Sheets lookup' })
  async lookup(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { spreadsheetId?: string; sheetName?: string; keyColumn?: string; value?: string },
  ) {
    const integration: Integration = await this.integrations.findOne(id, apiKey.businessId ?? '');
    return this.google.lookupRow(integration, {
      spreadsheetId: String(body?.spreadsheetId ?? ''),
      sheetName: body?.sheetName,
      keyColumn: body?.keyColumn,
      value: String(body?.value ?? ''),
    });
  }

  @Get(':id/spreadsheets')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'List the Google Sheets in the connected account' })
  async spreadsheets(@CurrentApiKey() apiKey: { businessId?: string }, @Param('id', ParseUUIDPipe) id: string) {
    const integration: Integration = await this.integrations.findOne(id, apiKey.businessId ?? '');
    return { files: await this.google.listSpreadsheets(integration) };
  }

  @Get('status')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Whether Google sign-in is configured on this server' })
  status() {
    return this.google.status();
  }

  @Post('oauth/start')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Get the Google consent URL for the chosen services' })
  start(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Body() body: { services?: unknown; integrationId?: string },
    @Req() req: Request,
  ) {
    return this.google.startAuth(
      apiKey.businessId ?? '',
      { services: body?.services, integrationId: body?.integrationId ?? null },
      returnOriginFor(req),
    );
  }

  @Post(':id/test')
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Check the Google connection, or run one read or test call for a service' })
  async test(
    @CurrentApiKey() apiKey: { businessId?: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      service?: GoogleServiceId;
      to?: string;
      spreadsheetId?: string;
      range?: string;
      subject?: string;
      text?: string;
    },
  ) {
    const businessId = apiKey.businessId ?? '';
    const integration: Integration = await this.integrations.findOne(id, businessId);
    const service = body?.service ?? googleServiceForType(integration.type) ?? undefined;
    if (!service) return this.google.verify(integration);

    switch (service) {
      case 'gmail': {
        const to = (body.to ?? '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
          throw new BadRequestException('Enter a valid email address to send the test to');
        const info = await this.google.gmailSend(integration, {
          to,
          subject: String(body.subject || 'Test email from Artha').slice(0, 200),
          text: String(body.text || 'This is a test email. Your Google (Gmail) connection is working.').slice(0, 20000),
        });
        return { success: true, messageId: info.id };
      }
      case 'calendar': {
        const res = await this.google.calendarUpcoming(integration, 3);
        const events = Array.isArray(res.items) ? (res.items as Array<{ summary?: string }>) : [];
        return { success: true, message: `Found ${events.length} upcoming event(s)` };
      }
      case 'drive': {
        const res = await this.google.driveFiles(integration, 5);
        const files = Array.isArray(res.files) ? res.files : [];
        return { success: true, message: `Drive reachable (${files.length} file(s) listed)` };
      }
      case 'sheets': {
        const spreadsheetId = (body.spreadsheetId ?? '').trim();
        const range = (body.range ?? 'Sheet1').trim() || 'Sheet1';
        const res = await this.google.sheetsAppend(integration, spreadsheetId, range, [
          new Date().toISOString(),
          'Artha connection test',
        ]);
        return {
          success: true,
          message: `Test row added to ${String((res.updates as { updatedRange?: string })?.updatedRange ?? range)}`,
        };
      }
      default:
        throw new BadRequestException('Unknown Google service');
    }
  }
}

/**
 * Google sends the browser back here after the user approves. It is public because Google calls it
 * directly; the one-time state value in the link is what ties it to the business that started it.
 */
@ApiTags('google')
@Controller('google/oauth')
export class GoogleOAuthCallbackController {
  constructor(private readonly google: GoogleWorkspaceService) {}

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Google OAuth redirect target (not for direct use)' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const fallback = (process.env.DASHBOARD_URL ?? '').replace(/\/$/, '');
    if (error || !code || !state) {
      return res.redirect(
        `${fallback}/integrations?google=error&message=${encodeURIComponent(error ?? 'Sign-in was cancelled')}`,
      );
    }
    try {
      const { returnTo } = await this.google.completeAuth(code, state);
      return res.redirect(`${returnTo || fallback}/integrations?google=connected`);
    } catch (err) {
      return res.redirect(
        `${fallback}/integrations?google=error&message=${encodeURIComponent((err as Error).message)}`,
      );
    }
  }
}

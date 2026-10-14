import { Controller, Get, Put, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { isSwaggerEnabled } from '../../config/bootstrap-security';
import * as fs from 'fs';
import * as path from 'path';

interface Settings {
  general: {
    apiBaseUrl: string;
    autoReconnect: boolean;
    debugMode: boolean;
  };
  api: {
    rateLimit: number;
    rateLimitWindow: number;
    enableDocs: boolean;
  };
  notifications: {
    emailEnabled: boolean;
    notificationEmail: string;
    webhookAlerts: boolean;
  };
}

interface RuntimeSettings {
  notifications: {
    emailEnabled?: boolean;
    notificationEmail?: string;
    webhookAlerts?: boolean;
  };
  [key: string]: unknown;
}

const RUNTIME_SETTINGS_PATH = path.resolve(process.env.DATA_DIR || './data', 'runtime-settings.json');

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  private envSettings: Settings;
  private runtimeOverrides: RuntimeSettings;

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('port', 2785);

    this.envSettings = {
      general: {
        apiBaseUrl: process.env.BASE_URL || `http://localhost:${port}`,
        autoReconnect: true,
        debugMode: this.configService.get<boolean>('database.logging', false),
      },
      api: {
        rateLimit: this.configService.get<number>('api.rateLimit.mediumLimit', 100),
        rateLimitWindow: this.configService.get<number>('api.rateLimit.mediumTtl', 60000),
        enableDocs: isSwaggerEnabled(process.env.ENABLE_SWAGGER, process.env.NODE_ENV),
      },
      notifications: {
        emailEnabled: false,
        notificationEmail: '',
        webhookAlerts: true,
      },
    };

    this.runtimeOverrides = this.loadRuntimeSettings();
  }

  private loadRuntimeSettings(): RuntimeSettings {
    try {
      if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
        const raw = fs.readFileSync(RUNTIME_SETTINGS_PATH, 'utf-8');
        return JSON.parse(raw) as RuntimeSettings;
      }
    } catch {
      // ignore corrupted file
    }
    return { notifications: {} };
  }

  private saveRuntimeSettings(): void {
    const dir = path.dirname(RUNTIME_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(this.runtimeOverrides, null, 2), 'utf-8');
  }

  private getMergedSettings(): Settings {
    return {
      ...this.envSettings,
      notifications: {
        ...this.envSettings.notifications,
        ...this.runtimeOverrides.notifications,
      },
    };
  }

  @Get()
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Get application settings' })
  @ApiResponse({ status: 200, description: 'Current settings' })
  get(): Settings {
    return this.getMergedSettings();
  }

  @Put()
  @RequireRole(ApiKeyRole.ADMIN)
  @RequireUnscopedKey()
  @ApiOperation({ summary: 'Update runtime-configurable settings (notification preferences)' })
  @ApiResponse({ status: 200, description: 'Updated settings' })
  update(@Body() body: Partial<{ notifications: Partial<Settings['notifications']> }>): Settings {
    if (body.notifications) {
      const n = body.notifications;
      if (n.emailEnabled !== undefined) {
        if (typeof n.emailEnabled !== 'boolean') throw new BadRequestException('emailEnabled must be boolean');
        this.runtimeOverrides.notifications.emailEnabled = n.emailEnabled;
      }
      if (n.notificationEmail !== undefined) {
        if (typeof n.notificationEmail !== 'string') throw new BadRequestException('notificationEmail must be string');
        this.runtimeOverrides.notifications.notificationEmail = n.notificationEmail;
      }
      if (n.webhookAlerts !== undefined) {
        if (typeof n.webhookAlerts !== 'boolean') throw new BadRequestException('webhookAlerts must be boolean');
        this.runtimeOverrides.notifications.webhookAlerts = n.webhookAlerts;
      }
    }

    this.saveRuntimeSettings();
    return this.getMergedSettings();
  }
}

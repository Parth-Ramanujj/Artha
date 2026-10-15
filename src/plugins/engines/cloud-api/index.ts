/**
 * WhatsApp Cloud API Engine Plugin
 * Built-in engine plugin that wraps the official Meta WhatsApp Cloud API.
 */

import { PluginContext, PluginType, IEnginePlugin } from '../../../core/plugins';
import { IWhatsAppEngine } from '../../../engine/interfaces/whatsapp-engine.interface';
import { CloudApiAdapter } from '../../../engine/adapters/cloud-api.adapter';

export class CloudApiPlugin implements IEnginePlugin {
  type = PluginType.ENGINE as const;
  private context?: PluginContext;

  constructor(private readonly registeredConfig?: Record<string, unknown>) {}

  onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.log('Cloud API engine plugin loaded');
    return Promise.resolve();
  }

  onEnable(context: PluginContext): Promise<void> {
    context.logger.log('Cloud API engine plugin enabled');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    context.logger.log('Cloud API engine plugin disabled');
    return Promise.resolve();
  }

  createEngine(config: Record<string, unknown>): IWhatsAppEngine {
    const sessionId = config.sessionId as string;
    const globalConfig = (this.context?.config ?? this.registeredConfig ?? {}) as {
      cloudApi?: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaId?: string;
        verifyToken?: string;
        appSecret?: string;
        appId?: string;
        graphApiVersion?: string;
      };
    };
    const globalCloudApi = globalConfig.cloudApi ?? {};

    // Per-session Cloud API credentials override the global defaults.
    const perSession = (config.cloudApi ?? {}) as Record<string, string | undefined>;
    const merged = {
      accessToken: perSession.accessToken || globalCloudApi.accessToken,
      phoneNumberId: perSession.phoneNumberId || globalCloudApi.phoneNumberId,
      wabaId: perSession.wabaId || globalCloudApi.wabaId,
      verifyToken: perSession.verifyToken || globalCloudApi.verifyToken,
      appSecret: perSession.appSecret || globalCloudApi.appSecret,
      appId: perSession.appId || globalCloudApi.appId,
      graphApiVersion: perSession.graphApiVersion || globalCloudApi.graphApiVersion,
    };

    if (!merged.accessToken) {
      throw new Error(
        'Cloud API engine requires an access token (set CLOUD_API_ACCESS_TOKEN globally or provide per-session cloudApi.accessToken)',
      );
    }
    if (!merged.phoneNumberId) {
      throw new Error(
        'Cloud API engine requires a phone number ID (set CLOUD_API_PHONE_NUMBER_ID globally or provide per-session cloudApi.phoneNumberId)',
      );
    }

    return new CloudApiAdapter({
      sessionId,
      accessToken: merged.accessToken,
      phoneNumberId: merged.phoneNumberId,
      wabaId: merged.wabaId,
      verifyToken: merged.verifyToken,
      appSecret: merged.appSecret,
      appId: merged.appId,
      graphApiVersion: merged.graphApiVersion,
    });
  }

  getFeatures(): string[] {
    return [
      'text-messages',
      'media-messages',
      'location-messages',
      'contact-messages',
      'message-reactions',
      'message-replies',
      'template-messages',
      'interactive-messages',
    ];
  }

  getEngineLibrary(): { name: string; version: string } {
    return { name: 'whatsapp-cloud-api', version: 'v21.0' };
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({ healthy: true, message: 'Cloud API engine is available' });
  }
}

export default CloudApiPlugin;

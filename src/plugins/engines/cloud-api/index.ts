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
    const engineConfig = (this.context?.config ?? this.registeredConfig ?? {}) as {
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
    const cloudApiConfig = engineConfig.cloudApi ?? {};

    if (!cloudApiConfig.accessToken) {
      throw new Error('CLOUD_API_ACCESS_TOKEN is required for the Cloud API engine');
    }
    if (!cloudApiConfig.phoneNumberId) {
      throw new Error('CLOUD_API_PHONE_NUMBER_ID is required for the Cloud API engine');
    }

    return new CloudApiAdapter({
      sessionId,
      accessToken: cloudApiConfig.accessToken,
      phoneNumberId: cloudApiConfig.phoneNumberId,
      wabaId: cloudApiConfig.wabaId,
      verifyToken: cloudApiConfig.verifyToken,
      appSecret: cloudApiConfig.appSecret,
      appId: cloudApiConfig.appId,
      graphApiVersion: cloudApiConfig.graphApiVersion,
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

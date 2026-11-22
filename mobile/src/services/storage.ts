import * as SecureStore from 'expo-secure-store';

/**
 * Robust Cross-Platform Secure Storage
 * Uses expo-secure-store on Native (iOS/Android) with in-memory fallback
 * for testing, web or environments where keychain is unavailable.
 */
class SafeStorageService {
  private memCache: Map<string, string> = new Map();

  async getItem(key: string): Promise<string | null> {
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        return await SecureStore.getItemAsync(key);
      }
    } catch {
      // Fallback to memory cache
    }
    return this.memCache.get(key) || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.memCache.set(key, value);
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        await SecureStore.setItemAsync(key, value);
      }
    } catch {
      // Kept in memory cache
    }
  }

  async removeItem(key: string): Promise<void> {
    this.memCache.delete(key);
    try {
      const isAvailable = await SecureStore.isAvailableAsync();
      if (isAvailable) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch {
      // Removed from memory
    }
  }
}

export const safeStorage = new SafeStorageService();

export const StorageKeys = {
  API_KEY: 'openwa_api_key',
  SERVER_URL: 'openwa_server_url',
  ACTIVE_WORKSPACE_ID: 'openwa_active_workspace_id',
  TENANT_TOKEN: 'openwa_tenant_token',
};

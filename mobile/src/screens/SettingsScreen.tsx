import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {
  Settings2,
  Server,
  Key,
  Shield,
  Layers,
  Plus,
  CheckCircle2,
  AlertCircle,
  Activity,
  Terminal,
  LogOut,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { Workspace, WebhookLog } from '../types';
import { api } from '../services/api';

interface SettingsScreenProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  webhookLogs: WebhookLog[];
  onSelectWorkspace: (workspace: Workspace) => void;
  onAddWorkspace: (workspace: Workspace) => void;
  onLogout?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  workspaces,
  activeWorkspace,
  webhookLogs,
  onSelectWorkspace,
  onAddWorkspace,
  onLogout,
}) => {
  // Server Configuration
  const [serverUrl, setServerUrl] = useState(api.getServerUrl());
  const [apiKey, setApiKey] = useState(api.getApiKey());
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  // Provision Tenant Modal
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState<'Growth' | 'Enterprise' | 'Starter'>('Growth');
  const [provisioning, setProvisioning] = useState(false);

  const handleSaveConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    const result = await api.validateConnection(serverUrl.trim(), apiKey.trim());
    setTestingConnection(false);
    if (result.valid) {
      setConnectionStatus(`Verified & saved! Role: ${result.role?.toUpperCase() || 'ADMIN'}`);
    } else {
      setConnectionStatus(result.error || 'Failed to verify. Please check Server URL and API Key.');
    }
    setTimeout(() => setConnectionStatus(null), 5000);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    const result = await api.validateConnection(serverUrl.trim(), apiKey.trim());
    setTestingConnection(false);
    if (result.valid) {
      setConnectionStatus(`Connected successfully! Authenticated as ${result.role?.toUpperCase() || 'ADMIN'}`);
    } else {
      setConnectionStatus(result.error || 'Connection failed. Check Server URL and API Key.');
    }
  };

  const handleProvisionTenant = async () => {
    if (!newTenantName.trim() || !newTenantSlug.trim()) return;

    setProvisioning(true);
    await api.provisionTenant({
      name: newTenantName.trim(),
      slug: newTenantSlug.trim(),
      plan: newTenantPlan,
    });
    setProvisioning(false);

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: newTenantName.trim(),
      slug: newTenantSlug.trim(),
      plan: newTenantPlan,
      businessUuid: `biz-${Math.random().toString(36).substring(2, 7)}`,
      activeChannels: 0,
      createdAt: 'Just now',
    };

    onAddWorkspace(newWs);
    onSelectWorkspace(newWs);
    setShowProvisionModal(false);
    setNewTenantName('');
    setNewTenantSlug('');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Terminal size={20} color={Colors.primary} />
            <Text style={styles.headerTitle}>Tenant Workspaces & API Gateway</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            OpenWA Artha Gateway · Multi-Tenant Production
          </Text>
        </View>

        {/* 2. Tenant Workspaces List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tenant Workspaces</Text>
            <TouchableOpacity
              style={styles.provisionBtn}
              onPress={() => setShowProvisionModal(true)}
            >
              <Plus size={14} color={Colors.onPrimary} />
              <Text style={styles.provisionBtnText}>Provision New (+)</Text>
            </TouchableOpacity>
          </View>

          {workspaces.map((ws) => {
            const isSelected = ws.id === activeWorkspace.id;
            return (
              <TouchableOpacity
                key={ws.id}
                style={[
                  styles.workspaceCard,
                  isSelected && styles.workspaceCardSelected,
                ]}
                onPress={() => onSelectWorkspace(ws)}
              >
                <View style={styles.wsInfo}>
                  <Text style={styles.wsName}>{ws.name}</Text>
                  <Text style={styles.wsSlug}>{ws.slug}</Text>
                </View>
                <View style={styles.wsBadges}>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{ws.plan}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. OpenWA Backend Connection & Security */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Backend Connection & API Key</Text>
            <View style={styles.secureTag}>
              <Shield size={12} color={Colors.primary} />
              <Text style={styles.secureTagText}>AES-256 Storage</Text>
            </View>
          </View>

          <View style={styles.configCard}>
            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>OpenWA Server URL</Text>
              <TextInput
                style={styles.input}
                placeholder="http://192.168.1.100:2785"
                placeholderTextColor={Colors.outline}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
              />
              <Text style={styles.fieldHint}>
                Use your local machine LAN IP or cloud domain.
              </Text>
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Tenant / Partner API Key</Text>
              <TextInput
                style={styles.input}
                placeholder="sk_live_..."
                placeholderTextColor={Colors.outline}
                secureTextEntry
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
              />
              <Text style={styles.fieldHint}>
                Passed as x-api-key header on all cloud requests.
              </Text>
            </View>

            {connectionStatus && (
              <View
                style={[
                  styles.statusAlert,
                  connectionStatus.includes('Connected') || connectionStatus.includes('saved')
                    ? styles.statusAlertSuccess
                    : styles.statusAlertError,
                ]}
              >
                {connectionStatus.includes('Connected') || connectionStatus.includes('saved') ? (
                  <CheckCircle2 size={16} color={Colors.primary} />
                ) : (
                  <AlertCircle size={16} color={Colors.error} />
                )}
                <Text style={styles.statusAlertText}>{connectionStatus}</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.saveBtn}
                disabled={testingConnection}
                onPress={handleSaveConnection}
              >
                <Text style={styles.saveBtnText}>Verify & Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.testBtn}
                disabled={testingConnection}
                onPress={handleTestConnection}
              >
                {testingConnection ? (
                  <ActivityIndicator size="small" color={Colors.onSurface} />
                ) : (
                  <Text style={styles.testBtnText}>Test Connection</Text>
                )}
              </TouchableOpacity>
            </View>

            {onLogout && (
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={onLogout}
              >
                <LogOut size={16} color={Colors.error} />
                <Text style={styles.logoutBtnText}>Log Out / Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 4. Live Webhook Inspector */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Webhook Inspector</Text>
            <View style={styles.liveTag}>
              <Activity size={12} color={Colors.primary} />
              <Text style={styles.liveTagText}>Stream Active</Text>
            </View>
          </View>

          <View style={styles.logsCard}>
            {webhookLogs.map((log) => (
              <View key={log.id} style={styles.logItem}>
                <View style={styles.logLeft}>
                  <Text style={styles.logEvent}>{log.event}</Text>
                  <Text style={styles.logSource}>{log.source}</Text>
                </View>
                <View style={styles.logRight}>
                  <View style={styles.statusCodePill}>
                    <Text style={styles.statusCodeText}>{log.statusCode}</Text>
                  </View>
                  <Text style={styles.logTime}>{log.timestamp}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Provision Tenant Modal */}
      <Modal
        visible={showProvisionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProvisionModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Provision New SaaS Tenant</Text>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Company Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Gujarat Organic Mills"
                placeholderTextColor={Colors.outline}
                value={newTenantName}
                onChangeText={(text) => {
                  setNewTenantName(text);
                  setNewTenantSlug(
                    text
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')
                  );
                }}
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Workspace Slug</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., gujarat-organic-mills"
                placeholderTextColor={Colors.outline}
                value={newTenantSlug}
                onChangeText={setNewTenantSlug}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Subscription Plan</Text>
              <View style={styles.planPickerRow}>
                {(['Starter', 'Growth', 'Enterprise'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.planOption,
                      newTenantPlan === p && styles.planOptionSelected,
                    ]}
                    onPress={() => setNewTenantPlan(p)}
                  >
                    <Text
                      style={[
                        styles.planOptionText,
                        newTenantPlan === p && styles.planOptionTextSelected,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowProvisionModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                disabled={provisioning}
                onPress={handleProvisionTenant}
              >
                {provisioning ? (
                  <ActivityIndicator size="small" color={Colors.onPrimary} />
                ) : (
                  <Text style={styles.confirmBtnText}>Create Tenant</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  header: {
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  provisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  provisionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  workspaceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
  },
  workspaceCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  wsInfo: {
    gap: 2,
  },
  wsName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  wsSlug: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  wsBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
  },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secureTagText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
  },
  configCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  fieldItem: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  fieldHint: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  input: {
    height: 42,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.onSurface,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  saveBtn: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  testBtn: {
    paddingHorizontal: Spacing.lg,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
  },
  statusAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  statusAlertSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusAlertError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusAlertText: {
    fontSize: 12,
    color: Colors.onSurface,
    flex: 1,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveTagText: {
    fontSize: 10,
    color: Colors.primary,
  },
  logsCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  logLeft: {
    gap: 2,
    flex: 1,
  },
  logEvent: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  logSource: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  logRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusCodePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusCodeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  logTime: {
    fontSize: 10,
    color: Colors.onSurfaceSubtle,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  planPickerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  planOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
  },
  planOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  planOptionText: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
  },
  planOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  confirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});

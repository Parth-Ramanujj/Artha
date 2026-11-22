import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Share2,
  Plus,
  ShoppingBag,
  Database,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { IntegrationApp } from '../types';

interface IntegrationFabricScreenProps {
  integrations: IntegrationApp[];
  onBack: () => void;
  onToggleIntegration: (id: string) => void;
}

export const IntegrationFabricScreen: React.FC<IntegrationFabricScreenProps> = ({
  integrations,
  onBack,
  onToggleIntegration,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleSyncNow = (name: string) => {
    setToastMsg(`Realtime sync triggered for ${name}!`);
    setTimeout(() => setToastMsg(null), 2500);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={Colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Integration Fabric</Text>
            <Text style={styles.subtitle}>Enterprise E-commerce & CRM Sync</Text>
          </View>
          <View style={styles.activePill}>
            <View style={styles.dot} />
            <Text style={styles.activePillText}>3 Connected</Text>
          </View>
        </View>
      </View>

      {/* Toast */}
      {toastMsg && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.primary} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Connected Systems</Text>
          <Text style={styles.sectionSubtitle}>Bi-directional webhooks active</Text>
        </View>

        <View style={styles.grid}>
          {integrations.map((app) => (
            <View key={app.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIconBox}>
                  {app.type === 'shopify' ? (
                    <ShoppingBag size={20} color={Colors.primary} />
                  ) : (
                    <Database size={20} color={Colors.facebook} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={styles.appIdentifier}>{app.identifier}</Text>
                </View>

                <Switch
                  trackColor={{ false: Colors.outlineVariant, true: Colors.primary }}
                  thumbColor={Colors.onSurface}
                  value={app.status === 'CONNECTED'}
                  onValueChange={() => onToggleIntegration(app.id)}
                />
              </View>

              <Text style={styles.syncStatus}>{app.syncStatus}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.eventsCount}>
                  {app.eventsCount} events synced today
                </Text>
                {app.status === 'CONNECTED' && (
                  <TouchableOpacity
                    style={styles.syncBtn}
                    onPress={() => handleSyncNow(app.name)}
                  >
                    <RefreshCw size={11} color={Colors.primary} />
                    <Text style={styles.syncBtnText}>Sync Now</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: BorderRadius.sm,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  grid: {
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  appIdentifier: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  syncStatus: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.xs,
  },
  eventsCount: {
    fontSize: 10,
    color: Colors.onSurfaceSubtle,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  syncBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
});

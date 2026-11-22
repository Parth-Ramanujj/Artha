import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  RefreshCw,
  Code,
  Shield,
  Layers,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { WebhookLog } from '../types';

interface WebhookInspectorScreenProps {
  logs: WebhookLog[];
  onBack: () => void;
}

export const WebhookInspectorScreen: React.FC<WebhookInspectorScreenProps> = ({
  logs,
  onBack,
}) => {
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(logs[0] || null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleReplay = (log: WebhookLog) => {
    setToastMsg(`Webhook event "${log.event}" replayed successfully to listener!`);
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
            <Text style={styles.title}>Webhook Inspector</Text>
            <Text style={styles.subtitle}>Real-time Meta Cloud API Event Stream</Text>
          </View>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTagText}>Listening</Text>
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
        {/* Stream List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Inbound Webhook Events ({logs.length})</Text>
          <Text style={styles.sectionSubtitle}>Tap event to view JSON payload</Text>
        </View>

        <View style={styles.logsList}>
          {logs.map((log) => {
            const isSelected = selectedLog?.id === log.id;
            return (
              <View
                key={log.id}
                style={[
                  styles.logCard,
                  isSelected && styles.logCardSelected,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setSelectedLog(log)}
                  style={styles.logTop}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logEvent}>{log.event}</Text>
                    <Text style={styles.logSource}>{log.source}</Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{log.statusCode} OK</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.logBottom}>
                  <Text style={styles.logTime}>{log.timestamp}</Text>
                  <TouchableOpacity
                    style={styles.replayBtn}
                    activeOpacity={0.7}
                    onPress={() => handleReplay(log)}
                  >
                    <RefreshCw size={10} color={Colors.primary} />
                    <Text style={styles.replayBtnText}>Re-send Webhook</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Selected JSON Payload Inspector */}
        {selectedLog && (
          <View style={styles.payloadCard}>
            <View style={styles.payloadHeader}>
              <Code size={16} color={Colors.primary} />
              <Text style={styles.payloadTitle}>
                Payload Inspector ({selectedLog.event})
              </Text>
            </View>

            <View style={styles.jsonBox}>
              <Text style={styles.jsonText}>
                {JSON.stringify(
                  selectedLog.payload || {
                    object: 'whatsapp_business_account',
                    entry: [
                      {
                        id: '109482736104',
                        changes: [
                          {
                            value: {
                              messaging_product: 'whatsapp',
                              metadata: { phone_number_id: '284910472819304' },
                              event: selectedLog.event,
                            },
                            field: 'messages',
                          },
                        ],
                      },
                    ],
                  },
                  null,
                  2
                )}
              </Text>
            </View>
          </View>
        )}

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
  liveTag: {
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  liveTagText: {
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
    gap: Spacing.lg,
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
  logsList: {
    gap: Spacing.sm,
  },
  logCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  logCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logEvent: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  logSource: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  logBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  logTime: {
    fontSize: 10,
    color: Colors.onSurfaceSubtle,
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  replayBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  payloadCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  payloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payloadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  jsonBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  jsonText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.primary,
    lineHeight: 16,
  },
});

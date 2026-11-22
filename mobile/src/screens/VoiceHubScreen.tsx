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
  PhoneCall,
  Volume2,
  CheckCircle2,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';

interface VoiceHubScreenProps {
  onBack: () => void;
}

export const VoiceHubScreen: React.FC<VoiceHubScreenProps> = ({ onBack }) => {
  const [autoRecovery, setAutoRecovery] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const callLogs = [
    {
      id: 'c1',
      caller: 'Priya Patel (+91 98251 09876)',
      type: 'missed',
      time: '11:41 AM',
      duration: 'Unanswered',
      status: 'WhatsApp Template Sent in 12s',
      converted: true,
    },
    {
      id: 'c2',
      caller: 'Rajesh Solanki (TechSphere)',
      type: 'inbound',
      time: '10:14 AM',
      duration: '3m 42s',
      status: 'Recorded & Transcribed via Astra AI',
      converted: true,
    },
    {
      id: 'c3',
      caller: 'Aarav Styles Boutiques',
      type: 'outbound',
      time: 'Yesterday',
      duration: '1m 15s',
      status: 'Follow-up Call Completed',
      converted: false,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={Colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Astra AI Voice Hub</Text>
            <Text style={styles.subtitle}>AI Caller & Missed Call Auto-Recovery</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.dot} />
            <Text style={styles.statusPillText}>Voice Live</Text>
          </View>
        </View>

        {/* Recovery Switch */}
        <View style={styles.recoveryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recoveryTitle}>Missed Call WhatsApp Recovery</Text>
            <Text style={styles.recoverySubtitle}>
              Auto-trigger WhatsApp HSM template within 15 seconds of missed call
            </Text>
          </View>
          <Switch
            trackColor={{ false: Colors.outlineVariant, true: Colors.voiceCyan }}
            thumbColor={Colors.onSurface}
            value={autoRecovery}
            onValueChange={setAutoRecovery}
          />
        </View>
      </View>

      {/* Toast */}
      {toastMsg && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.voiceCyan} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Metric Banner */}
        <View style={styles.metricBanner}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Missed Calls</Text>
            <Text style={styles.metricVal}>28</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>WhatsApp Recovered</Text>
            <Text style={[styles.metricVal, { color: Colors.voiceCyan }]}>26 (92%)</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Avg Response</Text>
            <Text style={[styles.metricVal, { color: Colors.primary }]}>14 sec</Text>
          </View>
        </View>

        {/* Call Logs */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Voice Interactions</Text>
        </View>

        <View style={styles.logsList}>
          {callLogs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logTop}>
                <View style={styles.logIconBox}>
                  {log.type === 'missed' ? (
                    <PhoneIncoming size={18} color={Colors.error} />
                  ) : (
                    <PhoneCall size={18} color={Colors.voiceCyan} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.callerText}>{log.caller}</Text>
                  <Text style={styles.timeText}>
                    {log.time} · {log.duration}
                  </Text>
                </View>

                {log.converted && (
                  <View style={styles.convertedBadge}>
                    <Text style={styles.convertedText}>Auto-Nudged</Text>
                  </View>
                )}
              </View>

              <Text style={styles.statusNote}>{log.status}</Text>

              <TouchableOpacity
                style={styles.playRecordingBtn}
                onPress={() => {
                  setPlayingId(playingId === log.id ? null : log.id);
                  setToastMsg(
                    playingId === log.id
                      ? 'Audio stopped.'
                      : 'Playing AI voice call recording...'
                  );
                }}
              >
                <Play size={12} color={Colors.voiceCyan} />
                <Text style={styles.playRecordingText}>
                  {playingId === log.id ? 'Pause Recording' : 'Listen to Audio Log'}
                </Text>
              </TouchableOpacity>
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
    gap: Spacing.md,
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.voiceCyan,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.voiceCyan,
  },
  recoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
  },
  recoveryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  recoverySubtitle: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    borderRadius: BorderRadius.sm,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.voiceCyan,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  metricBanner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  metricBox: {
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  logsList: {
    gap: Spacing.md,
  },
  logCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  logTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  timeText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  convertedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  convertedText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  statusNote: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  playRecordingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  playRecordingText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.voiceCyan,
  },
});

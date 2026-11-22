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
  BellRing,
  AlertTriangle,
  Zap,
  Phone,
  MessageCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { FollowUpTask } from '../types';

interface FollowUpScreenProps {
  tasks: FollowUpTask[];
  onBack: () => void;
  onNudgeContact: (task: FollowUpTask) => void;
}

export const FollowUpScreen: React.FC<FollowUpScreenProps> = ({
  tasks,
  onBack,
  onNudgeContact,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleNudgeAll = () => {
    setToastMsg('1-Click WhatsApp Follow-up HSM nudges dispatched to all 3 hot leads!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleNudgeSingle = (task: FollowUpTask) => {
    onNudgeContact(task);
    setToastMsg(`WhatsApp follow-up reminder sent to ${task.contactName}!`);
    setTimeout(() => setToastMsg(null), 3000);
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
            <Text style={styles.title}>Lead Follow-up Engine</Text>
            <Text style={styles.subtitle}>Priority SLA & Automated WhatsApp Nudges</Text>
          </View>
          <View style={styles.badgesRow}>
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>1 Overdue</Text>
            </View>
            <View style={styles.dueBadge}>
              <Text style={styles.dueText}>4 Due</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Toast Alert */}
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
        {/* 1. Urgent Follow-up Alert Banner */}
        <View style={styles.urgentBanner}>
          <View style={styles.urgentTop}>
            <View style={styles.warningIcon}>
              <AlertTriangle size={18} color={Colors.googleAmber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentTitle}>
                3 hot leads haven't replied in 24 hours. Auto-nudge ready.
              </Text>
              <Text style={styles.slaText}>Priority SLA window active</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.nudgeAllBtn}
            activeOpacity={0.85}
            onPress={handleNudgeAll}
          >
            <Zap size={16} color={Colors.googleAmberDark} />
            <Text style={styles.nudgeAllBtnText}>
              Send 1-Click WhatsApp Follow-up to All
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2. Due Today Schedule Feed */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Due Today ({tasks.length})</Text>
          <Text style={styles.urgentTag}>Urgent</Text>
        </View>

        <View style={styles.taskList}>
          {tasks.map((t) => (
            <View key={t.id} style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{t.contactName}</Text>
                  <Text style={styles.companyText}>{t.company}</Text>
                </View>
                <Text style={styles.valueText}>{t.value}</Text>
              </View>

              <Text style={styles.actionText}>{t.actionRequired}</Text>

              <View style={styles.taskFooter}>
                <View style={styles.duePill}>
                  <Clock size={11} color={Colors.googleAmber} />
                  <Text style={styles.duePillText}>{t.dueTime}</Text>
                </View>

                <TouchableOpacity
                  style={styles.singleNudgeBtn}
                  onPress={() => handleNudgeSingle(t)}
                >
                  <Phone size={11} color={Colors.primary} />
                  <Text style={styles.singleNudgeBtnText}>Nudge via WhatsApp</Text>
                </TouchableOpacity>
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
  badgesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  overdueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  overdueText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.error,
  },
  dueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  dueText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.googleAmber,
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
  urgentBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  urgentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  warningIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
    lineHeight: 18,
  },
  slaText: {
    fontSize: 11,
    color: Colors.googleAmber,
    marginTop: 2,
  },
  nudgeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.googleAmber,
  },
  nudgeAllBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.googleAmberDark,
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
  urgentTag: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.googleAmber,
  },
  taskList: {
    gap: Spacing.md,
  },
  taskCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  companyText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  actionText: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    lineHeight: 16,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.xs,
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  duePillText: {
    fontSize: 11,
    color: Colors.googleAmber,
    fontWeight: '600',
  },
  singleNudgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  singleNudgeBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
});

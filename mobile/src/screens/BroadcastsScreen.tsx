import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import {
  ArrowLeft,
  Megaphone,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  CheckCheck,
  X,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { WhatsAppBroadcast } from '../types';

interface BroadcastsScreenProps {
  broadcasts: WhatsAppBroadcast[];
  onBack: () => void;
  onSendBroadcast: (broadcast: WhatsAppBroadcast) => void;
}

export const BroadcastsScreen: React.FC<BroadcastsScreenProps> = ({
  broadcasts,
  onBack,
  onSendBroadcast,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('festive_vip_offer_v2');
  const [audienceCount, setAudienceCount] = useState('5000');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleLaunch = () => {
    if (!name.trim()) return;

    const newBc: WhatsAppBroadcast = {
      id: `bc-${Date.now()}`,
      name: name.trim(),
      templateName: template,
      audienceSize: parseInt(audienceCount, 10) || 1000,
      sentCount: parseInt(audienceCount, 10) || 1000,
      deliveredPercent: 99.8,
      readRatePercent: 82.4,
      status: 'SENDING',
      createdAt: 'Just now',
    };

    onSendBroadcast(newBc);
    setModalVisible(false);
    setName('');
    setToastMsg(`Campaign "${newBc.name}" queued and sending via Cloud API!`);
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
            <Text style={styles.title}>WhatsApp Broadcasts</Text>
            <Text style={styles.subtitle}>+91 98765 43210 · Official Cloud API</Text>
          </View>
          <View style={styles.tierPill}>
            <View style={styles.tierDot} />
            <Text style={styles.tierText}>Tier: 100k/day</Text>
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
        {/* 1. Metrics Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsRow}
          nestedScrollEnabled={true}
        >
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Campaigns Sent</Text>
            <View style={styles.metricValueRow}>
              <Text style={styles.metricValue}>{broadcasts.length + 40}</Text>
              <Text style={styles.metricDelta}>+6 vs last mo</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Delivered</Text>
            <View style={styles.metricValueRow}>
              <Text style={styles.metricValue}>89,450</Text>
              <Text style={styles.metricDelta}>99.4%</Text>
            </View>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Read Rate</Text>
            <View style={styles.metricValueRow}>
              <Text style={styles.metricValue}>78.2%</Text>
              <Text style={styles.metricDelta}>High Quality</Text>
            </View>
          </View>
        </ScrollView>

        {/* 2. New Campaign Button */}
        <TouchableOpacity
          style={styles.newCampaignBtn}
          activeOpacity={0.85}
          onPress={() => setModalVisible(true)}
        >
          <Plus size={18} color={Colors.onPrimary} />
          <Text style={styles.newCampaignBtnText}>+ Launch New HSM Broadcast</Text>
        </TouchableOpacity>

        {/* 3. Campaign Feed */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Campaign History</Text>
          <Text style={styles.sectionCount}>{broadcasts.length} Campaigns</Text>
        </View>

        <View style={styles.campaignList}>
          {broadcasts.map((bc) => (
            <View key={bc.id} style={styles.campaignCard}>
              <View style={styles.campaignTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campaignName}>{bc.name}</Text>
                  <Text style={styles.templateName}>
                    HSM Template: {bc.templateName}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    bc.status === 'COMPLETED'
                      ? styles.statusBadgeCompleted
                      : styles.statusBadgeSending,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      bc.status === 'COMPLETED'
                        ? { color: Colors.primary }
                        : { color: Colors.googleAmber },
                    ]}
                  >
                    {bc.status}
                  </Text>
                </View>
              </View>

              <View style={styles.statsBar}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Audience</Text>
                  <Text style={styles.statNum}>{bc.audienceSize.toLocaleString()}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Delivered</Text>
                  <Text style={styles.statNum}>{bc.deliveredPercent}%</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Read Rate</Text>
                  <Text style={styles.statNum}>{bc.readRatePercent}%</Text>
                </View>
              </View>

              <View style={styles.campaignFooter}>
                <Text style={styles.createdAtText}>{bc.createdAt}</Text>
                <View style={styles.officialPill}>
                  <CheckCheck size={12} color={Colors.primary} />
                  <Text style={styles.officialPillText}>Meta Verified</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Launch Campaign Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Launch Meta HSM Broadcast</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Campaign Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Diwali Mega Flash Sale VIPs"
                placeholderTextColor={Colors.outline}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Approved WhatsApp HSM Template</Text>
              <View style={styles.pickerBox}>
                <Text style={styles.pickerText}>{template}</Text>
              </View>
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Target Audience Count</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 5000"
                placeholderTextColor={Colors.outline}
                keyboardType="numeric"
                value={audienceCount}
                onChangeText={setAudienceCount}
              />
              <Text style={styles.fieldHint}>
                Daily cloud quota available: 100,000 conversations.
              </Text>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleLaunch}>
              <Send size={15} color={Colors.onPrimary} />
              <Text style={styles.submitBtnText}>Send Cloud Broadcast Now</Text>
            </TouchableOpacity>
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
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  tierText: {
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
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricCard: {
    width: 140,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  metricValueRow: {
    gap: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  metricDelta: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  newCampaignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  newCampaignBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
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
  sectionCount: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  campaignList: {
    gap: Spacing.md,
  },
  campaignCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  campaignTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  campaignName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  templateName: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusBadgeCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusBadgeSending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  statNum: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  campaignFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.xs,
  },
  createdAtText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
  },
  officialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  officialPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  fieldItem: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  fieldHint: {
    fontSize: 10,
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
  pickerBox: {
    height: 42,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  pickerText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});

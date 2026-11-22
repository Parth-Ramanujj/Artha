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
  Kanban,
  Flame,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
  Phone,
  MessageCircle,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { CrmDeal, ChannelType } from '../types';

interface CrmScreenProps {
  deals: CrmDeal[];
  onAdvanceDeal: (dealId: string) => void;
}

export const CrmScreen: React.FC<CrmScreenProps> = ({
  deals,
  onAdvanceDeal,
}) => {
  const [filter, setFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'high'>('all');

  const stages: { key: CrmDeal['stage']; label: string; dotColor: string }[] = [
    { key: 'new', label: 'New Leads', dotColor: Colors.facebook },
    { key: 'qualified', label: 'Qualified', dotColor: Colors.googleAmber },
    { key: 'proposal', label: 'Proposal Sent', dotColor: Colors.neuralIndigo },
    { key: 'won', label: 'Deals Won', dotColor: Colors.primary },
  ];

  const filteredDeals = deals.filter((deal) => {
    if (filter === 'whatsapp') return deal.channel === 'whatsapp';
    if (filter === 'instagram') return deal.channel === 'instagram';
    if (filter === 'high') return deal.priority === 'high';
    return true;
  });

  const getNextStageLabel = (currentStage: CrmDeal['stage']) => {
    switch (currentStage) {
      case 'new':
        return 'Qualify →';
      case 'qualified':
        return 'Proposal →';
      case 'proposal':
        return 'Mark Won ★';
      case 'won':
        return 'Completed';
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Header Metrics Bar */}
      <View style={styles.headerBar}>
        <View style={styles.pipelineTitleRow}>
          <Kanban size={18} color={Colors.primary} />
          <Text style={styles.pipelineTitle}>Main Sales Pipeline</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillText}>Total Value: ₹18,45,000</Text>
          </View>
          <View style={[styles.metricPill, styles.metricPillPrimary]}>
            <Text style={styles.metricPillPrimaryText}>
              {deals.length} Active Deals
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Filter Pills */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterBtnText,
              filter === 'all' && styles.filterBtnTextActive,
            ]}
          >
            All Channels
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filter === 'whatsapp' && styles.filterBtnActive]}
          onPress={() => setFilter('whatsapp')}
        >
          <View style={[styles.filterDot, { backgroundColor: Colors.whatsapp }]} />
          <Text
            style={[
              styles.filterBtnText,
              filter === 'whatsapp' && styles.filterBtnTextActive,
            ]}
          >
            WhatsApp Leads
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filter === 'instagram' && styles.filterBtnActive]}
          onPress={() => setFilter('instagram')}
        >
          <View
            style={[styles.filterDot, { backgroundColor: Colors.instagramPink }]}
          />
          <Text
            style={[
              styles.filterBtnText,
              filter === 'instagram' && styles.filterBtnTextActive,
            ]}
          >
            Instagram DMs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filter === 'high' && styles.filterBtnActive]}
          onPress={() => setFilter('high')}
        >
          <Flame size={12} color={Colors.googleAmber} />
          <Text
            style={[
              styles.filterBtnText,
              filter === 'high' && styles.filterBtnTextActive,
            ]}
          >
            High Priority
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Horizontal Kanban Board */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.kanbanContainer}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {stages.map((stage) => {
          const stageDeals = filteredDeals.filter((d) => d.stage === stage.key);
          return (
            <View key={stage.key} style={styles.columnCard}>
              {/* Column Header */}
              <View style={styles.columnHeader}>
                <View style={styles.colTitleRow}>
                  <View
                    style={[styles.colDot, { backgroundColor: stage.dotColor }]}
                  />
                  <Text style={styles.colTitle}>
                    {stage.label} ({stageDeals.length})
                  </Text>
                </View>
              </View>

              {/* Deal Cards */}
              <ScrollView
                style={styles.columnScroll}
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                {stageDeals.map((deal) => (
                  <View key={deal.id} style={styles.dealCard}>
                    <View style={styles.dealTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dealTitle} numberOfLines={1}>
                          {deal.title}
                        </Text>
                        <Text style={styles.dealCompany}>{deal.company}</Text>
                      </View>
                      {deal.priority === 'high' && (
                        <View style={styles.flameBadge}>
                          <Flame size={12} color={Colors.googleAmber} />
                        </View>
                      )}
                    </View>

                    <View style={styles.dealValueRow}>
                      <Text style={styles.dealValue}>{deal.value}</Text>
                      {deal.tag && (
                        <View style={styles.dealTag}>
                          <Text style={styles.dealTagText}>{deal.tag}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.dealFooter}>
                      <View style={styles.contactRow}>
                        {deal.channel === 'whatsapp' ? (
                          <Phone size={11} color={Colors.whatsapp} />
                        ) : (
                          <MessageCircle size={11} color={Colors.instagramPink} />
                        )}
                        <Text style={styles.contactText}>{deal.contact}</Text>
                      </View>

                      {deal.stage !== 'won' ? (
                        <TouchableOpacity
                          style={styles.advanceBtn}
                          onPress={() => onAdvanceDeal(deal.id)}
                        >
                          <Text style={styles.advanceBtnText}>
                            {getNextStageLabel(deal.stage)}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.wonPill}>
                          <CheckCircle2 size={12} color={Colors.primary} />
                          <Text style={styles.wonPillText}>Won</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}

                {stageDeals.length === 0 && (
                  <View style={styles.emptyColumn}>
                    <Text style={styles.emptyColumnText}>No deals in stage</Text>
                  </View>
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  headerBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  pipelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pipelineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  metricPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  metricPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.onSurface,
  },
  metricPillPrimary: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  metricPillPrimaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterBtnText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  filterBtnTextActive: {
    color: Colors.onPrimary,
    fontWeight: '700',
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kanbanContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  columnCard: {
    width: 290,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '90%',
  },
  columnHeader: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    marginBottom: Spacing.sm,
  },
  colTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  columnScroll: {
    maxHeight: 520,
  },
  columnContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  dealCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dealTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dealTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  dealCompany: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  flameBadge: {
    padding: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  dealValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dealValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  dealTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  dealTagText: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  dealFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
  },
  advanceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  advanceBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  wonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  wonPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyColumn: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyColumnText: {
    fontSize: 12,
    color: Colors.outline,
  },
});

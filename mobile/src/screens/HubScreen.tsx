import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Phone,
  MessageCircle,
  Share2,
  Store,
  Plus,
  Clock,
  Sparkles,
  TrendingUp,
  ShoppingBag,
  Megaphone,
  Star,
  BellRing,
  Layers,
  Cpu,
  PhoneCall,
  Activity,
  Kanban,
  Settings2,
  ChevronRight,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { PlatformConnection, QuickStat, ActivityItem } from '../types';

export type ScreenId =
  | 'hub'
  | 'inbox'
  | 'crm'
  | 'automations'
  | 'settings'
  | 'catalog'
  | 'broadcasts'
  | 'flows'
  | 'followup'
  | 'reviews'
  | 'media'
  | 'integrations'
  | 'ai-agent'
  | 'voice-hub'
  | 'webhooks';

interface HubScreenProps {
  stats: QuickStat[];
  channels: PlatformConnection[];
  activities: ActivityItem[];
  onOpenConnectModal: () => void;
  onNavigateScreen: (screenId: ScreenId) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const HubScreen: React.FC<HubScreenProps> = ({
  stats,
  channels,
  activities,
  onOpenConnectModal,
  onNavigateScreen,
  onRefresh,
  isRefreshing,
}) => {
  const suiteModules = [
    {
      id: 'catalog' as ScreenId,
      name: 'WhatsApp Catalog',
      desc: 'In-chat cart & products',
      icon: ShoppingBag,
      color: Colors.primary,
      badge: '48 Live',
    },
    {
      id: 'broadcasts' as ScreenId,
      name: 'WhatsApp Broadcasts',
      desc: 'Official HSM campaigns',
      icon: Megaphone,
      color: Colors.primary,
      badge: '100k/day',
    },
    {
      id: 'flows' as ScreenId,
      name: 'WhatsApp Flows',
      desc: 'Native in-chat forms',
      icon: Sparkles,
      color: Colors.primary,
      badge: 'Interactive',
    },
    {
      id: 'followup' as ScreenId,
      name: 'Follow-up Engine',
      desc: 'Priority SLA reminders',
      icon: BellRing,
      color: Colors.googleAmber,
      badge: '3 Hot Leads',
    },
    {
      id: 'reviews' as ScreenId,
      name: 'Google Reviews',
      desc: '4.8 ★ AI auto-replies',
      icon: Star,
      color: Colors.googleAmber,
      badge: 'Live Sync',
    },
    {
      id: 'crm' as ScreenId,
      name: 'Sales CRM Kanban',
      desc: 'Deals & lead stages',
      icon: Kanban,
      color: Colors.facebook,
      badge: '₹18.45L',
    },
    {
      id: 'ai-agent' as ScreenId,
      name: 'Astra AI Agent',
      desc: 'Gemini system tuning',
      icon: Cpu,
      color: Colors.neuralIndigo,
      badge: 'Gemini 1.5',
    },
    {
      id: 'voice-hub' as ScreenId,
      name: 'Astra Voice Hub',
      desc: 'Missed call recovery',
      icon: PhoneCall,
      color: Colors.voiceCyan,
      badge: '92% Conv',
    },
    {
      id: 'media' as ScreenId,
      name: 'Media & Status',
      desc: 'WhatsApp stories library',
      icon: Layers,
      color: Colors.primary,
      badge: '24h Stories',
    },
    {
      id: 'integrations' as ScreenId,
      name: 'Integration Fabric',
      desc: 'Shopify, CRM sync',
      icon: Share2,
      color: Colors.primary,
      badge: '3 Active',
    },
    {
      id: 'webhooks' as ScreenId,
      name: 'Webhook Inspector',
      desc: 'Live cloud API logs',
      icon: Activity,
      color: Colors.primary,
      badge: 'Stream',
    },
    {
      id: 'settings' as ScreenId,
      name: 'Tenant Workspaces',
      desc: 'API keys & provisioning',
      icon: Settings2,
      color: Colors.onSurfaceVariant,
      badge: 'Admin',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          ) : undefined
        }
      >
        {/* 1. Quick Stats Carousel */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Omnichannel Pulse</Text>
          <Text style={styles.sectionSubtitle}>Last 30 days</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsCarousel}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
          keyboardShouldPersistTaps="handled"
        >
          {stats.map((item) => (
            <View key={item.id} style={styles.statCard}>
              <Text style={styles.statLabel} numberOfLines={2}>
                {item.label}
              </Text>
              <View style={styles.statValueRow}>
                <Text
                  style={[
                    styles.statValue,
                    item.isAmber && { color: Colors.googleAmber },
                  ]}
                >
                  {item.value}
                </Text>
                {item.delta && (
                  <View style={styles.deltaPill}>
                    <TrendingUp size={12} color={Colors.primary} />
                    <Text style={styles.deltaText}>{item.delta}</Text>
                  </View>
                )}
                {item.statusText && (
                  <Text style={styles.statStatusText}>{item.statusText}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* 2. Omnichannel Suite Quick Access Grid (All 17 Stitch Modules) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Omnichannel Suite</Text>
          <Text style={styles.sectionBadge}>17 Modules Ready</Text>
        </View>

        <View style={styles.suiteGrid}>
          {suiteModules.map((mod) => {
            const IconComponent = mod.icon;
            return (
              <TouchableOpacity
                key={mod.id}
                style={styles.moduleCard}
                activeOpacity={0.75}
                onPress={() => onNavigateScreen(mod.id)}
              >
                <View style={styles.moduleTop}>
                  <View
                    style={[
                      styles.moduleIconBox,
                      { backgroundColor: `${mod.color}15`, borderColor: `${mod.color}35` },
                    ]}
                  >
                    <IconComponent size={18} color={mod.color} />
                  </View>
                  <View style={styles.moduleBadge}>
                    <Text style={[styles.moduleBadgeText, { color: mod.color }]}>
                      {mod.badge}
                    </Text>
                  </View>
                </View>

                <View style={styles.moduleInfo}>
                  <Text style={styles.moduleName} numberOfLines={1}>
                    {mod.name}
                  </Text>
                  <Text style={styles.moduleDesc} numberOfLines={1}>
                    {mod.desc}
                  </Text>
                </View>

                <ChevronRight size={14} color={Colors.outline} style={styles.moduleArrow} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. Connected Channels Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Connected Channels</Text>
          <Text style={styles.sectionBadge}>{channels.length} Active</Text>
        </View>

        <View style={styles.channelGrid}>
          {channels.map((ch) => (
            <TouchableOpacity
              key={ch.id}
              style={styles.channelCard}
              activeOpacity={0.8}
              onPress={() => {
                if (ch.type === 'whatsapp') onNavigateScreen('broadcasts');
                else if (ch.type === 'google') onNavigateScreen('reviews');
                else onNavigateScreen('inbox');
              }}
            >
              <View style={styles.channelHeader}>
                <View style={styles.channelMeta}>
                  <View
                    style={[
                      styles.channelIconBox,
                      ch.type === 'whatsapp'
                        ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }
                        : ch.type === 'instagram'
                        ? { backgroundColor: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.3)' }
                        : { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' },
                    ]}
                  >
                    {ch.type === 'whatsapp' ? (
                      <Phone size={18} color={Colors.whatsapp} />
                    ) : ch.type === 'instagram' ? (
                      <MessageCircle size={18} color={Colors.instagramPink} />
                    ) : (
                      <Store size={18} color={Colors.googleAmber} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.channelTitleRow}>
                      <Text style={styles.channelName}>{ch.name}</Text>
                      {ch.subBadge && (
                        <View style={styles.channelSubBadge}>
                          <Text style={styles.channelSubBadgeText}>
                            {ch.subBadge}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.channelIdentifier}>{ch.identifier}</Text>
                  </View>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.statusPill,
                    ch.status === 'WORKING'
                      ? styles.statusPillWorking
                      : styles.statusPillConnected,
                  ]}
                >
                  {ch.status === 'WORKING' && (
                    <View style={styles.statusPillDot} />
                  )}
                  <Text
                    style={[
                      styles.statusPillText,
                      ch.status === 'WORKING' && { color: Colors.primary },
                    ]}
                  >
                    {ch.status}
                  </Text>
                </View>
              </View>

              {/* Card Footer Details */}
              {(ch.secondaryInfo || ch.activeFollowersOrReviews) && (
                <View style={styles.channelFooter}>
                  {ch.secondaryInfo && (
                    <Text style={styles.channelFooterText} numberOfLines={1}>
                      {ch.secondaryInfo}
                    </Text>
                  )}
                  {ch.activeFollowersOrReviews && (
                    <Text style={styles.channelFooterHighlight}>
                      {ch.activeFollowersOrReviews}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Connect New Channel Dashed Card */}
          <TouchableOpacity
            style={styles.dashedCard}
            activeOpacity={0.7}
            onPress={onOpenConnectModal}
          >
            <Plus size={20} color={Colors.primary} />
            <Text style={styles.dashedCardText}>Connect New Channel (+)</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Multi-Channel Activity Feed */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => onNavigateScreen('inbox')}>
            <Text style={styles.viewAllLink}>View in Inbox</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityContainer}>
          {activities.map((act, index) => (
            <TouchableOpacity
              key={act.id}
              style={[
                styles.activityRow,
                index === activities.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => onNavigateScreen('inbox')}
            >
              <View style={styles.activityAvatar}>
                <Text style={styles.activityAvatarText}>{act.avatarText}</Text>
              </View>
              <View style={styles.activityBody}>
                <View style={styles.activityTop}>
                  <Text style={styles.activitySender}>{act.senderName}</Text>
                  <Text style={styles.activityTime}>{act.timestamp}</Text>
                </View>
                <Text style={styles.activityMessage}>{act.message}</Text>
                <View style={styles.activityChannelTag}>
                  <View
                    style={[
                      styles.channelDot,
                      {
                        backgroundColor:
                          act.channelType === 'whatsapp'
                            ? Colors.whatsapp
                            : act.channelType === 'instagram'
                            ? Colors.instagramPink
                            : Colors.googleAmber,
                      },
                    ]}
                  />
                  <Text style={styles.activityChannelTagText}>{act.channel}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button (+) */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={onOpenConnectModal}
      >
        <Plus size={26} color={Colors.onPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.onSurface,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.onSurfaceVariant,
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
  },
  statsCarousel: {
    gap: Spacing.md,
    paddingVertical: 2,
  },
  statCard: {
    width: 184,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.onSurfaceVariant,
    lineHeight: 16,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  statStatusText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  suiteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'space-between',
  },
  moduleCard: {
    width: '48.5%',
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    position: 'relative',
  },
  moduleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moduleIconBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  moduleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  moduleInfo: {
    gap: 2,
  },
  moduleName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  moduleDesc: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  moduleArrow: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  channelGrid: {
    gap: Spacing.md,
  },
  channelCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  channelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  channelIconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  channelName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  channelSubBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  channelSubBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  channelIdentifier: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusPillWorking: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  statusPillConnected: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderColor: Colors.outlineVariant,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  channelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.sm,
  },
  channelFooterText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    flex: 1,
  },
  channelFooterHighlight: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  dashedCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    backgroundColor: 'rgba(24, 24, 27, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dashedCardText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.onSurfaceVariant,
  },
  activityContainer: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  activityBody: {
    flex: 1,
    gap: 4,
  },
  activityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activitySender: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  activityTime: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  activityMessage: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
  },
  activityChannelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  channelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activityChannelTagText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
  },
  viewAllLink: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
});

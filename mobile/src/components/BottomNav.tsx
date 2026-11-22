import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LayoutGrid, MessageSquare, Kanban, Zap, Settings2 } from 'lucide-react-native';
import { Colors, Spacing } from '../theme/colors';

export type TabName = 'hub' | 'inbox' | 'crm' | 'automations' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  inboxUnread?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  inboxUnread = 3,
}) => {
  const tabs = [
    { id: 'hub' as TabName, label: 'Hub', icon: LayoutGrid },
    { id: 'inbox' as TabName, label: 'Inbox', icon: MessageSquare, badge: inboxUnread },
    { id: 'crm' as TabName, label: 'CRM', icon: Kanban },
    { id: 'automations' as TabName, label: 'Flows', icon: Zap },
    { id: 'settings' as TabName, label: 'Settings', icon: Settings2 },
  ];

  return (
    <View style={styles.dock}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const IconComponent = tab.icon;

        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.id)}
          >
            <View style={styles.iconWrapper}>
              <IconComponent
                size={22}
                color={isActive ? Colors.primary : Colors.onSurfaceVariant}
              />
              {tab.badge && tab.badge > 0 ? (
                <View style={styles.badgeDot}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.tabLabel,
                isActive ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  dock: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingBottom: 16,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
    flex: 1,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
  },
  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  tabLabelInactive: {
    color: Colors.onSurfaceVariant,
  },
});

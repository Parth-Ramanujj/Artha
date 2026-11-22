import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Platform } from 'react-native';
import { ChevronDown, Bell, Check, X } from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { Workspace } from '../types';

interface HeaderProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSelectWorkspace: (workspace: Workspace) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onOpenNotifications,
  unreadCount = 3,
}) => {
  const [menuVisible, setMenuVisible] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        {/* Workspace Selector Pill */}
        <TouchableOpacity
          style={styles.workspacePill}
          activeOpacity={0.8}
          onPress={() => setMenuVisible(true)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(activeWorkspace.name)}</Text>
          </View>
          <Text style={styles.workspaceName} numberOfLines={1}>
            {activeWorkspace.name}
          </Text>
          <ChevronDown size={16} color={Colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Live Status Indicator */}
        <View style={styles.liveBadge}>
          <View style={styles.liveDotOuter}>
            <View style={styles.liveDotInner} />
          </View>
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      {/* Notification Bell */}
      <TouchableOpacity
        style={styles.bellButton}
        activeOpacity={0.7}
        onPress={onOpenNotifications}
      >
        <Bell size={20} color={Colors.onSurface} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Workspace Dropdown Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.dropdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Select Workspace</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={workspaces}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = item.id === activeWorkspace.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.workspaceOption,
                      isSelected && styles.workspaceOptionSelected,
                    ]}
                    onPress={() => {
                      onSelectWorkspace(item);
                      setMenuVisible(false);
                    }}
                  >
                    <View style={styles.optionLeft}>
                      <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                        <Text
                          style={[
                            styles.avatarText,
                            isSelected && { color: Colors.primary },
                          ]}
                        >
                          {getInitials(item.name)}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.optionName}>{item.name}</Text>
                        <Text style={styles.optionSlug}>{item.slug}</Text>
                      </View>
                    </View>
                    {isSelected && <Check size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 12 : Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  workspacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    maxWidth: 220,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  workspaceName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
    flexShrink: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  liveDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 90 : 70,
    paddingHorizontal: Spacing.lg,
  },
  dropdownCard: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.md,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    marginBottom: Spacing.sm,
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workspaceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  workspaceOptionSelected: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  optionName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.onSurface,
  },
  optionSlug: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Search,
  Send,
  ArrowLeft,
  Phone,
  MessageCircle,
  Store,
  Check,
  CheckCheck,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { InboxConversation, ChatMessage, ChannelType } from '../types';

interface InboxScreenProps {
  conversations: InboxConversation[];
  onSendMessage: (conversationId: string, text: string) => void;
}

export const InboxScreen: React.FC<InboxScreenProps> = ({
  conversations,
  onSendMessage,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | ChannelType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChat, setActiveChat] = useState<InboxConversation | null>(null);
  const [inputText, setInputText] = useState('');

  const filteredConversations = conversations.filter((item) => {
    const matchesFilter =
      selectedFilter === 'all' || item.channel === selectedFilter;
    const matchesSearch =
      item.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getChannelColor = (channel: ChannelType) => {
    switch (channel) {
      case 'whatsapp':
        return Colors.whatsapp;
      case 'instagram':
        return Colors.instagramPink;
      case 'facebook':
        return Colors.facebook;
      case 'google':
        return Colors.googleAmber;
      default:
        return Colors.primary;
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || !activeChat) return;
    onSendMessage(activeChat.id, inputText.trim());

    // Local optimistic update
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: inputText.trim(),
      timestamp: 'Just now',
      status: 'sent',
      channel: activeChat.channel,
    };
    setActiveChat({
      ...activeChat,
      messages: [...activeChat.messages, newMsg],
      lastMessage: inputText.trim(),
    });
    setInputText('');
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={16} color={Colors.onSurfaceVariant} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.outline}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filter Chips Horizontal Scroll */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          nestedScrollEnabled={true}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === 'all' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('all')}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'all' && styles.filterChipTextActive,
              ]}
            >
              All ({conversations.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === 'whatsapp' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('whatsapp')}
          >
            <View style={[styles.filterDot, { backgroundColor: Colors.whatsapp }]} />
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'whatsapp' && styles.filterChipTextActive,
              ]}
            >
              WhatsApp
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === 'instagram' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('instagram')}
          >
            <View
              style={[styles.filterDot, { backgroundColor: Colors.instagramPink }]}
            />
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'instagram' && styles.filterChipTextActive,
              ]}
            >
              Instagram
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === 'telegram' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('telegram')}
          >
            <View
              style={[styles.filterDot, { backgroundColor: Colors.telegram }]}
            />
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'telegram' && styles.filterChipTextActive,
              ]}
            >
              Telegram
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedFilter === 'google' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter('google')}
          >
            <View
              style={[styles.filterDot, { backgroundColor: Colors.googleAmber }]}
            />
            <Text
              style={[
                styles.filterChipText,
                selectedFilter === 'google' && styles.filterChipTextActive,
              ]}
            >
              Google
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Conversation List */}
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const channelColor = getChannelColor(item.channel);
          return (
            <TouchableOpacity
              style={styles.convCard}
              activeOpacity={0.7}
              onPress={() => setActiveChat(item)}
            >
              <View style={styles.avatarBox}>
                <Text style={styles.avatarText}>{item.initials}</Text>
                <View
                  style={[styles.channelBadgeDot, { backgroundColor: channelColor }]}
                />
              </View>

              <View style={styles.convDetails}>
                <View style={styles.convTop}>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {item.contactName}
                  </Text>
                  <Text style={styles.convTime}>{item.timestamp}</Text>
                </View>
                <View style={styles.convBottom}>
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadPill}>
                      <Text style={styles.unreadText}>{item.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Full-Screen Chat View Modal */}
      <Modal
        visible={activeChat !== null}
        animationType="slide"
        onRequestClose={() => setActiveChat(null)}
      >
        <KeyboardAvoidingView
          style={styles.chatModalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Chat Header */}
          <View style={styles.chatHeader}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setActiveChat(null)}
            >
              <ArrowLeft size={20} color={Colors.onSurface} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatTitle}>{activeChat?.contactName}</Text>
              <Text style={styles.chatSubtitle}>
                {activeChat?.contactPhone} · {activeChat?.channel.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Messages Flow */}
          <FlatList
            data={activeChat?.messages || []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.chatMessagesList}
            renderItem={({ item }) => {
              const isMe = item.sender === 'user';
              return (
                <View
                  style={[
                    styles.messageBubbleContainer,
                    isMe ? styles.bubbleMe : styles.bubbleThem,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMe ? styles.bubbleBgMe : styles.bubbleBgThem,
                    ]}
                  >
                    <Text style={styles.bubbleText}>{item.text}</Text>
                    <View style={styles.bubbleFooter}>
                      <Text style={styles.bubbleTime}>{item.timestamp}</Text>
                      {isMe && (
                        <CheckCheck size={13} color={Colors.onPrimaryContainer} />
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />

          {/* Message Input Dock */}
          <View style={styles.inputDock}>
            <TextInput
              style={styles.chatTextInput}
              placeholder="Type message via Cloud API..."
              placeholderTextColor={Colors.outline}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                !inputText.trim() && { opacity: 0.5 },
              ]}
              disabled={!inputText.trim()}
              onPress={handleSend}
            >
              <Send size={18} color={Colors.onPrimary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  searchRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: Colors.onSurface,
    fontSize: 13,
  },
  filterWrapper: {
    paddingVertical: Spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
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
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: Colors.onPrimary,
    fontWeight: '700',
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
    gap: Spacing.sm,
  },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  channelBadgeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  convDetails: {
    flex: 1,
    gap: 4,
  },
  convTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
    flex: 1,
  },
  convTime: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  convBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    flex: 1,
    marginRight: 8,
  },
  unreadPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  chatModalContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  backBtn: {
    padding: 6,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  chatSubtitle: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  chatMessagesList: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    width: '100%',
  },
  bubbleMe: {
    justifyContent: 'flex-end',
  },
  bubbleThem: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 4,
  },
  bubbleBgMe: {
    backgroundColor: Colors.primaryContainer,
    borderBottomRightRadius: 2,
  },
  bubbleBgThem: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    fontSize: 13,
    color: Colors.onSurface,
    lineHeight: 18,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bubbleTime: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    color: Colors.onSurface,
    fontSize: 13,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

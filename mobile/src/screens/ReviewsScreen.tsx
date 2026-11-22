import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
} from 'react-native';
import {
  ArrowLeft,
  Star,
  Sparkles,
  Send,
  CheckCircle2,
  Store,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { GoogleReview } from '../types';

interface ReviewsScreenProps {
  reviews: GoogleReview[];
  onBack: () => void;
  onPostReply: (reviewId: string, reply: string) => void;
}

export const ReviewsScreen: React.FC<ReviewsScreenProps> = ({
  reviews,
  onBack,
  onPostReply,
}) => {
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [activeReplyInput, setActiveReplyInput] = useState<{ [id: string]: string }>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleGenerateReply = (rev: GoogleReview) => {
    const draft = rev.draftReply || `Thank you so much ${rev.author} for your kind feedback! Our team at ${rev.branch} looks forward to seeing you again. ✨`;
    setActiveReplyInput((prev) => ({ ...prev, [rev.id]: draft }));
  };

  const handleSendReply = (reviewId: string) => {
    const reply = activeReplyInput[reviewId];
    if (!reply) return;

    onPostReply(reviewId, reply);
    setActiveReplyInput((prev) => {
      const copy = { ...prev };
      delete copy[reviewId];
      return copy;
    });

    setToastMsg('Reply posted via Google Business Profile API!');
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
            <Text style={styles.title}>Google Business Reviews</Text>
            <Text style={styles.subtitle}>Ahmedabad Main Branch · 4.8 ★</Text>
          </View>
          <View style={styles.ratingBadge}>
            <Star size={14} color={Colors.googleAmber} fill={Colors.googleAmber} />
            <Text style={styles.ratingText}>4.8 ★</Text>
          </View>
        </View>

        {/* Auto Reply Setting */}
        <View style={styles.autoReplyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.autoReplyTitle}>Astra AI Auto-Reply Reviews</Text>
            <Text style={styles.autoReplySubtitle}>
              Sentiment-aware instant replies to 4★ & 5★ reviews
            </Text>
          </View>
          <Switch
            trackColor={{ false: Colors.outlineVariant, true: Colors.primary }}
            thumbColor={Colors.onSurface}
            value={autoReplyEnabled}
            onValueChange={setAutoReplyEnabled}
          />
        </View>
      </View>

      {/* Toast */}
      {toastMsg && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.primary} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Reviews List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {reviews.map((rev) => {
          const currentDraft = activeReplyInput[rev.id];
          return (
            <View key={rev.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorName}>{rev.author}</Text>
                  <Text style={styles.branchName}>{rev.branch}</Text>
                </View>

                {/* Star rating */}
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={13}
                      color={star <= rev.rating ? Colors.googleAmber : Colors.outline}
                      fill={star <= rev.rating ? Colors.googleAmber : 'transparent'}
                    />
                  ))}
                </View>
              </View>

              <Text style={styles.commentText}>"{rev.comment}"</Text>

              <View style={styles.reviewFooter}>
                <Text style={styles.timeText}>{rev.timestamp}</Text>

                {rev.replyStatus === 'replied' ? (
                  <View style={styles.repliedBadge}>
                    <CheckCircle2 size={12} color={Colors.primary} />
                    <Text style={styles.repliedBadgeText}>Replied Live</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.aiDraftBtn}
                    onPress={() => handleGenerateReply(rev)}
                  >
                    <Sparkles size={12} color={Colors.neuralIndigo} />
                    <Text style={styles.aiDraftBtnText}>Draft AI Reply</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Reply Box if generated */}
              {currentDraft !== undefined && (
                <View style={styles.replyBox}>
                  <Text style={styles.replyBoxTitle}>Astra AI Suggested Reply:</Text>
                  <TextInput
                    style={styles.replyInput}
                    value={currentDraft}
                    onChangeText={(txt) =>
                      setActiveReplyInput((prev) => ({ ...prev, [rev.id]: txt }))
                    }
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.sendReplyBtn}
                    onPress={() => handleSendReply(rev.id)}
                  >
                    <Send size={13} color={Colors.onPrimary} />
                    <Text style={styles.sendReplyBtnText}>Publish to Google Review</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

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
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.googleAmber,
  },
  autoReplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
  },
  autoReplyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  autoReplySubtitle: {
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
  reviewCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  branchName: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  commentText: {
    fontSize: 13,
    color: Colors.onSurface,
    lineHeight: 18,
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.xs,
  },
  timeText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
  },
  repliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  repliedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  aiDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  aiDraftBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.neuralIndigo,
  },
  replyBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  replyBoxTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.neuralIndigo,
  },
  replyInput: {
    color: Colors.onSurface,
    fontSize: 12,
    lineHeight: 16,
    minHeight: 50,
  },
  sendReplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  sendReplyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});

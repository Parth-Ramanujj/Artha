import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Upload,
  Layers,
  Send,
  FileText,
  Video,
  CheckCircle2,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { MediaAsset } from '../types';

interface MediaLibraryScreenProps {
  assets: MediaAsset[];
  onBack: () => void;
  onPostStatus: () => void;
}

export const MediaLibraryScreen: React.FC<MediaLibraryScreenProps> = ({
  assets,
  onBack,
  onPostStatus,
}) => {
  const [filter, setFilter] = useState<'all' | 'status' | 'image' | 'pdf' | 'video'>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handlePublishStory = () => {
    onPostStatus();
    setToastMsg('Story broadcasted to all linked official WhatsApp numbers!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const filteredAssets = assets.filter((a) => {
    if (filter === 'all') return true;
    return a.type === filter;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={Colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Content & Media Library</Text>
            <Text style={styles.subtitle}>WhatsApp Status Stories & Cloud Assets</Text>
          </View>
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={() => {
              setToastMsg('Asset uploaded to Cloud Storage!');
              setTimeout(() => setToastMsg(null), 2500);
            }}
          >
            <Upload size={13} color={Colors.onSurface} />
            <Text style={styles.uploadBtnText}>+ Upload</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', 'status', 'image', 'pdf', 'video'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                filter === f && styles.filterChipActive,
              ]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === f && styles.filterChipTextActive,
                ]}
              >
                {f === 'all' ? 'All Assets' : f === 'status' ? 'Status Stories' : f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
        {/* 1. Quick Broadcast to WhatsApp Status */}
        <View style={styles.statusPublisherCard}>
          <View style={styles.statusPublisherLeft}>
            <View style={styles.storyRing}>
              <Layers size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.storyTitleRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.storyTitle}>Post to WhatsApp Status</Text>
              </View>
              <Text style={styles.storySubtitle}>
                Broadcast 24h story to all linked official numbers
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.postStoryBtn}
            onPress={handlePublishStory}
          >
            <Send size={13} color={Colors.onPrimary} />
            <Text style={styles.postStoryBtnText}>Post Story</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Media Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Library Items</Text>
          <Text style={styles.sectionCount}>{filteredAssets.length} Assets</Text>
        </View>

        <View style={styles.assetsGrid}>
          {filteredAssets.map((asset) => (
            <View key={asset.id} style={styles.assetCard}>
              <View style={styles.previewBox}>
                {asset.previewUrl ? (
                  <Image source={{ uri: asset.previewUrl }} style={styles.previewImg} />
                ) : (
                  <View style={styles.filePlaceholder}>
                    {asset.type === 'pdf' ? (
                      <FileText size={24} color={Colors.error} />
                    ) : (
                      <Video size={24} color={Colors.googleAmber} />
                    )}
                  </View>
                )}
              </View>

              <View style={styles.assetMeta}>
                <Text style={styles.assetTitle} numberOfLines={1}>
                  {asset.title}
                </Text>
                <View style={styles.assetBottom}>
                  <Text style={styles.assetSize}>{asset.fileSize}</Text>
                  <Text style={styles.assetDate}>{asset.uploadedAt}</Text>
                </View>
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
    paddingBottom: Spacing.sm,
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
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  uploadBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
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
    color: Colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: Colors.onPrimary,
    fontWeight: '700',
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
  statusPublisherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statusPublisherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  storyRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  storyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  storySubtitle: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  postStoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  postStoryBtnText: {
    fontSize: 11,
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
  assetsGrid: {
    gap: Spacing.md,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  previewBox: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  filePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetMeta: {
    flex: 1,
    gap: 4,
  },
  assetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  assetBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  assetSize: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },
  assetDate: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
  },
});

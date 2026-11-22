import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Send,
  ShoppingBag,
  Share2,
  X,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { CatalogProduct } from '../types';

interface CatalogScreenProps {
  products: CatalogProduct[];
  onBack: () => void;
  onShareToChat: (product: CatalogProduct) => void;
  onAddProduct: (product: CatalogProduct) => void;
}

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  products,
  onBack,
  onShareToChat,
  onAddProduct,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newStock, setNewStock] = useState('10');
  const [shareToast, setShareToast] = useState<string | null>(null);

  const handleShare = (prod: CatalogProduct) => {
    onShareToChat(prod);
    setShareToast(`Shared "${prod.title}" to WhatsApp conversation!`);
    setTimeout(() => setShareToast(null), 2500);
  };

  const handleCreateProduct = () => {
    if (!newTitle.trim() || !newPrice.trim() || !newSku.trim()) return;

    const product: CatalogProduct = {
      id: `prod-${Date.now()}`,
      title: newTitle.trim(),
      price: newPrice.startsWith('₹') ? newPrice.trim() : `₹${newPrice.trim()}`,
      sku: newSku.trim().toUpperCase(),
      stockUnits: parseInt(newStock, 10) || 1,
      category: 'General',
      imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=400&q=80',
      inStock: true,
    };

    onAddProduct(product);
    setModalVisible(false);
    setNewTitle('');
    setNewPrice('');
    setNewSku('');
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
            <Text style={styles.title}>WhatsApp Product Catalog</Text>
            <Text style={styles.subtitle}>Meta Commerce Manager Integration</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Plus size={14} color={Colors.onPrimary} />
            <Text style={styles.addBtnText}>+ Add Product</Text>
          </TouchableOpacity>
        </View>

        {/* Sync Status Banner */}
        <View style={styles.syncBanner}>
          <CheckCircle2 size={15} color={Colors.primary} />
          <Text style={styles.syncText}>
            Synced with Meta Commerce Manager · {products.length} Products Live
          </Text>
        </View>
      </View>

      {/* Toast Notification */}
      {shareToast && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.primary} />
          <Text style={styles.toastText}>{shareToast}</Text>
        </View>
      )}

      {/* Product Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridHeader}>
          <Text style={styles.gridTitle}>Inventory</Text>
          <Text style={styles.gridCount}>{products.length} Items</Text>
        </View>

        <View style={styles.productGrid}>
          {products.map((prod) => (
            <View key={prod.id} style={styles.productCard}>
              <View style={styles.imageBox}>
                <Image
                  source={{ uri: prod.imageUrl }}
                  style={styles.image}
                  resizeMode="cover"
                />
              </View>

              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {prod.title}
                </Text>

                <View style={styles.priceRow}>
                  <Text style={styles.price}>{prod.price}</Text>
                  {prod.originalPrice && (
                    <Text style={styles.originalPrice}>{prod.originalPrice}</Text>
                  )}
                </View>

                <View style={styles.skuRow}>
                  <Text style={styles.skuText}>SKU: {prod.sku}</Text>
                  <Text style={styles.stockText}>In Stock ({prod.stockUnits})</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.shareBtn}
                activeOpacity={0.8}
                onPress={() => handleShare(prod)}
              >
                <Send size={13} color={Colors.primary} />
                <Text style={styles.shareBtnText} numberOfLines={1}>
                  Share to WhatsApp
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Add Product Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Product to Meta Catalog</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Product Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Pure Silk Wedding Kurta"
                placeholderTextColor={Colors.outline}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Price in INR (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., ₹2,499"
                placeholderTextColor={Colors.outline}
                value={newPrice}
                onChangeText={setNewPrice}
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>SKU Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., KUR-992"
                placeholderTextColor={Colors.outline}
                value={newSku}
                onChangeText={setNewSku}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>Available Stock Units</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 20"
                placeholderTextColor={Colors.outline}
                keyboardType="numeric"
                value={newStock}
                onChangeText={setNewStock}
              />
            </View>

            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreateProduct}
            >
              <Text style={styles.createBtnText}>Publish to WhatsApp Catalog</Text>
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
    gap: Spacing.sm,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  syncText: {
    fontSize: 11,
    fontWeight: '600',
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
    gap: Spacing.md,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  gridCount: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'space-between',
  },
  productCard: {
    width: '47.5%',
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  imageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    gap: 3,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  originalPrice: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    textDecorationLine: 'line-through',
  },
  skuRow: {
    gap: 1,
  },
  skuText: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
  },
  stockText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    marginTop: 2,
  },
  shareBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
  input: {
    height: 40,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.onSurface,
    fontSize: 13,
  },
  createBtn: {
    height: 42,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});

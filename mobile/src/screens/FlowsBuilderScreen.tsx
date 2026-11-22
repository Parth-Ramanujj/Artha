import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Smartphone,
  Rocket,
  ArrowRight,
  Plus,
  CheckCircle2,
  Sliders,
  Check,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { WhatsAppFlow } from '../types';

interface FlowsBuilderScreenProps {
  flows: WhatsAppFlow[];
  onBack: () => void;
}

export const FlowsBuilderScreen: React.FC<FlowsBuilderScreenProps> = ({
  flows,
  onBack,
}) => {
  const [activeStep, setActiveStep] = useState(1);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const currentFlow = flows[0];

  const handleTestWhatsApp = () => {
    setToastMsg('Interactive WhatsApp Flow sent to your registered phone!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handlePublishMeta = () => {
    setToastMsg('Flow published to Meta Graph API v21.0 successfully!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={Colors.onSurface} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {currentFlow?.title || 'Interactive WhatsApp Flows'}
            </Text>
            <Text style={styles.subtitle}>
              Meta Flow ID: {currentFlow?.metaFlowId} · Status: PUBLISHED
            </Text>
          </View>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.testBtn}
            activeOpacity={0.8}
            onPress={handleTestWhatsApp}
          >
            <Smartphone size={14} color={Colors.primary} />
            <Text style={styles.testBtnText}>Test on My WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.publishBtn}
            activeOpacity={0.8}
            onPress={handlePublishMeta}
          >
            <Rocket size={14} color={Colors.onPrimary} />
            <Text style={styles.publishBtnText}>Publish to Meta</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast Alert */}
      {toastMsg && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.primary} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Step Pipeline Tabs */}
      <View style={styles.pipelineBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepsRow}
          nestedScrollEnabled={true}
          directionalLockEnabled={true}
        >
          {currentFlow?.steps.map((st, i) => {
            const isActive = activeStep === st.stepNumber;
            return (
              <React.Fragment key={st.stepNumber}>
                <TouchableOpacity
                  style={[
                    styles.stepPill,
                    isActive && styles.stepPillActive,
                  ]}
                  onPress={() => setActiveStep(st.stepNumber)}
                >
                  <Text
                    style={[
                      styles.stepPillText,
                      isActive && styles.stepPillTextActive,
                    ]}
                  >
                    Step {st.stepNumber}: {st.title}
                  </Text>
                </TouchableOpacity>
                {i < currentFlow.steps.length - 1 && (
                  <ArrowRight size={14} color={Colors.outline} />
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Flow Form Builder Preview */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Sliders size={16} color={Colors.primary} />
            <Text style={styles.previewTitle}>
              Screen {activeStep} Layout Preview
            </Text>
          </View>

          <Text style={styles.previewDesc}>
            In-chat native WhatsApp form container rendered directly inside WhatsApp without external browser redirect.
          </Text>

          {/* Form Fields according to step */}
          <View style={styles.fieldsContainer}>
            {activeStep === 1 && (
              <>
                <View style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>Select Retail Service</Text>
                  <View style={styles.choiceOption}>
                    <Text style={styles.choiceText}>Custom Bridal Fitting</Text>
                    <Check size={16} color={Colors.primary} />
                  </View>
                  <View style={styles.choiceOption}>
                    <Text style={styles.choiceText}>Festive Kurta Alteration</Text>
                  </View>
                  <View style={styles.choiceOption}>
                    <Text style={styles.choiceText}>Personal Styling Consultation</Text>
                  </View>
                </View>
              </>
            )}

            {activeStep === 2 && (
              <>
                <View style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>Preferred Date</Text>
                  <TextInput
                    style={styles.previewInput}
                    value="25 Nov 2026 (Tomorrow)"
                    editable={false}
                  />
                </View>
                <View style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>Time Window</Text>
                  <View style={styles.choiceOption}>
                    <Text style={styles.choiceText}>Morning Slot (10:30 AM - 1:00 PM)</Text>
                    <Check size={16} color={Colors.primary} />
                  </View>
                  <View style={styles.choiceOption}>
                    <Text style={styles.choiceText}>Evening Slot (4:00 PM - 7:30 PM)</Text>
                  </View>
                </View>
              </>
            )}

            {activeStep === 3 && (
              <>
                <View style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>Customer Name</Text>
                  <TextInput
                    style={styles.previewInput}
                    value="Priya Patel"
                    editable={false}
                  />
                </View>
                <View style={styles.fieldBox}>
                  <Text style={styles.fieldLabel}>WhatsApp Number</Text>
                  <TextInput
                    style={styles.previewInput}
                    value="+91 98251 09876"
                    editable={false}
                  />
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.simulateBtn}
            onPress={handleTestWhatsApp}
          >
            <Text style={styles.simulateBtnText}>
              {activeStep < 3 ? 'Continue to Next Step' : 'Submit In-Chat Booking'}
            </Text>
          </TouchableOpacity>
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
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  testBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  publishBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onPrimary,
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
  pipelineBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLow,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  stepPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  stepPillText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  stepPillTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  previewCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  previewDesc: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    lineHeight: 16,
  },
  fieldsContainer: {
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  fieldBox: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  choiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  choiceText: {
    fontSize: 12,
    color: Colors.onSurface,
  },
  previewInput: {
    height: 40,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.md,
    color: Colors.onSurface,
    fontSize: 12,
  },
  simulateBtn: {
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
});

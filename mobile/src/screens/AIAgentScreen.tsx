import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  Bot,
  Sparkles,
  Database,
  Save,
  CheckCircle2,
  Sliders,
  Play,
  RotateCcw,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';

interface AIAgentScreenProps {
  onBack: () => void;
}

export const AIAgentScreen: React.FC<AIAgentScreenProps> = ({ onBack }) => {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState('Gemini 1.5 Pro');
  const [temperature, setTemperature] = useState('0.4 (Creative & Accurate)');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are Artha AI, the retail assistant for Sunrise Retailers. Answer customer inquiries about pricing, wedding collections, and order dispatch status warmly.'
  );
  const [groundingCatalog, setGroundingCatalog] = useState(true);
  const [testInput, setTestInput] = useState('');
  const [testReply, setTestReply] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleSave = () => {
    setToastMsg('Astra Neural AI configuration saved to Gateway!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleTestSandbox = () => {
    if (!testInput.trim()) return;
    setTestReply(
      `Hello! Thank you for inquiring about "${testInput.trim()}". At Sunrise Retailers, our festive wedding collection starts from ₹1,499 with same-day dispatch available! Can I share our catalog with you?`
    );
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
            <Text style={styles.title}>Astra Neural AI Agent</Text>
            <Text style={styles.subtitle}>Gemini 1.5 Pro · Meta Omnichannel Grounding</Text>
          </View>
          <Switch
            trackColor={{ false: Colors.outlineVariant, true: Colors.neuralIndigo }}
            thumbColor={Colors.onSurface}
            value={enabled}
            onValueChange={setEnabled}
          />
        </View>
      </View>

      {/* Toast */}
      {toastMsg && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color={Colors.neuralIndigo} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Model Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Sparkles size={16} color={Colors.neuralIndigo} />
            <Text style={styles.cardTitle}>Foundation Model & Tuning</Text>
          </View>

          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>Selected LLM Engine</Text>
            <View style={styles.optionBox}>
              <Text style={styles.optionText}>{model}</Text>
            </View>
          </View>

          <View style={styles.fieldItem}>
            <Text style={styles.fieldLabel}>Response Temperature</Text>
            <View style={styles.optionBox}>
              <Text style={styles.optionText}>{temperature}</Text>
            </View>
          </View>

          <View style={styles.groundingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groundingTitle}>Catalog Vector Grounding</Text>
              <Text style={styles.groundingSub}>
                Grounds responses using 48 live Meta WhatsApp catalog products
              </Text>
            </View>
            <Switch
              trackColor={{ false: Colors.outlineVariant, true: Colors.primary }}
              thumbColor={Colors.onSurface}
              value={groundingCatalog}
              onValueChange={setGroundingCatalog}
            />
          </View>
        </View>

        {/* Persona Prompt Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Bot size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>System Persona & Knowledge Base</Text>
          </View>

          <TextInput
            style={styles.promptInput}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            multiline
            numberOfLines={5}
          />

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Save size={14} color={Colors.onPrimary} />
            <Text style={styles.saveBtnText}>Save Persona Prompt</Text>
          </TouchableOpacity>
        </View>

        {/* Live Test Sandbox */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Play size={16} color={Colors.voiceCyan} />
            <Text style={styles.cardTitle}>Astra AI Test Playground</Text>
          </View>

          <TextInput
            style={styles.testInput}
            placeholder="Type customer question (e.g. Do you have silk kurtas?)"
            placeholderTextColor={Colors.outline}
            value={testInput}
            onChangeText={setTestInput}
          />

          <TouchableOpacity
            style={styles.simulateBtn}
            onPress={handleTestSandbox}
          >
            <Text style={styles.simulateBtnText}>Simulate AI Response</Text>
          </TouchableOpacity>

          {testReply && (
            <View style={styles.replyBox}>
              <Text style={styles.replyTitle}>Astra AI Response:</Text>
              <Text style={styles.replyText}>{testReply}</Text>
            </View>
          )}
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderRadius: BorderRadius.sm,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.neuralIndigo,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
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
  optionBox: {
    height: 40,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 12,
    color: Colors.onSurface,
    fontWeight: '500',
  },
  groundingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  groundingTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  groundingSub: {
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  promptInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.onSurface,
    fontSize: 13,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.onPrimary,
  },
  testInput: {
    height: 42,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.onSurface,
    fontSize: 12,
  },
  simulateBtn: {
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.voiceCyan,
  },
  replyBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 4,
  },
  replyTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.neuralIndigo,
  },
  replyText: {
    fontSize: 12,
    color: Colors.onSurface,
    lineHeight: 18,
  },
});

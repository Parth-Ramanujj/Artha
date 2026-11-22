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
  Zap,
  Calendar,
  Bot,
  PhoneCall,
  Sparkles,
  CheckCircle2,
  Play,
  Clock,
  ArrowRight,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { WorkflowRule } from '../types';

interface AutomationsScreenProps {
  workflows: WorkflowRule[];
  onToggleWorkflow: (workflowId: string) => void;
}

export const AutomationsScreen: React.FC<AutomationsScreenProps> = ({
  workflows,
  onToggleWorkflow,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'workflows' | 'social' | 'astra' | 'voice'>('workflows');

  // Astra AI State
  const [astraEnabled, setAstraEnabled] = useState(true);
  const [astraPrompt, setAstraPrompt] = useState(
    'You are Artha AI, the retail assistant for Sunrise Retailers. Answer customer inquiries about pricing, wedding collections, and order dispatch status warmly.'
  );

  // Voice Hub State
  const [voiceRecoveryEnabled, setVoiceRecoveryEnabled] = useState(true);

  return (
    <View style={styles.container}>
      {/* Sub Tabs Selector */}
      <View style={styles.subTabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabBar}
          nestedScrollEnabled={true}
        >
          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'workflows' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('workflows')}
          >
            <Zap size={14} color={activeSubTab === 'workflows' ? Colors.primary : Colors.onSurfaceVariant} />
            <Text style={[styles.subTabText, activeSubTab === 'workflows' && styles.subTabTextActive]}>
              Workflows
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'social' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('social')}
          >
            <Calendar size={14} color={activeSubTab === 'social' ? Colors.instagramPink : Colors.onSurfaceVariant} />
            <Text style={[styles.subTabText, activeSubTab === 'social' && { color: Colors.instagramPink, fontWeight: '700' }]}>
              Scheduler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'astra' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('astra')}
          >
            <Bot size={14} color={activeSubTab === 'astra' ? Colors.neuralIndigo : Colors.onSurfaceVariant} />
            <Text style={[styles.subTabText, activeSubTab === 'astra' && { color: Colors.neuralIndigo, fontWeight: '700' }]}>
              Astra AI
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, activeSubTab === 'voice' && styles.subTabBtnActive]}
            onPress={() => setActiveSubTab('voice')}
          >
            <PhoneCall size={14} color={activeSubTab === 'voice' ? Colors.voiceCyan : Colors.onSurfaceVariant} />
            <Text style={[styles.subTabText, activeSubTab === 'voice' && { color: Colors.voiceCyan, fontWeight: '700' }]}>
              Voice Hub
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentBody} showsVerticalScrollIndicator={false}>
        {/* SUB-TAB 1: WORKFLOWS */}
        {activeSubTab === 'workflows' && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Trigger Flows</Text>
              <Text style={styles.sectionSubtitle}>Cloud API & Social rules</Text>
            </View>

            {workflows.map((wf) => (
              <View key={wf.id} style={styles.ruleCard}>
                <View style={styles.ruleTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleTitle}>{wf.name}</Text>
                    <Text style={styles.ruleExecutions}>
                      {wf.executionsCount} executions this month
                    </Text>
                  </View>
                  <Switch
                    trackColor={{ false: Colors.outlineVariant, true: Colors.primary }}
                    thumbColor={Colors.onSurface}
                    value={wf.isActive}
                    onValueChange={() => onToggleWorkflow(wf.id)}
                  />
                </View>

                {/* Node visual */}
                <View style={styles.flowNodeBox}>
                  <View style={styles.nodeItem}>
                    <Text style={styles.nodeLabel}>WHEN</Text>
                    <Text style={styles.nodeValue}>{wf.triggerEvent}</Text>
                  </View>
                  <ArrowRight size={14} color={Colors.primary} style={{ alignSelf: 'center' }} />
                  <View style={styles.nodeItem}>
                    <Text style={styles.nodeLabel}>THEN</Text>
                    <Text style={styles.nodeValue}>{wf.actionTaken}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* SUB-TAB 2: SOCIAL SCHEDULER */}
        {activeSubTab === 'social' && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Social Post Scheduler</Text>
              <Text style={styles.sectionSubtitle}>Instagram & Facebook Reels / Posts</Text>
            </View>

            <View style={styles.ruleCard}>
              <View style={styles.ruleTop}>
                <View>
                  <Text style={styles.ruleTitle}>Winter Silk Collection Reel #3</Text>
                  <Text style={styles.ruleExecutions}>Scheduled for Today at 6:30 PM IST</Text>
                </View>
                <View style={[styles.statusTag, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                  <Text style={{ color: Colors.instagramPink, fontSize: 10, fontWeight: '700' }}>QUEUED</Text>
                </View>
              </View>
              <Text style={styles.postPreviewText}>
                "Step into elegance this winter with our pure silk trousseau collection. Tap link in bio or comment PRICE for instant catalog DM!"
              </Text>
            </View>

            <View style={styles.ruleCard}>
              <View style={styles.ruleTop}>
                <View>
                  <Text style={styles.ruleTitle}>Customer Testimonial Story</Text>
                  <Text style={styles.ruleExecutions}>Published Yesterday · 3,420 Impressions</Text>
                </View>
                <View style={[styles.statusTag, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Text style={{ color: Colors.primary, fontSize: 10, fontWeight: '700' }}>PUBLISHED</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* SUB-TAB 3: ASTRA AI AGENT */}
        {activeSubTab === 'astra' && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Astra Neural AI Agent</Text>
              <Switch
                trackColor={{ false: Colors.outlineVariant, true: Colors.neuralIndigo }}
                thumbColor={Colors.onSurface}
                value={astraEnabled}
                onValueChange={setAstraEnabled}
              />
            </View>

            <View style={styles.ruleCard}>
              <Text style={styles.fieldLabel}>Business Persona & Knowledge Prompt</Text>
              <TextInput
                style={styles.promptInput}
                multiline
                numberOfLines={4}
                value={astraPrompt}
                onChangeText={setAstraPrompt}
              />
              <View style={styles.aiMetricsRow}>
                <View style={styles.aiBadge}>
                  <Sparkles size={12} color={Colors.neuralIndigo} />
                  <Text style={styles.aiBadgeText}>Model: Gemini 1.5 Pro</Text>
                </View>
                <View style={styles.aiBadge}>
                  <CheckCircle2 size={12} color={Colors.primary} />
                  <Text style={styles.aiBadgeText}>Grounding: Store Catalog Active</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* SUB-TAB 4: VOICE HUB */}
        {activeSubTab === 'voice' && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Astra AI Voice Hub</Text>
              <Switch
                trackColor={{ false: Colors.outlineVariant, true: Colors.voiceCyan }}
                thumbColor={Colors.onSurface}
                value={voiceRecoveryEnabled}
                onValueChange={setVoiceRecoveryEnabled}
              />
            </View>

            <View style={styles.ruleCard}>
              <Text style={styles.ruleTitle}>Missed Call WhatsApp Auto-Recovery</Text>
              <Text style={styles.ruleExecutions}>
                When a customer calls the business number and call is unanswered, Astra immediately triggers a WhatsApp template message within 15 seconds.
              </Text>
              <View style={[styles.aiBadge, { marginTop: Spacing.sm, backgroundColor: 'rgba(6, 182, 212, 0.15)' }]}>
                <PhoneCall size={12} color={Colors.voiceCyan} />
                <Text style={{ color: Colors.voiceCyan, fontSize: 11, fontWeight: '600' }}>
                  28 Missed Calls Recovered this week (92% converted to chat)
                </Text>
              </View>
            </View>
          </View>
        )}

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
  subTabBarWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  subTabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  subTabBtn: {
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
  subTabBtnActive: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderColor: Colors.outline,
  },
  subTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.onSurfaceVariant,
  },
  subTabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
  },
  contentBody: {
    padding: Spacing.lg,
  },
  tabSection: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
  ruleCard: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  ruleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  ruleExecutions: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  flowNodeBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  nodeItem: {
    flex: 1,
    gap: 2,
  },
  nodeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.onSurfaceSubtle,
    letterSpacing: 0.5,
  },
  nodeValue: {
    fontSize: 12,
    color: Colors.onSurface,
    fontWeight: '500',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  postPreviewText: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  promptInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.onSurface,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  aiMetricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.neuralIndigo,
  },
});

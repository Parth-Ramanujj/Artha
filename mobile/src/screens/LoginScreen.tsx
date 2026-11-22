import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import {
  ShieldCheck,
  Server,
  Key,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react-native';
import { Colors, Spacing, BorderRadius } from '../theme/colors';
import { api } from '../services/api';

interface LoginScreenProps {
  onLoginSuccess: (role: string) => void;
  onExploreDemo: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onExploreDemo,
}) => {
  const [serverUrl, setServerUrl] = useState(api.getServerUrl() || 'http://10.180.235.44:2785');
  const [apiKey, setApiKey] = useState(api.getApiKey() || '');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!serverUrl.trim()) {
      setErrorMessage('Please enter your Server URL.');
      return;
    }
    if (!apiKey.trim()) {
      setErrorMessage('Please enter your API Key.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await api.validateConnection(serverUrl.trim(), apiKey.trim());
      setLoading(false);

      if (result.valid) {
        setSuccessMessage(`Connected successfully! Authenticated as ${result.role?.toUpperCase() || 'ADMIN'}`);
        setTimeout(() => {
          onLoginSuccess(result.role || 'admin');
        }, 600);
      } else {
        setErrorMessage(result.error || 'Authentication failed. Please verify your Server URL and API Key.');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMessage(err.message || 'Could not connect to server. Check your network connection.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={36} color={Colors.primary} />
          </View>
          <Text style={styles.brandTitle}>OpenWA Artha</Text>
          <Text style={styles.brandSubtitle}>Omnichannel Gateway &amp; SaaS Platform</Text>
          <View style={styles.badgeRow}>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>v1.0 Production</Text>
            </View>
            <View style={[styles.pillBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={[styles.pillText, { color: Colors.primary }]}>Official API</Text>
            </View>
          </View>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Connect to Instance</Text>
          <Text style={styles.cardSubtext}>
            Enter your hosted server origin and API key to access live WhatsApp, Instagram, GBP and CRM.
          </Text>

          {/* Error Alert */}
          {errorMessage ? (
            <View style={styles.errorAlert}>
              <AlertCircle size={18} color={Colors.error} style={{ marginTop: 2 }} />
              <Text style={styles.errorAlertText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Success Alert */}
          {successMessage ? (
            <View style={styles.successAlert}>
              <CheckCircle2 size={18} color={Colors.primary} style={{ marginTop: 2 }} />
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Server URL Input */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Server size={14} color={Colors.onSurfaceVariant} />
              <Text style={styles.label}>Server / Host URL</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="https://your-domain.com or http://10.180.235.44:2785"
              placeholderTextColor={Colors.outline}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.helperText}>
              Your live hosted backend or local gateway URL with port (e.g. :2785).
            </Text>
          </View>

          {/* API Key Input */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Key size={14} color={Colors.onSurfaceVariant} />
              <Text style={styles.label}>API Key</Text>
            </View>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, { flex: 1, paddingRight: 45 }]}
                placeholder="Enter your API Key (e.g. ak_live_...)"
                placeholderTextColor={Colors.outline}
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowKey(!showKey)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showKey ? (
                  <EyeOff size={18} color={Colors.onSurfaceVariant} />
                ) : (
                  <Eye size={18} color={Colors.onSurfaceVariant} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              Find or generate your key in Artha Web Dashboard &gt; API Keys.
            </Text>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={Colors.onPrimary} size="small" />
            ) : (
              <View style={styles.buttonInner}>
                <Text style={styles.submitButtonText}>Connect &amp; Log In</Text>
                <ArrowRight size={18} color={Colors.onPrimary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          {/* Offline Demo Button */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={onExploreDemo}
            activeOpacity={0.7}
          >
            <Sparkles size={16} color={Colors.voiceCyan} />
            <Text style={styles.demoButtonText}>Explore in Demo Mode (Offline)</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Compatible with WhatsApp Cloud API, Instagram, FB &amp; Google Business Profile
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.onSurface,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  pillBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  pillText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    fontWeight: '500',
  },
  card: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  cardSubtext: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 12,
    color: Colors.error,
    fontWeight: '500',
    lineHeight: 18,
  },
  successAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  successAlertText: {
    flex: 1,
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurface,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.onSurface,
    fontSize: 13,
  },
  passwordWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  helperText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  submitButtonText: {
    color: Colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.outlineVariant,
  },
  dividerText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
    paddingHorizontal: Spacing.md,
    fontWeight: '600',
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  demoButtonText: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: 11,
    color: Colors.onSurfaceSubtle,
    textAlign: 'center',
  },
});

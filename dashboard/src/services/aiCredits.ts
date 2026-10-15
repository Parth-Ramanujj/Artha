// =============================================================================
// AI Credits & Wallet Management (20,000 Wati AI Credits Ledger)
// =============================================================================

export interface CreditTransaction {
  id: string;
  timestamp: string;
  type: 'copilot_summary' | 'copilot_reply' | 'copilot_rewrite' | 'voice_stt' | 'voice_tts' | 'agent_reply' | 'top_up';
  description: string;
  amount: number; // positive for top-up, negative for usage
  balanceAfter: number;
}

const STORAGE_KEY_BALANCE = 'openwa_ai_credits_balance';
const STORAGE_KEY_HISTORY = 'openwa_ai_credits_history';
export const DEFAULT_INITIAL_CREDITS = 20000;

export const aiCreditsService = {
  getBalance: (): number => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_BALANCE);
      if (stored !== null) {
        return Math.max(0, parseInt(stored, 10));
      }
    } catch {
      // ignore
    }
    // initialize default
    localStorage.setItem(STORAGE_KEY_BALANCE, String(DEFAULT_INITIAL_CREDITS));
    return DEFAULT_INITIAL_CREDITS;
  },

  getHistory: (): CreditTransaction[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'tx-init',
        timestamp: new Date().toISOString(),
        type: 'top_up',
        description: 'Welcome Bonus: 20,000 Wati AI Enterprise Credits',
        amount: 20000,
        balanceAfter: 20000,
      },
    ];
  },

  deduct: (type: CreditTransaction['type'], description: string, amount: number = 1): boolean => {
    const current = aiCreditsService.getBalance();
    if (current < amount) {
      return false;
    }
    const newBalance = current - amount;
    localStorage.setItem(STORAGE_KEY_BALANCE, String(newBalance));

    const history = aiCreditsService.getHistory();
    const newTx: CreditTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      description,
      amount: -amount,
      balanceAfter: newBalance,
    };
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([newTx, ...history.slice(0, 49)]));

    // Dispatch event so UI components immediately re-render
    window.dispatchEvent(new CustomEvent('ai-credits-updated', { detail: { balance: newBalance } }));
    return true;
  },

  topUp: (amount: number, description: string = 'Purchased Credits Top-Up'): number => {
    const current = aiCreditsService.getBalance();
    const newBalance = current + amount;
    localStorage.setItem(STORAGE_KEY_BALANCE, String(newBalance));

    const history = aiCreditsService.getHistory();
    const newTx: CreditTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'top_up',
      description,
      amount,
      balanceAfter: newBalance,
    };
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify([newTx, ...history.slice(0, 49)]));

    window.dispatchEvent(new CustomEvent('ai-credits-updated', { detail: { balance: newBalance } }));
    return newBalance;
  },
};

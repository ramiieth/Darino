/**
 * One accounting instance per screen, shared by every panel.
 * `useAccounting()` loads IndexedDB (and syncs remotely) per instance and only
 * the instance that performs an action reloads — so panels and the page summary
 * must share a single instance to stay consistent after a transaction.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useAccounting, type AccountingActions, type AccountingState } from '@/features/accounting/data/useAccounting';

type Accounting = AccountingState & AccountingActions;

const AccountingContext = createContext<Accounting | null>(null);

export function AccountingProvider({ children }: { children: ReactNode }) {
  const acc = useAccounting();
  return <AccountingContext.Provider value={acc}>{children}</AccountingContext.Provider>;
}

export function useAccountingData(): Accounting {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error('useAccountingData must be used inside <AccountingProvider>');
  return ctx;
}

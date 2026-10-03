/** ============================================================
 * خروج — لغو نشست روی سرور + پاک‌کردن دادهٔ مالی همین دستگاه
 *
 *  • قبل از پاک‌کردن، همگام‌سازی حسابداری و دارایی چندشبکه‌ای امتحان می‌شود؛
 *    اگر تأیید نشود، رابط از کاربر تأیید صریح می‌گیرد (هیچ داده‌ای بی‌صدا از بین نمی‌رود).
 *  • پاک می‌شود: دفتر حسابداری، پورتفولیو، اسنپ‌شات داشبورد، دارایی چندشبکه‌ای، دادهٔ Arcus در حافظه.
 *  • پاک نمی‌شود: کش عمومی بازار و داده‌های فقط‌محلی بخش‌های دیگر (خودرو، املاک) که نسخهٔ سروری ندارند.
 *  • در پایان صفحه بازبارگذاری می‌شود تا هیچ دادهٔ مالی در حافظهٔ جاوااسکریپت نماند.
 * ============================================================ */
import { authApi, useAuth } from './authClient';

export interface SignOutCheck {
  accountingSynced: boolean;
  custodySynced: boolean;
}

/** تلاش برای ارسال همهٔ تغییرات محلی پیش از خروج */
export async function prepareSignOut(): Promise<SignOutCheck> {
  let accountingSynced = true;
  let custodySynced = true;
  try {
    const { entryLoadAll } = await import('@/features/accounting/data/db');
    const entries = await entryLoadAll();
    if (entries.length > 0) {
      const { pushAccountingToRemote } = await import('@/repositories/accountingRepository');
      accountingSynced = (await pushAccountingToRemote()) !== null;
    }
  } catch {
    accountingSynced = false;
  }
  try {
    const { syncCustodyNow } = await import('@/features/custody/data/sync');
    const { getCustodySnapshot, loadCustody } = await import('@/features/custody/data/repository');
    await loadCustody();
    const s = getCustodySnapshot();
    const hasData = s.holdings.length + s.operations.length + s.customAssets.length + s.customNetworks.length > 0;
    custodySynced = hasData ? await syncCustodyNow() : true;
  } catch {
    custodySynced = false;
  }
  return { accountingSynced, custodySynced };
}

/** پاک‌کردن دادهٔ مالی این دستگاه (IndexedDB + حافظه) */
export async function wipeFinancialData(): Promise<void> {
  const [{ wipeCustodyData }, { accountingReset }, { clearArcusMemory }, { getDb }] = await Promise.all([
    import('@/features/custody/data/repository'),
    import('@/features/accounting/data/db'),
    import('@/features/arcus/data/useArcusAccount'),
    import('@/shared/lib/db')
  ]);
  await wipeCustodyData();
  await accountingReset();
  clearArcusMemory();
  const { clearConnectedMemory } = await import('@/features/connected/data/store');
  clearConnectedMemory();
  await (await import('@/features/boros/data/useBorosAccount')).clearBorosAccount();
  await (await import('@/features/connected/data/snapshotCache')).clearWalletSnapshots();
  const db = (await getDb()) as unknown as Record<string, { clear(): Promise<unknown> } | undefined> | null;
  if (db) {
    for (const t of ['portfolioAssets', 'dashboardSnapshots']) {
      try {
        await db[t]?.clear();
      } catch {
        /* خاموش */
      }
    }
  }
}

/**
 * خروج کامل. برگشت: آیا نشست روی سرور هم لغو شد؟
 * (آفلاین: کوکی HttpOnly از جاوااسکریپت قابل حذف نیست — از دستگاه دیگر لغوش کنید)
 */
export async function signOut(opts: { reload?: boolean } = {}): Promise<{ serverRevoked: boolean }> {
  let serverRevoked = false;
  try {
    await authApi.logoutServer();
    serverRevoked = true;
  } catch {
    serverRevoked = false;
  }
  await wipeFinancialData();
  useAuth.getState().setUnauthenticated();
  if (opts.reload !== false && typeof window !== 'undefined') window.location.reload();
  return { serverRevoked };
}

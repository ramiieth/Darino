import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppProviders } from './providers/AppProviders';
import { initTheme } from '@/shared/store/themeStore';
import { registerSW } from 'virtual:pwa-register';
import '@/styles/index.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import '@fontsource/vazirmatn/900.css';

// اعمال تم قبل از اولین render (جلوگیری از فلش)
initTheme();

// ثبت سرویس‌ورکر PWA (در iframe سندباکس خاموش می‌شود)
// + اعلان «نسخه جدید آماده است» (ممیزی §۷)
try {
  registerSW({
    immediate: true,
    onNeedRefresh: () => {
      import('@/shared/store/toastStore').then(({ toast }) => {
        toast('info', 'نسخه جدید برنامه آماده است', {
          label: 'بارگذاری مجدد',
          fn: () => window.location.reload()
        });
      });
    }
  });
} catch {
  /* پیش‌نمایش بدون سرویس‌ورکر */
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);

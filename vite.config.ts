import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * پروکسی سرور-سمت برای Providerهای بازار:
 *
 *  ۱) /coingecko-api → api.coingecko.com
 *     - دور زدن محدودیت CORS مرورگر (درخواست same-origin از UI)
 *     - درخواست‌ها از سمت سرور (Node) ارسال می‌شوند
 *     - کلید CoinGecko (COINGECKO_API_KEY — پیش‌فرض کلید اختصاصی)
 *       فقط در سرور به درخواست اضافه می‌شود؛ هرگز به Client نمی‌رسد
 *
 *  ۲) /alphavantage-api → www.alphavantage.co/query
 *     - کلید API فقط در محیط سرور (process.env.ALPHAVANTAGE_API_KEY) نگهداری می‌شود
 *     - کلید هرگز به Client ارسال نمی‌شود (طبق قانون معماری بازار)
 *     - چند کلید با کاما: «KEY1,KEY2» → چرخش round-robin در سرور
 *     - /alphavantage-api/status → { configured, keys } برای UI (بدون کلید)
 */
const AV_BASE = 'https://www.alphavantage.co';

/** کلید CoinGecko — فقط سرور-سمت (پیش‌فرض: کلید اختصاصی؛ با env جایگزین می‌شود) */
const CG_API_KEY = process.env.COINGECKO_API_KEY ?? 'CG-1fJVsdhGGY6Jrb5DTZazvScK';

function avKeys(): string[] {
  const raw = process.env.ALPHAVANTAGE_API_KEY ?? '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

/** پلاگین سرور-سمت: تزریق کلید آلفا وانتج + وضعیت پیکربندی */
function alphaVantageServer(): Plugin {
  return {
    name: 'alphavantage-server-key',
    configureServer(server) {
      server.middlewares.use('/alphavantage-api/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const keys = avKeys();
        res.end(JSON.stringify({ configured: keys.length > 0, keys: keys.length }));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/alphavantage-api/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const keys = avKeys();
        res.end(JSON.stringify({ configured: keys.length > 0, keys: keys.length }));
      });
    }
  };
}

/**
 * پلاگین اجرای محلی Vercel Functions (api/*.ts) در dev و preview:
 *  - /api/health ، /api/propertyMarket و … دقیقاً مثل Production توسط همان
 *    هندلرهای تایپ‌اسکریپت پاسخ داده می‌شوند (باندل درون‌فرآیندی با esbuild —
 *    همان روش `scripts/collect-property-market.mjs`).
 *  - بدون DATABASE_URL هندلرها در «حالت بدون دیتابیس» کار می‌کنند؛ بنابراین
 *    کلکشن دیوار در توسعه/پیش‌نمایش هم از مسیر سرور قابل اجراست.
 *  - /api/cg و /api/boros مستثنی‌اند (پروکسی مستقیم به بازارهای بالادست).
 */
function localServerlessApi(): Plugin {
  // این مسیرها توسط پروکسی‌های بازار پاسخ داده می‌شوند، نه هندلرهای محلی
  const EXCLUDED = ['/api/cg', '/api/boros'];
  const cache = new Map<string, { mtime: number; mod: Promise<{ default: unknown }> }>();

  async function loadHandler(file: string): Promise<(req: unknown, res: unknown) => Promise<void>> {
    const mtime = statSync(file).mtimeMs;
    const hit = cache.get(file);
    if (!hit || hit.mtime !== mtime) {
      const mod = (async () => {
        const { build } = await import('esbuild');
        const outFile = path.join(tmpdir(), `darino-api-${path.basename(file, '.ts')}-${mtime}.mjs`);
        await build({
          entryPoints: [file],
          bundle: true,
          platform: 'node',
          format: 'esm',
          target: 'node18',
          outfile: outFile,
          logLevel: 'silent'
        });
        return import(pathToFileURL(outFile).href) as Promise<{ default: unknown }>;
      })();
      cache.set(file, { mtime, mod });
      mod.catch(() => cache.delete(file));
    }
    const { mod } = cache.get(file)!;
    const handler = (await mod).default;
    if (typeof handler !== 'function') throw new Error(`no default handler in ${file}`);
    return handler as (req: unknown, res: unknown) => Promise<void>;
  }

  function middleware(req: { url?: string }, res: { statusCode?: number; setHeader(k: string, v: string): void; end(b: string): void }, next: (e?: unknown) => void): void {
    const url = req.url ?? '/';
    const pathname = url.split('?')[0];
    if (!pathname.startsWith('/api/') || EXCLUDED.some((p) => pathname.startsWith(p))) {
      next();
      return;
    }
    const name = pathname.slice('/api/'.length).replace(/\.ts$/, '');
    if (!/^[\w-]+$/.test(name)) {
      next();
      return;
    }
    const file = path.resolve(__dirname, 'api', `${name}.ts`);
    if (!existsSync(file)) {
      next();
      return;
    }
    loadHandler(file)
      .then((handler) => handler(req, res))
      .catch((e) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'local api error' }));
      });
  }

  return {
    name: 'local-serverless-api',
    configureServer(server) {
      // قبل از میدلورهای داخلی نصب می‌شود تا مسیرهای /api/health و … به
      // هندلر واقعی برسند (وگرنه Vite آن‌ها را به‌عنوان ماژول TS سرو می‌کند).
      // مسیرهای بازار (/api/cg ، /api/boros) صریحاً رد می‌شوند تا پروکسی
      // داخلی آن‌ها را به بالادست ببرد.
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

/** پیکربندی مشترک پروکسی (dev + preview) */
function marketProxies(): Record<string, ProxyOptions> {
  // درخواست‌ها از دید Provider باید «سرور-به-سرور» باشند؛
  // هدرهای مرورگر (Origin/Referer) حذف می‌شوند تا CDN محافظتی Provider
  // رفتار مرورگر را با محدودیت نرخ/بوت‌پروتکشن اشتباه نگیرد.
  const stripBrowserHeaders: ProxyOptions['configure'] = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('origin');
      proxyReq.removeHeader('referer');
    });
  };
  /** افزودن کلید CoinGecko به درخواست سرور-سمت */
  const cgKeyInjector: ProxyOptions['configure'] = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('origin');
      proxyReq.removeHeader('referer');
      if (!CG_API_KEY) return;
      try {
        const url = new URL(proxyReq.path, 'https://api.coingecko.com');
        url.searchParams.set('x_cg_demo_api_key', CG_API_KEY);
        proxyReq.path = url.pathname + url.search;
      } catch {
        /* خاموش */
      }
    });
  };
  return {
    // CoinGecko — پروکسی same-origin (CORS + کلید فقط سرور-سمت)
    '/coingecko-api': {
      target: 'https://api.coingecko.com',
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/coingecko-api/, '/api/v3'),
      configure: cgKeyInjector
    },
    // مسیر Production-like: پیش‌نمایش بیلد (vite preview) که کلاینت در PROD
    // به /api/cg صدا می‌زند؛ اینجا همان مسیر به upstream نگاشت می‌شود
    // (روی Vercel این مسیر توسط Serverless Function /api/cg.ts پاسخ داده می‌شود).
    '/api/cg': {
      target: 'https://api.coingecko.com',
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api\/cg/, '/api/v3'),
      configure: cgKeyInjector
    },
    // Alpha Vantage — کلید فقط در سرور تزریق می‌شود
    '/alphavantage-api': {
      target: AV_BASE,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/alphavantage-api/, '/query'),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('origin');
          proxyReq.removeHeader('referer');
          const keys = avKeys();
          if (keys.length === 0) return; // بدون کلید → خود AV خطای معتبر برمی‌گرداند
          const key = keys[Math.floor(Math.random() * keys.length)];
          try {
            const url = new URL(proxyReq.path, AV_BASE);
            url.searchParams.set('apikey', key);
            proxyReq.path = url.pathname + url.search;
          } catch {
            /* خاموش */
          }
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    alphaVantageServer(),
    localServerlessApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'دارینو — مدیریت هوشمند دارایی شخصی',
        short_name: 'دارینو',
        description:
          'دارینو: پایش پورتفولیو، شبیه‌سازی سرمایه‌گذاری، حسابداری دوطرفه و تحلیل بازار رمزارز، سهام توکن‌ایز و سنتی — آفلاین‌محور',
        lang: 'fa',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#0a0f1e',
        theme_color: '#0a0f1e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,woff,png,svg}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          // پروکسی کوین‌گکو (same-origin) — NetworkFirst با کش آفلاین
          // ⚠️ در PROD کلاینت به /api/cg می‌زند (نه /coingecko-api)؛ هر دو
          // مسیر باید پوشش داده شوند وگرنه در PWA نصب‌شده کش آفلاین بازار کار نمی‌کند.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/coingecko-api/') || url.pathname.startsWith('/api/cg'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'market-coingecko',
              networkTimeoutSeconds: 8,
              // فقط پاسخ موفق کش شود — خطای ۴۲۹/۵xx نباید آفلاین سرو شود
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      // پروکسی Boros — دور زدن محدودیت CORS (درخواست same-origin)
      '/boros-api': {
        target: 'https://api-boros.pendle.finance',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/boros-api/, '/apis/v1')
      },
      // Production-like path — روی Vercel توسط Serverless Function پاسخ داده می‌شود
      '/api/boros': {
        target: 'https://api-boros.pendle.finance',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/boros/, '/apis/v1')
      },
      ...marketProxies()
    }
  },
  preview: {
    proxy: {
      // پروکسی Boros — دور زدن محدودیت CORS (درخواست same-origin)
      '/boros-api': {
        target: 'https://api-boros.pendle.finance',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/boros-api/, '/apis/v1')
      },
      // Production-like path — کلاینت بیلدشده به /api/boros می‌زند
      '/api/boros': {
        target: 'https://api-boros.pendle.finance',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/boros/, '/apis/v1')
      },
      ...marketProxies()
    }
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200
  }
});

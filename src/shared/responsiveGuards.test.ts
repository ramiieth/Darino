// @vitest-environment node
/**
 * تضمین‌های سراسری Responsive (Regression Guards)
 *
 * این تست‌ها ساختار UI را روی سطح سورس بررسی می‌کنند تا خطاهای رایج
 * Responsive دوباره به اپ برگردند (بدون نیاز به مرورگر — قابل اجرا در CI):
 *
 *  ۱) هر جدول عریض (min-w > 400px) باید داخل کانتینر اسکرولی افقی باشد
 *     (overflow-x-auto / overflow-auto) — نه اسکرول Body.
 *  ۲) Body باید تضمین overflow-x: clip داشته باشد (ساخته Scroll نمی‌سازد).
 *  ۳) کارت موبایل جدول بازار نباید داده 7D/30D را Hide کند (Reflow، نه حذف).
 *  ۴) عرض‌های ثابت جدید ≥ 420px فقط روی <table> به‌عنوان min-width مجاز است.
 *  ۵) SegmentedControl باید در موبایل قابل اسکرول باشد (بدون فشردن تب‌ها).
 *  ۶) Sheet دکمه بستن با Touch Target کافی (≥ p-2.5) داشته باشد.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Vitest از ریشه پروژه اجرا می‌شود
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function listTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listTsx(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const presentationFiles = listTsx(join(SRC, 'features')).filter((f) =>
  f.includes('/presentation/')
);

/** برای هر <table> که min-w-[N] دارد (N>400)، کانتینر اسکرولی در خطوط بالا */
function tableScrollIssues(): string[] {
  const issues: string[] = [];
  for (const file of presentationFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/<table[\s>]/.test(line)) return;
      const m = line.match(/min-w-\[(\d+)px\]/);
      if (!m || Number(m[1]) <= 400) return;
      // ۱۲ خط قبل را برای کانتینر اسکرولی اسکن می‌کنیم (ancestors نزدیک)
      const before = lines.slice(Math.max(0, i - 12), i).join('\n');
      if (!/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(before)) {
        issues.push(
          `${relative(SRC, file)}:${i + 1} — جدول min-w-[${m[1]}px] بدون کانتینر اسکرولی افقی`
        );
      }
    });
  }
  return issues;
}

describe('Responsive Guards — جدولها', () => {
  it('همه جداول عریض داخل کانتینر اسکرولی افقی هستند (Pattern A)', () => {
    expect(tableScrollIssues()).toEqual([]);
  });

  it('بدون عرض ثابت ≥ 420px خارج از min-width جدول (no hardcoded wide boxes)', () => {
    const issues: string[] = [];
    for (const file of [...presentationFiles, ...listTsx(join(SRC, 'shared'))]) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // min-w-[N] روی table مجاز است
        if (/min-w-\[\d+px\]/.test(line) && /<table[\s>]/.test(line)) return;
        const m = line.match(/(?:^|[^a-zA-Z-])w-\[(\d+)px\]/);
        if (m && Number(m[1]) >= 420) {
          issues.push(`${relative(SRC, file)}:${i + 1} — عرض ثابت ${m[1]}px`);
        }
        const mn = line.match(/min-w-\[(\d+)px\]/);
        if (mn && Number(mn[1]) >= 420) {
          issues.push(`${relative(SRC, file)}:${i + 1} — min-width ثابت ${mn[1]}px خارج از جدول`);
        }
      });
    }
    expect(issues).toEqual([]);
  });
});

describe('Responsive Guards — Body/Global', () => {
  it('body دارای تضمین overflow-x: clip است (اسکرول افقی Body ممنوع)', () => {
    const css = readFileSync(join(SRC, 'styles/index.css'), 'utf8');
    const bodyBlock = css.match(/body\s*{[^}]*}/)?.[0] ?? '';
    expect(bodyBlock).toMatch(/overflow-x:\s*clip/);
  });
});

describe('Responsive Guards — داده مالی در Mobile', () => {
  it('کارت موبایل بازار: 24H/7D/30D همه نمایش داده می‌شوند (Reflow نه Hide)', () => {
    const src = readFileSync(join(SRC, 'features/markets/presentation/MarketsTable.tsx'), 'utf8');
    // بخش کارت موبایل (پایان فایل — بعد از MarketRow)
    const cardSrc = src.slice(src.indexOf('function MarketCard'));
    expect(cardSrc).toContain('change24h');
    expect(cardSrc).toContain('change7d');
    expect(cardSrc).toContain('change30d');
    expect(cardSrc).toContain('marketCap');
    // هیچ‌کدام با breakpoint hide نشده باشند
    expect(cardSrc).not.toMatch(/hidden\s+(sm:|md:|lg:)/);
  });
});

describe('Responsive Guards — ناوبری و Modal', () => {
  it('SegmentedControl در موبایل قابل اسکرول است (تب‌ها نمی‌فشارند)', () => {
    const src = readFileSync(join(SRC, 'shared/components/ui/SegmentedControl.tsx'), 'utf8');
    expect(src).toContain('overflow-x-auto');
    expect(src).toContain('shrink-0');
    expect(src).toContain('whitespace-nowrap');
  });

  it('Sheet: دکمه بستن با Touch Target کافی (p-2.5 یا بیشتر)', () => {
    const src = readFileSync(join(SRC, 'shared/components/ui/Sheet.tsx'), 'utf8');
    const idx = src.indexOf(`aria-label={t('close')}`);
    expect(idx).toBeGreaterThan(-1);
    const closeBtn = src.slice(Math.max(0, idx - 260), idx);
    expect(closeBtn).toMatch(/p-(2\.5|3|4|5)(?!-)/);
  });
});

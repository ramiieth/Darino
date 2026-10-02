// @vitest-environment node
/**
 * نگهبان: پلن Hobby ورسل حداکثر ۱۲ فانکشن در هر Deploy می‌پذیرد.
 * ورسل هر فایل داخل api/ را فانکشن حساب می‌کند (حتی فایل تست) مگر نامش با «_» یا «.» شروع شود.
 * پس تست‌های API در tests/api/ هستند و فیچر جدید باید ترجیحاً op تازه در endpoint موجود باشد.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HOBBY_FUNCTION_LIMIT = 12;
const apiDir = path.resolve(__dirname, '../../api');

function functionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...functionFiles(full));
    else if (/\.(ts|js|mjs|cjs)$/.test(name)) out.push(path.relative(apiDir, full));
  }
  return out;
}

describe('محدودیت فانکشن‌های ورسل', () => {
  it('هیچ فایل تستی داخل api/ نیست', () => {
    expect(functionFiles(apiDir).filter((f) => /\.(test|spec)\./.test(f))).toEqual([]);
  });

  it(`تعداد فانکشن‌ها ≤ ${HOBBY_FUNCTION_LIMIT}`, () => {
    expect(functionFiles(apiDir).length).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});

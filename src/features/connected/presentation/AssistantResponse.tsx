import { Fragment } from 'react';
import { toFaDigits } from '@/shared/utils/formatters';

/** Plain React text only: model output never becomes HTML or an executable link. */
function inline(text: string) {
  return toFaDigits(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-extrabold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    );
}

export function AssistantResponse({ text }: { text: string }) {
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const src = text.trim().split('\n');
  const blocks = src
    .map((l, k) =>
      k > 0 && isRow(l) !== isRow(src[k - 1]) && src[k - 1].trim() !== '' && l.trim() !== ''
        ? `\n${l}`
        : l
    )
    .join('\n')
    .split(/\n\s*\n/);

  return (
    <div dir="rtl" className="assistant-response space-y-3.5 text-[13.5px] leading-7 text-ink/95">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (!lines.length) return null;

        // جدول Markdown
        if (lines.length >= 2 && lines.every((line) => /^\s*\|.*\|\s*$/.test(line))) {
          const cells = (line: string) =>
            line
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((c) => c.trim());
          const rows = lines.filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line)).map(cells);
          if (!rows.length) return null;
          const [head, ...body] = rows;
          return (
            <div
              key={i}
              className="overflow-x-auto rounded-xl border border-divider/80 bg-surface-2/35"
            >
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="bg-surface-2/75">
                    {head.map((c, j) => (
                      <th
                        key={j}
                        scope="col"
                        className="border-b border-divider px-3 py-2 text-start font-extrabold text-muted"
                      >
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, k) => (
                    <tr key={k} className="transition-colors hover:bg-surface-2/40">
                      {r.map((c, j) => (
                        <td
                          key={j}
                          className="border-b border-divider/60 px-3 py-2 align-top last:border-b-0"
                        >
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // لیست بولت‌دار یا شماره‌دار
        if (lines.every((line) => /^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/.test(line))) {
          return (
            <ul key={i} className="space-y-1.5 ps-4 list-disc marker:text-accent">
              {lines.map((line, j) => (
                <li key={j} className="leading-7">
                  {inline(line.replace(/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/, ''))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, j) =>
              /^#{1,4}\s/.test(line) ? (
                <h3
                  key={j}
                  className="pt-1 text-sm font-black text-ink flex items-center gap-1.5"
                >
                  <span className="h-3.5 w-1 rounded-full bg-accent" aria-hidden />
                  <span>{inline(line.replace(/^#{1,4}\s+/, ''))}</span>
                </h3>
              ) : (
                <p key={j} className="leading-7">
                  {inline(line)}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

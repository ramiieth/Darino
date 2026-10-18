import { Fragment } from 'react';
import { toFaDigits } from '@/shared/utils/formatters';

/** Plain React text only: model output never becomes HTML or an executable link. */
function inline(text:string){return toFaDigits(text).split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i} className="font-semibold text-ink">{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>);}
export function AssistantResponse({text}:{text:string}){
 // جدول چسبیده به عنوان یا متن قبل/بعد، بلوک جدا شود
 const isRow=(l:string)=>/^\s*\|.*\|\s*$/.test(l);
 const src=text.trim().split('\n');
 const blocks=src.map((l,k)=>k>0&&isRow(l)!==isRow(src[k-1])&&src[k-1].trim()!==''&&l.trim()!==''?`\n${l}`:l).join('\n').split(/\n\s*\n/);
 return <div dir="rtl" className="assistant-response space-y-4 text-sm leading-7 text-ink">{blocks.map((block,i)=>{
  const lines=block.split('\n');
  // جدول Markdown (| a | b |) — فقط متن، بدون HTML
  if(lines.length>=2&&lines.every(line=>/^\s*\|.*\|\s*$/.test(line))){
   const cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
   const rows=lines.filter(line=>!/^\s*\|[\s:|-]+\|\s*$/.test(line)).map(cells);
   const [head,...body]=rows;
   return <div key={i} className="-mx-1 overflow-x-auto px-1"><table className="w-full border-separate border-spacing-0 text-xs"><thead><tr>{head.map((c,j)=><th key={j} scope="col" className="border-b border-divider px-2 py-1.5 text-start font-semibold text-muted">{inline(c)}</th>)}</tr></thead><tbody>{body.map((r,k)=><tr key={k}>{r.map((c,j)=><td key={j} className="border-b border-divider px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody></table></div>;
  }
  if(lines.every(line=>/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/.test(line)))return <ul key={i} className="space-y-2 ps-4 list-disc marker:text-accent">{lines.map((line,j)=><li key={j}>{inline(line.replace(/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/,''))}</li>)}</ul>;
  return <div key={i} className="space-y-2">{lines.map((line,j)=>/^#{1,4}\s/.test(line)?<h3 key={j} className="text-sm font-semibold">{inline(line.replace(/^#{1,4}\s+/,''))}</h3>:<p key={j}>{inline(line)}</p>)}</div>;
 })}</div>;
}

import { Fragment } from 'react';
import { toFaDigits } from '@/shared/utils/formatters';

/** Plain React text only: model output never becomes HTML or an executable link. */
function inline(text:string){return toFaDigits(text).split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i} className="font-semibold text-ink">{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>);}
export function AssistantResponse({text}:{text:string}){
 const blocks=text.trim().split(/\n\s*\n/);
 return <div dir="rtl" className="assistant-response space-y-4 text-sm leading-7 text-ink">{blocks.map((block,i)=>{
  const lines=block.split('\n');
  if(lines.every(line=>/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/.test(line)))return <ul key={i} className="space-y-2 ps-4 list-disc marker:text-accent">{lines.map((line,j)=><li key={j}>{inline(line.replace(/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/,''))}</li>)}</ul>;
  return <div key={i} className="space-y-2">{lines.map((line,j)=>/^#{1,4}\s/.test(line)?<h3 key={j} className="text-sm font-semibold">{inline(line.replace(/^#{1,4}\s+/,''))}</h3>:<p key={j}>{inline(line)}</p>)}</div>;
 })}</div>;
}

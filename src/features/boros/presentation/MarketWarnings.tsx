import { marketWarnings } from '../domain/workflow';
import type { BorosMarket } from '../domain/types';
import { Badge } from '@/shared/components/ui/Badge';
export function MarketWarnings({market}:{market:BorosMarket}){
 const warnings=marketWarnings(market);
 return warnings.length?<div className="flex flex-wrap gap-2" aria-label="هشدارهای این بازار">{warnings.map(w=><Badge key={w.text} tone={w.tone==='warn'?'warn':'neutral'}>{w.text}</Badge>)}</div>:null;
}

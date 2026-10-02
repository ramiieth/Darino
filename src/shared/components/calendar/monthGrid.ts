// Adapted from farjadp/taghvim src/lib/calendar.ts (MIT), commit 1ece2ba2.
// Keep Darino's existing local-noon timestamp contract and conversion engine.
import { jalaaliToTimestamp, jalaliMonthLength, tsToJalaali } from '@/shared/utils/jalali';
export const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export function monthGrid(year:number,month:number) {
 const first=jalaaliToTimestamp(year,month,1),offset=(new Date(first).getDay()+1)%7;
 const count=Math.max(35,Math.ceil((offset+jalaliMonthLength(year,month))/7)*7);
 return Array.from({length:count},(_,i)=>{const d=new Date(first);d.setDate(d.getDate()-offset+i);const ts=d.getTime(),j=tsToJalaali(ts);return {ts,...j,inMonth:j.year===year&&j.month===month};});
}
export function shiftMonth(year:number,month:number,delta:number) {const total=year*12+month-1+delta;return {year:Math.floor(total/12),month:((total%12)+12)%12+1};}

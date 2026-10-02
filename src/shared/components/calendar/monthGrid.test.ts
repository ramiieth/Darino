import { describe,it,expect } from 'vitest';
import { monthGrid,shiftMonth } from './monthGrid';
import { formatGregorianIso,jalaaliToTimestamp } from '@/shared/utils/jalali';
describe('Taghvim month grid with Darino dates',()=>{
 it('preserves leap Esfand and rolls to Nowruz without shifting the civil date',()=>{const grid=monthGrid(1403,12);expect(grid.filter(d=>d.inMonth)).toHaveLength(30);expect(grid.find(d=>d.inMonth&&d.day===30)?.ts).toBe(jalaaliToTimestamp(1403,12,30));expect(formatGregorianIso(jalaaliToTimestamp(1404,1,1))).toBe('2025-03-21');expect(shiftMonth(1403,12,1)).toEqual({year:1404,month:1});});
 it('is Saturday-first with complete weeks and exactly the requested month',()=>{for(const [y,m] of [[1404,1],[1404,12],[1405,7]]){const grid=monthGrid(y,m);expect(new Date(grid[0].ts).getDay()).toBe(6);expect(grid.length%7).toBe(0);expect(grid.filter(d=>d.inMonth).every(d=>d.year===y&&d.month===m)).toBe(true);}});
});

// @vitest-environment jsdom
import { afterEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,cleanup } from '@testing-library/react';
import { SmartDateField } from './SmartDateField';
import { Sheet } from './Sheet';
import { jalaaliToTimestamp } from '@/shared/utils/jalali';
afterEach(cleanup);
it('selects a Persian date, disallows future days and keeps parent filters open on Escape',()=>{
 const onChange=vi.fn(),parentClose=vi.fn(),value=jalaaliToTimestamp(1403,12,29);
 render(<Sheet open onClose={parentClose} title="فیلتر"><SmartDateField label="تاریخ خرید" value={value} max={jalaaliToTimestamp(1403,12,30)} onChange={onChange}/></Sheet>);
 fireEvent.click(screen.getByRole('button',{name:'تاریخ خرید'}));
 expect((screen.getByRole('button',{name:'۱۴۰۴/۰۱/۰۱'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'۱۴۰۳/۱۲/۳۰'}));expect(onChange).toHaveBeenCalledWith(jalaaliToTimestamp(1403,12,30));expect(parentClose).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'تاریخ خرید'}));fireEvent.keyDown(window,{key:'Escape'});expect(parentClose).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'فیلتر'})).toBeTruthy();
});

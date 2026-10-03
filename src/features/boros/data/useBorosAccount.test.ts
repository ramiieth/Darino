// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/repositories/remoteClient',async(importOriginal)=>({...await importOriginal<object>(),fetchJson:vi.fn()}));
vi.mock('@/shared/lib/db',()=>({settingGet:vi.fn(async(_k:string,fallback:unknown)=>fallback),settingSet:vi.fn(async()=>{}),settingDeletePrefix:vi.fn(async()=>{})}));
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { useBorosAccount, refreshBorosAccount, clearBorosAccount } from './useBorosAccount';
import { packAccount, CROSS } from '@/shared/boros/account';
const root='0x1111111111111111111111111111111111111111';
const snapshot={root,accountId:0,fetchedAt:1,syncedAt:1,assets:[],balances:[],positions:[],settlements:[],transfers:[],orders:[],partial:false,historyComplete:true,errors:[]};
beforeEach(()=>{vi.clearAllMocks();useBorosAccount.setState({root,accountId:0,hydrated:true,data:snapshot,error:null,loading:false,retryAt:0});});
it('keeps the last valid snapshot after quota failure and blocks automatic retry until cooldown',async()=>{vi.mocked(fetchJson).mockRejectedValue(new HttpError(429,'سهمیه',60));await refreshBorosAccount(true);expect(useBorosAccount.getState().data).toEqual(snapshot);expect(useBorosAccount.getState().retryAt).toBeGreaterThan(Date.now());await refreshBorosAccount(true);expect(fetchJson).toHaveBeenCalledTimes(1);});
it('ignores late account data after removal/logout',async()=>{let resolve!:(v:unknown)=>void;vi.mocked(fetchJson).mockReturnValue(new Promise(r=>{resolve=r;}));const pending=refreshBorosAccount(true);await new Promise(r=>setTimeout(r,0));await clearBorosAccount();resolve({...snapshot,fetchedAt:Date.now()});await pending;expect(useBorosAccount.getState().data).toBeNull();expect(useBorosAccount.getState().root).toBe('');});
it('rejects mismatched account response and never replaces valid data with another wallet',async()=>{vi.mocked(fetchJson).mockResolvedValue({...snapshot,root:'0x2222222222222222222222222222222222222222'});await refreshBorosAccount(true);expect(useBorosAccount.getState().data).toEqual(snapshot);expect(useBorosAccount.getState().error).not.toBeNull();});

// @vitest-environment node
import {beforeEach,describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({book:null as unknown,sql:vi.fn(),status:0,body:{} as Record<string,unknown>}));
vi.mock('../../api/_authCore',()=>({requireSession:vi.fn(async()=>({userId:'owner-only'}))}));
vi.mock('../../api/_schema',()=>({ensureSchema:vi.fn(async()=>true)}));
vi.mock('../../api/_neon',()=>({isDbConfigured:()=>true,db:()=>h.sql,readBody:async()=>({entries:[{id:1}]}),json:(_res:unknown,status:number,body:Record<string,unknown>)=>{h.status=status;h.body=body;}}));
import handler from '../../api/accounting';
beforeEach(()=>{h.book=null;h.sql.mockReset();h.sql.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('').includes('SELECT payload')?(h.book?[{payload:{value:h.book}}]:[]):[]);});
const call=(method:string,url='/api/accounting')=>handler({method,url} as never,{} as never);
describe('retirement of the obsolete cash ledger',()=>{
 it('does not delete data before confirmed purchase migration',async()=>{await call('POST','/api/accounting?op=retire');expect(h.status).toBe(409);expect(h.sql.mock.calls.some(c=>c[0].join('').includes('DELETE'))).toBe(false);});
 it('deletes obsolete records in one scoped statement after preserving cost basis',async()=>{h.book={version:1,migrationConfirmed:true,lots:[]};await call('POST','/api/accounting?op=retire');expect(h.status).toBe(200);const deletes=h.sql.mock.calls.filter(c=>c[0].join('').includes('DELETE'));expect(deletes).toHaveLength(1);expect(deletes[0].slice(1)).toEqual(['owner-only','owner-only','owner-only','owner-only','owner-only']);expect(deletes[0][0].join('')).not.toContain("id='cost-basis-v1'");});
 it('checks the retirement marker again when an old write reaches the database',async()=>{await call('POST');const insert=h.sql.mock.calls.find(c=>c[0].join('').includes('INSERT INTO'));expect(insert?.[0].join('')).toContain('WHERE NOT EXISTS');expect(insert?.[0].join('')).toContain("migrationConfirmed");expect(h.body).toMatchObject({inserted:0,skipped:1});});
 it('old devices cannot push cash balances back or pull obsolete journal rows',async()=>{h.book={version:1,migrationConfirmed:true,lots:[]};await call('POST');expect(h.status).toBe(409);await call('GET');expect(h.body).toMatchObject({retired:true,entries:[],lots:[]});expect(h.sql.mock.calls).toHaveLength(2);});
});

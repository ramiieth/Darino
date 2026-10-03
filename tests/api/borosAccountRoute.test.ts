import { Readable } from 'node:stream';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
vi.mock('../../api/_authCore',()=>({requireSession:vi.fn()}));
vi.mock('../../api/_borosAccount',()=>({readBorosAccount:vi.fn(),readBorosPreview:vi.fn(),readBorosHistory:vi.fn(),BorosReadError:class extends Error{status=502;}}));
import handler from '../../api/borosAccount';
import { requireSession } from '../../api/_authCore';
import { readBorosAccount, readBorosPreview, readBorosHistory } from '../../api/_borosAccount';
import { borosRoot, borosHandle } from '../fixtures/borosAccount';
const res=()=>({statusCode:0,setHeader:vi.fn(),end:vi.fn()});
const req=(method:string,url:string,body='')=>Object.assign(Readable.from([body]),{method,url,headers:{}}) as IncomingMessage;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireSession).mockResolvedValue({userId:'owner'} as any);});
it('never contacts providers without an authenticated session',async()=>{vi.mocked(requireSession).mockResolvedValue(null);await handler(req('GET','/api/borosAccount?root='+borosRoot),res() as unknown as ServerResponse);expect(readBorosAccount).not.toHaveBeenCalled();});
it('rejects signing payloads and unsupported methods',async()=>{const r=res();await handler(req('POST','/api/borosAccount',JSON.stringify({marketAcc:borosHandle,marketId:1,side:0,size:'100',tif:2,slippage:.005,signature:'evil'})),r as unknown as ServerResponse);expect(r.statusCode).toBe(400);expect(readBorosPreview).not.toHaveBeenCalled();const r2=res();await handler(req('DELETE','/api/borosAccount'),r2 as unknown as ServerResponse);expect(r2.statusCode).toBe(405);});
it('validates account IDs, root and isolated market identity before requests',async()=>{const r=res();await handler(req('GET','/api/borosAccount?root='+borosRoot+'&accountId=256'),r as unknown as ServerResponse);expect(r.statusCode).toBe(400);expect(readBorosAccount).not.toHaveBeenCalled();});
it('passes only the bounded read-only preview DTO',async()=>{vi.mocked(readBorosPreview).mockResolvedValue({success:true} as any);const r=res();await handler(req('POST','/api/borosAccount',JSON.stringify({marketAcc:borosHandle,marketId:1,side:0,size:'1000000000000000000',tif:2,slippage:.005})),r as unknown as ServerResponse);expect(r.statusCode).toBe(200);expect(readBorosPreview).toHaveBeenCalledOnce();expect(r.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');});

it('routes on-demand history through the same session guard and rejects unknown views',async()=>{
 const r=res();await handler(req('GET','/api/borosAccount?root='+borosRoot+'&view=order-history'),r as unknown as ServerResponse);expect(readBorosHistory).toHaveBeenCalledWith(borosRoot,0,'order-history');expect(readBorosAccount).not.toHaveBeenCalled();
 const invalid=res();await handler(req('GET','/api/borosAccount?root='+borosRoot+'&view=secret'),invalid as unknown as ServerResponse);expect(invalid.statusCode).toBe(400);
 vi.mocked(requireSession).mockResolvedValue(null);vi.mocked(readBorosHistory).mockClear();await handler(req('GET','/api/borosAccount?root='+borosRoot+'&view=trade-history'),res() as unknown as ServerResponse);expect(readBorosHistory).not.toHaveBeenCalled();
});

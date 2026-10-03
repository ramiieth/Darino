/** Run in a trusted server environment after Zerion approves your production callback URL. */
const key=process.env.ZERION_API_KEY,callback=process.env.ZERION_WEBHOOK_CALLBACK_URL;
const addresses=[...new Set((process.env.ZERION_WEBHOOK_WALLETS??'').split(',').map(s=>s.trim()).filter(Boolean))];
if(!key||!callback||!process.env.ZERION_WEBHOOK_CERTIFICATE_PEM||!addresses.length||addresses.length>5)throw new Error('Configure the server key, trusted public certificate, HTTPS callback and 1–5 wallet addresses first.');
const url=new URL(callback);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/api/zerionWebhook')throw new Error('Use the approved HTTPS production /api/zerionWebhook URL.');
const base='https://api.zerion.io/v1/tx-subscriptions/';const headers={Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json'};
const listed=await fetch(base,{headers,signal:AbortSignal.timeout(15000)});if(!listed.ok)throw new Error('Could not inspect existing subscriptions: HTTP '+listed.status);
const existing=await listed.json();if(existing.links?.next)throw new Error('Review paginated subscriptions in the Zerion dashboard before registering; no duplicate subscription was created.');
if((existing.data??[]).some(s=>s.attributes?.callback_url===callback)){console.log('Subscription already exists for this callback. Review its wallets in Zerion; no duplicate created.');process.exit(0);}
const created=await fetch(base,{method:'POST',headers,body:JSON.stringify({callback_url:callback,addresses}),signal:AbortSignal.timeout(15000)});
if(!created.ok)throw new Error('Subscription creation failed: HTTP '+created.status+'. Confirm URL approval and quota in Zerion.');
console.log('Subscription created. The receiver verifies signatures and retains periodic reconciliation as fallback.');

import { randomBytes,createHash } from 'node:crypto';
import { collections,calculateMetrics,shopifyRecords } from './model.mjs';
import { encrypt,decrypt,shopDomain,validWebhook,validShopifyOAuth,publicConnection } from './security.mjs';
export function createApi({store,auth,providers,sync,config,framework,limits=new Map()}) {
  const app=framework(); app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set('X-Content-Type-Options','nosniff'); res.set('Referrer-Policy','no-referrer'); res.set('X-Frame-Options','DENY');
    // O protótipo usa handlers inline. Remover unsafe-inline numa futura separação da interface.
    res.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099 http://localhost:9099; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    next();
  });
  app.get('/api/health',(_req,res)=>res.json({ok:true,mode:config.emulators ? 'emulator' : 'production'}));
  app.get('/api/config',(_req,res)=>res.json({firebase:{apiKey:config.webApiKey,authDomain:config.authDomain,projectId:config.projectId},emulators:config.emulators}));
  app.post('/webhooks/shopify',framework.raw({type:'application/json',limit:'5mb'}),async(req,res)=>{
    if(!validWebhook(req.body,req.get('X-Shopify-Hmac-Sha256'),config.shopifySecret)) return res.sendStatus(401);
    let shop;
    try {shop=shopDomain(req.get('X-Shopify-Shop-Domain'));} catch {return res.sendStatus(400);}
    const link=await store.db.doc(`shopLinks/${shop}`).get();
    if(!link.exists) return res.sendStatus(200);
    const topic=req.get('X-Shopify-Topic');
    if(topic==='app/uninstalled') {
      await store.connection(link.data().ownerId,'shopify').delete(); await link.ref.delete(); return res.sendStatus(200);
    }
    if(!['orders/create','orders/updated','orders/cancelled'].includes(topic)) return res.sendStatus(400);
    let body; try {body=JSON.parse(req.body.toString());} catch {return res.sendStatus(400);}
    if(!/^\d+$/.test(String(body.id)) || !req.get('X-Shopify-Webhook-Id')) return res.sendStatus(400);
    const key=createHash('sha256').update(shop+req.get('X-Shopify-Webhook-Id')).digest('hex');
    try {await store.db.doc(`webhookQueue/${key}`).create({ownerId:link.data().ownerId,shop,orderId:String(body.id),createdAt:new Date().toISOString(),status:'pending',attempts:0});}
    catch(error) {if(error.code!==6) throw error;}
    res.sendStatus(200);
  });
  app.use(framework.json({limit:'1mb'}));
  app.use('/api',async(req,res,next)=>{
    try {
      const token=req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if(!token) return res.status(401).json({error:'Entre na sua conta.'});
      let user;
      try {user=await auth.verifyIdToken(token,true);} catch {return res.status(401).json({error:'Sessão expirada. Entre novamente.'});}
      if(!config.emulators && !user.email_verified) return res.status(403).json({error:'Confirme o seu email antes de usar o painel.'});
      const now=Date.now(),limit=limits.get(user.uid);
      if(limit && now-limit.start<60000 && limit.count>=200) return res.status(429).json({error:'Muitos pedidos. Aguarde um minuto.'});
      if(!limit || now-limit.start>=60000) limits.set(user.uid,{start:now,count:1}); else limit.count++;
      if(limits.size>10000) for(const [uid,value] of limits) if(now-value.start>60000) limits.delete(uid);
      req.user=user; req.business=await store.ensureBusiness(user.uid,user.email); next();
    } catch(error) {next(error);}
  });
  app.get('/api/state',async(req,res)=>{
    const tag='"'+req.user.uid+':'+(req.business.dataVersion || 0)+'"';
    res.set('ETag',tag);res.set('Cache-Control','private, no-cache');
    if(req.get('If-None-Match')===tag)return res.status(304).end();
    res.json(await store.state(req.user.uid));
  });
  app.post('/api/data/:collection',async(req,res)=>res.json({revisions:await store.patch(req.user.uid,req.params.collection,req.body.changes)}));
  app.get('/api/metrics',async(req,res)=>{
    const {start,end,product=''}=req.query;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start>end || Date.parse(end)-Date.parse(start)>366*86400000) return res.status(400).json({error:'Selecione um período até 366 dias.'});
    res.json(calculateMetrics(await store.state(req.user.uid),start,end,product));
  });
  app.get('/api/connections',async(req,res)=>{
    const shop=(await store.connection(req.user.uid,'shopify').get()).data(),meta=(await store.connection(req.user.uid,'meta').get()).data();
    res.json({shopify:{...publicConnection(shop),configured:Boolean(config.shopifyId && config.shopifySecret && config.encryptionKey)},meta:{...publicConnection(meta),configured:Boolean(config.metaId && config.metaSecret && config.encryptionKey)}});
  });
  app.delete('/api/connections/:provider',async(req,res)=>{
    if(!['shopify','meta'].includes(req.params.provider)) return res.sendStatus(400);
    const ref=store.connection(req.user.uid,req.params.provider),snap=await ref.get();
    if(req.params.provider==='shopify' && snap.exists) await store.db.doc(`shopLinks/${snap.data().shop}`).delete();
    await ref.delete(); res.json({ok:true});
  });
  app.post('/api/sync/:provider',async(req,res)=>{
    if(!['shopify','meta'].includes(req.params.provider)) return res.sendStatus(400);
    res.json(await sync.run(req.user.uid,req.params.provider));
  });
  async function orderStatus(req,res){
    const wanted=req.method==='POST'?req.body.status:req.query.status;
    if(!/^\d+$/.test(req.params.id) || !['concluido','cancelado'].includes(wanted))return res.status(400).json({error:'Estado de pedido inválido.'});
    const uid=req.user.uid;
    const owned=await store.records(uid,'vendas').where('record.shopifyOrderId','==',req.params.id).get();
    if(owned.empty)return res.status(404).json({error:'Este pedido não pertence ao seu negócio.'});
    if(owned.size>100)return res.status(422).json({error:'Este pedido tem mais de 100 registos no painel e precisa de uma atualização assistida.'});
    const snap=await store.connection(uid,'shopify').get();
    if(!snap.exists)return res.status(400).json({error:'Ligue a loja Shopify antes de alterar este pedido.'});
    const release=await store.claim(uid,'shopify');
    if(!release)return res.status(409).json({error:'Aguarde a sincronização Shopify em curso.'});
    try{
      const connection=snap.data(),{token}=decrypt(connection.credentials,config.encryptionKey);
      let order=await providers.shopifyOrder(connection.shop,token,req.params.id);
      const done=()=>wanted==='cancelado'?Boolean(order.cancelled_at):order.fulfillment_status==='fulfilled';
      if(req.method==='POST' && !done())order=await providers.shopifyStatus(connection.shop,token,req.params.id,wanted);
      // CSV/backups antigos têm IDs locais, não os IDs sh_ da sincronização.
      // Atualizar todos os registos já existentes deste pedido sem criar duplicados nem substituir contactos/valores.
      const confirmed=order.cancelled_at?'cancelado':order.fulfillment_status==='fulfilled'?'concluido':null;
      const records=confirmed?await store.importedMany(uid,'vendas',owned.docs.map(doc=>({record:{...doc.data().record,status:confirmed},sourceUpdatedAt:order.updated_at,statusOnly:true}))):owned.docs.map(doc=>({...doc.data().record,_revision:doc.data().revision}));
      const pending=!done();
      res.status(pending?202:200).json({ok:!pending,pending,records,message:pending?'A Shopify está a processar a alteração. A confirmar o estado do pedido…':null});
    }catch(error){await store.connection(uid,'shopify').update({lastError:error.message});res.status(502).json({error:error.message});}
    finally{await release();}
  }
  app.post('/api/shopify/orders/:id/status',orderStatus);
  app.get('/api/shopify/orders/:id/status',orderStatus);
  app.get('/api/meta/accounts',async(req,res)=>{
    const snap=await store.connection(req.user.uid,'meta').get();
    if(!snap.exists) return res.status(400).json({error:'Ligue a conta Meta primeiro.'});
    const {token}=decrypt(snap.data().credentials,config.encryptionKey);
    res.json({accounts:await providers.metaAccounts(token)});
  });
  app.post('/api/meta/account',async(req,res)=>{
    if(!/^act_\d+$/.test(req.body.accountId)) return res.status(400).json({error:'Conta de anúncios inválida.'});
    const ref=store.connection(req.user.uid,'meta'),snap=await ref.get();
    if(!snap.exists) return res.status(400).json({error:'Ligue a conta Meta primeiro.'});
    const {token}=decrypt(snap.data().credentials,config.encryptionKey);
    const accounts=await providers.metaAccounts(token), account=accounts.find(a=>a.id===req.body.accountId);
    if(!account) return res.status(403).json({error:'Não tem acesso a esta conta de anúncios.'});
    const rate=Number(req.body.conversionRate);
    if(account.currency!=='MZN' && (!Number.isFinite(rate) || rate<=0)) return res.status(400).json({error:`Informe a taxa de conversão de ${account.currency} para MZN.`});
    // Não misturar gastos de duas contas no mesmo negócio sem uma migração explícita.
    if(snap.data().accountId && snap.data().accountId!==account.id) return res.status(409).json({error:'Desligue a integração antes de mudar de conta. Os gastos já importados ficam no histórico.'});
    await ref.update({accountId:account.id,currency:account.currency,conversionRate:account.currency==='MZN' ? 1 : rate,timezone:account.timezone_name});
    res.json(await sync.run(req.user.uid,'meta'));
  });
  app.post('/api/oauth/:provider',async(req,res)=>{
    const provider=req.params.provider;
    if(!['shopify','meta'].includes(provider)) return res.sendStatus(400);
    if(!config.encryptionKey || !(provider==='shopify' ? config.shopifyId && config.shopifySecret : config.metaId && config.metaSecret)) return res.status(503).json({error:'A integração ainda precisa de configuração pelo administrador. Consulte SETUP.md.'});
    if(Buffer.from(config.encryptionKey,'base64').length!==32)return res.status(503).json({error:'A INTEGRATION_ENCRYPTION_KEY precisa de 32 bytes em base64. Verifique o Secret na Cloudflare, sem aspas ou espaços adicionais.'});
    if(!config.baseUrl.startsWith('https://')) return res.status(503).json({error:'As integrações reais precisam de um endereço público HTTPS.'});
    const state=randomBytes(32).toString('hex'),shop=provider==='shopify' ? shopDomain(req.body.shop) : null;
    await store.db.doc(`oauthStates/${state}`).create({ownerId:req.user.uid,provider,shop,expiresAt:Date.now()+10*60000});
    const redirect=`${config.baseUrl}/oauth/${provider}/callback`;
    const url=new URL(provider==='shopify' ? `https://${shop}/admin/oauth/authorize` : `https://www.facebook.com/${config.metaVersion}/dialog/oauth`);
    url.search=new URLSearchParams({client_id:provider==='shopify' ? config.shopifyId : config.metaId,
      redirect_uri:redirect,state,scope:provider==='shopify' ? 'read_orders,write_orders,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders' : 'ads_read'}).toString();
    res.json({url:url.toString()});
  });
  app.get('/oauth/:provider/callback',async(req,res)=>{
    let stage='validar a tentativa de autorização';
    try{
    const provider=req.params.provider,params=new URL(req.originalUrl,config.baseUrl).searchParams;
    if(!['shopify','meta'].includes(provider) || !/^[a-f0-9]{64}$/.test(params.get('state') || '') || !params.get('code')) return res.status(400).send('Autorização inválida ou recusada. Volte ao painel.');
    if(provider==='shopify' && !validShopifyOAuth(params,config.shopifySecret)) return res.sendStatus(401);
    const saved=await store.db.runTransaction(async tx=>{
      const ref=store.db.doc(`oauthStates/${params.get('state')}`),snapshot=await tx.get(ref),state=snapshot.data();
      const invalid=message=>Object.assign(new Error(message),{status:400});
      if(!state || state.provider!==provider)throw invalid('Esta tentativa de ligação já foi usada ou não foi iniciada pelo painel. Volte ao painel e clique novamente em Ligar. Não recarregue esta página.');
      if(!Number.isFinite(state.expiresAt) || state.expiresAt<Date.now())throw invalid('A autorização expirou após 10 minutos. Volte ao painel e inicie uma nova ligação.');
      tx.delete(ref); return state;
    });
    const returnedShop=provider==='shopify'?shopDomain(params.get('shop')):null;
    stage='trocar o código de autorização com a plataforma';
    const result=provider==='shopify' ? await providers.exchangeShopify(returnedShop,params.get('code')) : await providers.exchangeMeta(params.get('code'),`${config.baseUrl}/oauth/meta/callback`);
    if(!result.access_token) throw new Error('A plataforma não devolveu autorização utilizável.');
    stage='proteger o token com INTEGRATION_ENCRYPTION_KEY';
    const connection={credentials:encrypt({token:result.access_token},config.encryptionKey),connectedAt:new Date().toISOString(),lastError:null,lastSync:null};
    if(provider==='shopify') {
      let identity;
      if(saved.shop!==returnedShop){
        try{
          identity=await providers.shopifyIdentity(returnedShop,result.access_token);
          const requested=await providers.shopifyIdentity(saved.shop,result.access_token);
          if(!identity?.id || identity.id!==requested?.id)throw new Error('different-shop');
        }catch{throw Object.assign(new Error('Não foi possível confirmar que os dois domínios pertencem à mesma loja. Inicie novamente com o domínio .myshopify.com usado pela Shopify.'),{status:400});}
      }
      connection.shop=identity?shopDomain(identity.myshopifyDomain):returnedShop;
      stage='guardar a ligação da loja no Firestore';
      await store.db.runTransaction(async tx=>{
        const link=store.db.doc(`shopLinks/${connection.shop}`),existing=await tx.get(link);
        if(existing.exists && existing.data().ownerId!==saved.ownerId) throw Object.assign(new Error('Esta loja já está ligada a outro negócio.'),{status:409});
        tx.set(link,{ownerId:saved.ownerId}); tx.set(store.connection(saved.ownerId,provider),connection);
      });
      stage='registar webhooks e iniciar a importação';
      try {await providers.registerWebhooks(connection.shop,result.access_token,`${config.baseUrl}/webhooks/shopify`); await sync.run(saved.ownerId,'shopify');}
      catch(error) {await store.connection(saved.ownerId,provider).update({lastError:error.message});}
    } else {
      stage='guardar a ligação Meta no Firestore';
      connection.expiresAt=result.expires_in ? Date.now()+Number(result.expires_in)*1000 : null;
      await store.connection(saved.ownerId,provider).set(connection);
    }
    res.redirect('/?connection='+provider);
    }catch(error){if(error.status)throw error;throw Object.assign(new Error('Falha ao '+stage+'. Inicie uma nova ligação. Se persistir, consulte os logs do Worker sem partilhar credenciais.'),{status:502});}
  });
  if(framework.static) app.use(framework.static('dist',{index:'index.html',etag:true}));
  app.get('/painel-negocio-3.html',(_req,res)=>res.redirect('/'));
  app.use((error,req,res,_next)=>{
    const status=error.status || (error.type==='entity.too.large' ? 413 : 500);
    // Não imprimir requisições, tokens, URLs OAuth ou respostas integrais das plataformas.
    console.error(`Pedido ${req.method} falhou (${status}).`);
    res.status(status).json({error:status===500 ? 'Não foi possível concluir a operação no servidor. Tente novamente.' : error.message});
  });
  return app;
}

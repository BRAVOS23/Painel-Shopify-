import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {encrypt,decrypt,validWebhook,validShopifyOAuth,shopDomain,publicConnection} from '../server/security.mjs';
import {shopifyRecords,metaRecords,calculateMetrics,validateRecord} from '../server/model.mjs';
import {createProviders} from '../server/providers.mjs';
export const order={id:'123',created_at:'2026-10-12T08:00:00Z',updated_at:'2026-10-12T09:00:00Z',currency:'MZN',shipping_address:{name:'Cliente',phone:'123',city:'Maputo'},line_items:[{id:'1',title:' Produto A ',quantity:2,price:'100',discount_allocations:[{amount:'20'}]},{id:'2',title:'Produto B',quantity:1,price:'50'}]};
test('tokens cifrados não são legíveis e alterações são recusadas',()=>{
 const key=randomBytes(32).toString('base64'),cipher=encrypt({token:'test-secret'},key);
 assert(!JSON.stringify(cipher).includes('test-secret'));assert.equal(decrypt(cipher,key).token,'test-secret');
 assert.throws(()=>decrypt({...cipher,tag:randomBytes(16).toString('base64')},key));assert.throws(()=>encrypt({token:'x'},''));
});
test('webhook exige assinatura do conteúdo exato',()=>{
 const body=Buffer.from('{"id":123}'),signature=createHmac('sha256','test').update(body).digest('base64');
 assert(validWebhook(body,signature,'test'));assert(!validWebhook(Buffer.from('{"id":124}'),signature,'test'));assert(!validWebhook(body,signature,''));
});
test('OAuth Shopify verifica HMAC e restringe o domínio',()=>{
 const params=new URLSearchParams({shop:'test.myshopify.com',code:'code',state:'state',timestamp:'1'});
 const signed=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('&');params.set('hmac',createHmac('sha256','secret').update(signed).digest('hex'));
 assert(validShopifyOAuth(params,'secret'));params.set('code','other');assert(!validShopifyOAuth(params,'secret'));
 assert.equal(shopDomain('TEST.myshopify.com'),'test.myshopify.com');assert.throws(()=>shopDomain('test.myshopify.com.evil.test'));assert.throws(()=>shopDomain('127.0.0.1'));
});
test('importação Shopify preserva data, descontos e IDs determinísticos',()=>{
 const records=shopifyRecords(order,[{nome:'Produto A'}]);assert.equal(records[0].valor,180);assert.equal(records[0].produto,'Produto A');assert.equal(records[0].data,'2026-10-12');
 assert.deepEqual(shopifyRecords(order,[{nome:'Produto A'}]),records);assert.equal(records[0].id,'sh_123_1');assert.equal(records[0].semana,'semana2');
 assert.throws(()=>shopifyRecords({...order,currency:'USD'}));
 assert.equal(shopifyRecords({...order,cancelled_at:'2026-10-12'})[0].status,'cancelado');
});
test('Meta associa produto sem omitir campanhas não correspondentes',()=>{
 const rows=[{campaign_id:'1',campaign_name:'  Produto A ',spend:'10',date_start:'2026-10-12'},{campaign_id:'2',campaign_name:'Outra campanha',spend:'20',date_start:'2026-10-12'}];
 const result=metaRecords(rows,[{nome:'Produto A'}],'act_1','MZN');assert.equal(result.records.length,2);assert.equal(result.records[1].produto,'');assert.deepEqual(result.unmatched,['Outra campanha']);
 assert.equal(metaRecords(rows,[],'act_1','USD','MZN',64).records[0].valor,640);assert.throws(()=>metaRecords(rows,[],'act_1','USD','MZN',0));
});
test('rentabilidade inclui entregador e CPA conta pedidos, não itens',()=>{
 const sales=shopifyRecords(order).map(row=>({...row,status:'concluido',comissao:row.id.endsWith('_1')?30:0}));
 const state={vendas:sales,produtos:[{nome:'Produto A',custo:20},{nome:'Produto B',custo:10}],ads:[{data:'2026-10-12',produto:'',tipo:'ads',valor:20}],operacional:[{nome:'mensal',data:'2026-10-01',recorrente:true,valor:310}]};
 const metrics=calculateMetrics(state,'2026-10-12','2026-10-12');
 assert.equal(metrics.orders,1);assert.equal(metrics.cpa,20);assert.equal(metrics.revenue,230);assert.equal(metrics.acquisition,50);assert.equal(metrics.delivery,30);assert.equal(metrics.operational,10);assert.equal(metrics.total,110);
 assert.equal(calculateMetrics(state,'2026-10-12','2026-10-12','Produto A').operational,0);
});
test('API rejeita campos extras, fotos executáveis e valores inválidos',()=>{
 assert.throws(()=>validateRecord('fluxo',{id:'../escape',tipo:'entrada'}));assert.throws(()=>validateRecord('produtos',{id:'x',nome:'x',custo:-1}));assert.throws(()=>validateRecord('produtos',{id:'x',nome:'x',foto:'javascript:alert(1)'}));assert.throws(()=>validateRecord('fluxo',{id:'x',tipo:'entrada',ownerId:'other'}));
});
test('metadados da integração nunca devolvem credenciais',()=>{
 assert(!JSON.stringify(publicConnection({shop:'test.myshopify.com',credentials:{token:'secret'},access_token:'secret'})).includes('secret'));
});
test('paginação Meta usa cursor apenas no domínio oficial',async()=>{
 const urls=[];const providers=createProviders({metaVersion:'v24.0',metaSecret:'secret'},async url=>{
  urls.push(String(url));return new Response(JSON.stringify(urls.length===1?{data:[{id:'1'}],paging:{next:'https://evil.test',cursors:{after:'next'}}}:{data:[{id:'2'}]}),{status:200});
 });
 assert.deepEqual(await providers.metaAccounts('token'),[{id:'1'},{id:'2'}]);assert(urls.every(url=>new URL(url).hostname==='graph.facebook.com'));assert.equal(new URL(urls[1]).searchParams.get('after'),'next');
});
test('conclusão Shopify usa fulfillmentOrders e verifica confirmação',async()=>{
 const operations=[];
 const providers=createProviders({shopifyVersion:'2026-07'},async(_url,options)=>{
  const {query,variables}=JSON.parse(options.body);operations.push({query,variables});
  if(query.includes('fulfillmentCreate'))return Response.json({data:{fulfillmentCreate:{fulfillment:{id:'f',status:'SUCCESS'},userErrors:[]}}});
  if(query.includes('fulfillmentOrders'))return Response.json({data:{order:{fulfillmentOrders:{nodes:[{id:'gid://shopify/FulfillmentOrder/1',status:'OPEN'}],pageInfo:{hasNextPage:false}}}}});
  return Response.json({data:{order:{id:'gid://shopify/Order/1',legacyResourceId:'1',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T01:00:00Z',displayFulfillmentStatus:'FULFILLED',currencyCode:'MZN',lineItems:{nodes:[],pageInfo:{hasNextPage:false}}}}});
 });
 const result=await providers.shopifyStatus('test.myshopify.com','fixture','1','concluido');assert.equal(result.fulfillment_status,'fulfilled');assert.equal(operations[1].variables.input.lineItemsByFulfillmentOrder[0].fulfillmentOrderId,'gid://shopify/FulfillmentOrder/1');
});
test('cancelamento recusado pela Shopify não é tratado como sucesso',async()=>{
 const providers=createProviders({shopifyVersion:'2026-07'},async()=>Response.json({data:{orderCancel:{orderCancelUserErrors:[{message:'denied'}]}}}));
 await assert.rejects(providers.shopifyStatus('test.myshopify.com','fixture','1','cancelado'));
});
test('produtos preservam stock por local sem aceitar locais inválidos',()=>{
 const record={id:'stock_product',nome:'Produto',custo:10,foto:'',locais:[{id:'loc_a',local:'Matola',quantidade:4},{id:'loc_b',local:'Maputo',quantidade:2}]};
 assert.equal(validateRecord('produtos',record),record);
 assert.throws(()=>validateRecord('produtos',{...record,locais:[{id:'loc_a',local:'Matola',quantidade:-1}]}));
 assert.throws(()=>validateRecord('produtos',{...record,locais:[record.locais[0],record.locais[0]]}));
 assert.throws(()=>validateRecord('produtos',{...record,locais:[{id:"bad'",local:'Matola',quantidade:1}]}));
});
test('gastos de vários dias são rateados, com lucro líquido e aviso de custo em falta',()=>{
 const state={vendas:[{id:'sale1',status:'concluido',data:'2026-10-12',produto:'Sem cadastro',quantidade:1,valor:100,comissao:10}],produtos:[],ads:[{id:'ad1',data:'2026-10-10',dataFim:'2026-10-16',tipo:'ads',produto:'',valor:70},{id:'other1',data:'2026-10-01',dataFim:'2026-10-31',nome:'Internet',tipo:'outros',produto:'',valor:31}],operacional:[]};
 const day=calculateMetrics(state,'2026-10-12','2026-10-12');assert.equal(day.ads,10);assert.equal(day.other,1);assert.equal(day.profit,79);assert.equal(day.missingProductCount,1);
 const week=calculateMetrics(state,'2026-10-10','2026-10-16');assert.equal(week.ads,70);assert.equal(week.other,7);
 assert.equal(calculateMetrics(state,'2026-10-17','2026-10-18').ads,0);
 assert.throws(()=>validateRecord('ads',{id:'bad_range',data:'2026-10-12',dataFim:'2026-10-11',tipo:'ads',produto:'',valor:10}));
});

test('recusa da plataforma apresenta HTTP sem expor resposta com segredos',async()=>{
 const providers=createProviders({shopifyId:'client',shopifySecret:'secret'},async()=>Response.json({error:'private-token-do-not-display'},{status:400}));
 await assert.rejects(providers.exchangeShopify('fixture.myshopify.com','code'),error=>error.status===502 && error.message.includes('HTTP 400') && !error.message.includes('private-token'));
});

test('GraphQL distingue erros HTTP 200 sem mostrar mensagens ou valores privados',async()=>{
 const providers=createProviders({shopifyVersion:'2026-07'},async(_url,options)=>JSON.parse(options.body).query.startsWith('query')?Response.json({data:{webhookSubscriptions:{nodes:[],pageInfo:{hasNextPage:false}}}}):Response.json({errors:[{message:'private-token@example.test',extensions:{code:'undefinedField',fieldName:'callbackUrl'},path:['webhookSubscriptionCreate']}] }));
 await assert.rejects(providers.registerWebhooks('fixture.myshopify.com','fixture-token','https://test.example/webhooks/shopify'),error=>error.message.includes('ORDERS_CREATE') && error.message.includes('undefinedField') && error.message.includes('callbackUrl') && !error.message.includes('private-token'));
});
test('GraphQL informa bloqueio de dados protegidos sem expor resposta de cliente',async()=>{
 const providers=createProviders({shopifyVersion:'2026-07'},async()=>Response.json({errors:[{message:'This app is not approved to access the Order object: private@example.test',extensions:{code:'ACCESS_DENIED'},path:['orders']}] }));
 await assert.rejects(providers.shopifyOrdersPage('fixture.myshopify.com','fixture','2026-10-01','2026-10-12'),error=>error.message.includes('dados protegidos') && error.message.includes('orders') && !error.message.includes('private@example'));
});

test('importação usa contacto de entrega sem exigir acesso ao perfil Customer',async()=>{
 const providers=createProviders({shopifyVersion:'2026-07'},async(_url,options)=>{
  const {query}=JSON.parse(options.body);assert(!/customer\s*\{/.test(query));
  return Response.json({data:{orders:{nodes:[{legacyResourceId:'123',createdAt:'2026-10-12T08:00:00Z',updatedAt:'2026-10-12T09:00:00Z',displayFulfillmentStatus:'UNFULFILLED',currencyCode:'MZN',shippingAddress:{name:'Cliente Entrega',phone:'865123456',address1:'Matola',city:'Maputo'},lineItems:{nodes:[{id:'gid://shopify/LineItem/1',title:'Produto',quantity:1,originalUnitPriceSet:{shopMoney:{amount:'100'}},discountAllocations:[]}],pageInfo:{hasNextPage:false}}}],pageInfo:{hasNextPage:false}}}});
 });
 const page=await providers.shopifyOrdersPage('fixture.myshopify.com','fixture','2026-10-01','2026-10-12');
 const rows=shopifyRecords(page.orders[0]);assert.equal(rows[0].contacto,'Cliente Entrega 865123456');assert.equal(rows[0].local,'Matola, Maputo');assert.equal(rows[0].valor,100);
});

test('Meta reconhece datas finais sem confundir números ou campanhas de vários produtos',()=>{
 const products=[{nome:'Selante'},{nome:'Cortador 14 em 1'},{nome:'Mini Batedeira'},{nome:'Mini Chopper'}];
 const campaigns=['Selante 30/07/26','Cortador 14 em 1 31/08/2026','Selante - 2026-10-11','Selante (11/10/26)','MINI BATEDEIRA + MINI CHOPPER 11/10/26','Selante 31/02/26','Super Selante 11/10/26'];
 const rows=campaigns.map((campaign_name,index)=>({campaign_id:String(index),campaign_name,spend:'10',date_start:'2026-10-13'}));
 const result=metaRecords(rows,products,'act_1','MZN');
 assert.deepEqual(result.records.map(row=>row.produto),['Selante','Cortador 14 em 1','Selante','Selante','','','']);
 assert.equal(result.records[0].campaignName,campaigns[0]);assert.equal(result.records[0].valor,10);
 const again=metaRecords(rows,products,'act_1','MZN');assert.deepEqual(again.records.map(row=>row.id),result.records.map(row=>row.id));
 assert.equal(metaRecords(rows,[{nome:'Selante'},{nome:'SELANTE'}],'act_1','MZN').records[0].produto,'');
});

test('nomes associados preservam custos e filtros após renomear sem mudar o histórico',()=>{
 const products=[{id:'cutter',nome:'Cortador 14 em 1',custo:20,aliases:['Cortador de Vegetais 14 em 1']}];
 const sale={id:'legacy',produto:'Cortador de Vegetais 14 em 1',data:'2026-10-13',valor:100,quantidade:2,comissao:5,status:'concluido'};
 const expense={id:'meta_act_1_1_2026-10-13',source:'meta',campaignName:'Cortador 14 em 1 31/08/2026',produto:'',tipo:'ads',data:'2026-10-13',valor:10};
 const state={produtos:products,vendas:[sale],ads:[expense],operacional:[]};const before=structuredClone(state);
 const result=calculateMetrics(state,'2026-10-13','2026-10-13','Cortador 14 em 1');
 assert.equal(result.revenue,100);assert.equal(result.acquisition,40);assert.equal(result.ads,10);assert.equal(result.profit,45);assert.equal(result.missingProductCount,0);assert.deepEqual(state,before);
 assert.equal(shopifyRecords({...order,line_items:[{id:'1',title:sale.produto,price:'100',quantity:1,discount_allocations:[]}]},products)[0].produto,'Cortador 14 em 1');
 validateRecord('produtos',products[0]);assert.throws(()=>validateRecord('produtos',{...products[0],aliases:['']}));
});

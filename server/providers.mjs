import { createHmac } from 'node:crypto';
import { shopDomain } from './security.mjs';
function graphqlDiagnostic(errors,query){
 // Expor apenas códigos e identificadores presentes na consulta estática, nunca a resposta integral.
 const names=new Set([...(query.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []),'callbackUrl','format','uri']);
 return errors.slice(0,3).map(error=>{
  const code=String(error.extensions?.code || 'GRAPHQL_ERROR');
  const safeCode=/^[A-Za-z_]{1,60}$/.test(code)?code:'GRAPHQL_ERROR';
  const fields=[error.extensions?.fieldName,error.extensions?.argumentName,error.extensions?.name,...(Array.isArray(error.path)?error.path:[])].filter(value=>typeof value==='string' && names.has(value));
  const protectedData=/protected customer|not approved to access|customer data/i.test(String(error.message || ''));
  const hint=protectedData?'O aplicativo precisa de autorização para dados protegidos de clientes.':safeCode==='ACCESS_DENIED'?'Verifique os escopos e a autorização da loja.':safeCode==='THROTTLED'?'Aguarde antes de repetir a sincronização.':'';
  return `${safeCode}${fields.length?' · '+[...new Set(fields)].join(', '):''}${hint?' · '+hint:''}`;
 }).join('; ');
}
async function jsonResponse(response, provider,query='') {
  let body;
  try { body=await response.json(); } catch { throw Object.assign(new Error(`${provider}: resposta inválida.`),{status:502}); }
  if(response.ok && Array.isArray(body.errors) && body.errors.length && query)throw Object.assign(new Error(`${provider}: ${graphqlDiagnostic(body.errors,query)}`),{status:502});
  if (!response.ok || body.error || (body.errors && (!Array.isArray(body.errors) || body.errors.length))) throw Object.assign(new Error(`${provider}: pedido recusado (HTTP ${response.status}). Verifique as credenciais do aplicativo, o callback e as permissões.`),{status:502});
  return body;
}
export function createProviders(config, fetcher = fetch) {
  async function shopifyGraphql(shop, token, query, variables={}) {
    return (await jsonResponse(await fetcher(`https://${shopDomain(shop)}/admin/api/${config.shopifyVersion}/graphql.json`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
      body:JSON.stringify({query,variables}), signal:AbortSignal.timeout(30000)
    }),'Shopify',query)).data;
  }
  const fields=`id legacyResourceId createdAt updatedAt cancelledAt displayFulfillmentStatus displayFinancialStatus currencyCode note phone
    shippingAddress { name phone address1 city }
    lineItems(first:100) { nodes { id title quantity originalUnitPriceSet { shopMoney { amount } }
      discountAllocations { allocatedAmountSet { shopMoney { amount } } } } pageInfo { hasNextPage } }`;
  const normalize = order => {
    if (order.lineItems.pageInfo.hasNextPage) throw new Error('Pedido com mais de 100 itens: importação requer paginação adicional.');
    return { id:String(order.legacyResourceId),created_at:order.createdAt,updated_at:order.updatedAt,cancelled_at:order.cancelledAt,
      financial_status:String(order.displayFinancialStatus || '').toLowerCase(),fulfillment_status:order.displayFulfillmentStatus==='FULFILLED' ? 'fulfilled' : 'unfulfilled',currency:order.currencyCode,
      note:order.note,phone:order.phone,customer:{first_name:order.customer?.firstName,last_name:order.customer?.lastName},
      shipping_address:order.shippingAddress,line_items:order.lineItems.nodes.map(item => ({
        id:item.id.split('/').pop(),title:item.title,quantity:item.quantity,price:item.originalUnitPriceSet.shopMoney.amount,
        discount_allocations:item.discountAllocations.map(d=>({amount:d.allocatedAmountSet.shopMoney.amount})) })) };
  };
  async function shopifyOrders(shop,token,since) {
    const orders=[]; let after=null;
    do {
      const data=await shopifyGraphql(shop,token,`query($after:String,$filter:String!) { orders(first:100,after:$after,sortKey:UPDATED_AT,query:$filter) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } }`,{after,filter:`updated_at:>=${since}`});
      orders.push(...data.orders.nodes.map(normalize));
      after=data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
      if (orders.length>10000) throw new Error('Importação excede 10.000 pedidos por execução. Reduza o período.');
    } while(after);
    return orders;
  }
  async function shopifyOrdersPage(shop,token,since,until,after=null){
    const data=await shopifyGraphql(shop,token,`query($after:String,$filter:String!){orders(first:1,after:$after,sortKey:UPDATED_AT,query:$filter){nodes{${fields}}pageInfo{hasNextPage endCursor}}}`,{after,filter:`updated_at:>=${since} updated_at:<=${until}`});
    return {orders:data.orders.nodes.map(normalize),after:data.orders.pageInfo.hasNextPage?data.orders.pageInfo.endCursor:null};
  }
  async function shopifyOrder(shop,token,id) {
    const data=await shopifyGraphql(shop,token,`query($id:ID!){order(id:$id){${fields}}}`,{id:`gid://shopify/Order/${id}`});
    if (!data.order) throw new Error('Pedido não encontrado na Shopify.');
    return normalize(data.order);
  }
  async function shopifyStatus(shop,token,id,status) {
    const orderId=`gid://shopify/Order/${id}`;
    if(status==='cancelado') {
      const data=await shopifyGraphql(shop,token,`mutation($id:ID!){orderCancel(orderId:$id,reason:OTHER,notifyCustomer:false,refund:false,restock:true){job{id done}orderCancelUserErrors{message}}}`,{id:orderId});
      if(data.orderCancel.orderCancelUserErrors.length) throw new Error('A Shopify recusou o cancelamento. Verifique o estado e as permissões do pedido.');
    } else {
      const before=(await shopifyGraphql(shop,token,`query($id:ID!){order(id:$id){cancelledAt displayFulfillmentStatus displayFinancialStatus canMarkAsPaid}}`,{id:orderId})).order;
      if(!before || before.cancelledAt || ['REFUNDED','VOIDED'].includes(before.displayFinancialStatus))throw Object.assign(new Error('Este pedido não pode ser concluído e marcado como pago. Revê o estado na Shopify.'),{status:409});
      const paid=before.displayFinancialStatus==='PAID';
      if(!paid && !before.canMarkAsPaid)throw Object.assign(new Error('A Shopify não permite registar o pagamento deste pedido como recebido. Revê o estado do pagamento na Shopify.'),{status:409});
      if(before.displayFulfillmentStatus!=='FULFILLED'){
        const data=await shopifyGraphql(shop,token,`query($id:ID!){order(id:$id){fulfillmentOrders(first:100){nodes{id status}pageInfo{hasNextPage}}}}`,{id:orderId});
        if(!data.order || data.order.fulfillmentOrders.pageInfo.hasNextPage)throw new Error('Não foi possível obter os pedidos de processamento completos.');
        const items=data.order.fulfillmentOrders.nodes.filter(item=>['OPEN','IN_PROGRESS'].includes(item.status)).map(item=>({fulfillmentOrderId:item.id}));
        if(!items.length)throw new Error('Não há itens disponíveis para concluir na Shopify.');
        const created=await shopifyGraphql(shop,token,`mutation($input:FulfillmentInput!){fulfillmentCreate(fulfillment:$input){fulfillment{id status}userErrors{message}}}`,{input:{lineItemsByFulfillmentOrder:items,notifyCustomer:false}});
        if(created.fulfillmentCreate.userErrors.length || !created.fulfillmentCreate.fulfillment)throw new Error('A Shopify recusou a conclusão. Verifique as permissões de processamento.');
      }
      if(!paid){
        const result=await shopifyGraphql(shop,token,`mutation($input:OrderMarkAsPaidInput!){orderMarkAsPaid(input:$input){order{id displayFinancialStatus}userErrors{field message}}}`,{input:{id:orderId}});
        if(result.orderMarkAsPaid.userErrors.length || !result.orderMarkAsPaid.order)throw new Error('O processamento foi solicitado, mas a Shopify recusou o registo como pago. O painel só conclui após confirmar os dois estados.');
      }
    }
    return shopifyOrder(shop,token,id);
  }
  async function registerWebhooks(shop,token,callbackUrl) {
    const expected=['ORDERS_CREATE','ORDERS_UPDATED','ORDERS_CANCELLED','APP_UNINSTALLED'];
    const existing=new Set();let after=null;
    for(let page=0;page<5;page++){
      const data=await shopifyGraphql(shop,token,`query($after:String){webhookSubscriptions(first:100,after:$after){nodes{topic format endpoint{... on WebhookHttpEndpoint{callbackUrl}}}pageInfo{hasNextPage endCursor}}}`,{after});
      for(const subscription of data.webhookSubscriptions.nodes)if(subscription.endpoint?.callbackUrl===callbackUrl && subscription.format==='JSON')existing.add(subscription.topic);
      if(!data.webhookSubscriptions.pageInfo.hasNextPage)break;
      after=data.webhookSubscriptions.pageInfo.endCursor;
      if(!after || page===4)throw new Error('Não foi possível verificar todos os webhooks existentes. Consulte a configuração da Shopify.');
    }
    for (const topic of expected) {
      if(existing.has(topic))continue;
      let data;try{data=await shopifyGraphql(shop,token,`mutation($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){webhookSubscription{id}userErrors{field message}}}`,{topic,input:{callbackUrl,format:'JSON'}});}catch(error){throw Object.assign(new Error(`Registo de webhook ${topic}: ${error.message}`),{status:error.status || 502});}
      if (data.webhookSubscriptionCreate.userErrors.length){const fields=[...new Set(data.webhookSubscriptionCreate.userErrors.flatMap(error=>error.field || []).filter(field=>['callbackUrl','topic','format','webhookSubscription','uri'].includes(field)))];throw new Error(`A Shopify recusou o webhook ${topic}${fields.length?' ('+fields.join(', ')+')':''}. Verifique a configuração do aplicativo e o endereço HTTPS.`);}
    }
  }
  async function meta(path,token,params={}) {
    const url=new URL(`https://graph.facebook.com/${config.metaVersion}/${path}`);
    url.searchParams.set('access_token',token);
    url.searchParams.set('appsecret_proof',createHmac('sha256',config.metaSecret).update(token).digest('hex'));
    for(const [key,value] of Object.entries(params)) url.searchParams.set(key,typeof value==='object' ? JSON.stringify(value) : String(value));
    return jsonResponse(await fetcher(url,{signal:AbortSignal.timeout(30000)}),'Meta Ads');
  }
  async function metaPages(path,token,params) {
    const rows=[]; let after;
    do {
      const body=await meta(path,token,{...params,...(after ? {after} : {})}); rows.push(...body.data);
      after=body.paging?.next ? body.paging?.cursors?.after : null;
      if (body.paging?.next && !after) throw new Error('Meta Ads: paginação sem cursor.');
      if (rows.length>50000) throw new Error('Meta Ads: período demasiado grande.');
    } while(after);
    return rows;
  }
  async function shopifyProductsPage(shop,token,after=null){const data=await shopifyGraphql(shop,token,'query($after:String){products(first:5,after:$after,sortKey:ID){nodes{legacyResourceId title}pageInfo{hasNextPage endCursor}}}',{after});return {products:data.products.nodes.map(row=>({id:String(row.legacyResourceId),title:row.title})),after:data.products.pageInfo.hasNextPage?data.products.pageInfo.endCursor:null};}
  async function shopifyProductsByIds(shop,token,ids){const data=await shopifyGraphql(shop,token,'query($ids:[ID!]!){nodes(ids:$ids){... on Product {legacyResourceId title}}}',{ids:ids.map(id=>'gid://shopify/Product/'+id)});return data.nodes.filter(Boolean).map(row=>({id:String(row.legacyResourceId),title:row.title}));}
  return {shopifyProductsPage,shopifyProductsByIds, shopifyGraphql,shopifyOrders,shopifyOrdersPage,shopifyOrder,shopifyStatus,registerWebhooks,meta,
    metaAccounts:token=>metaPages('me/adaccounts',token,{fields:'id,name,currency,timezone_name',limit:100}),
    metaInsights:(id,token,since,until)=>metaPages(id+'/insights',token,{fields:'campaign_id,campaign_name,spend,date_start,date_stop',level:'campaign',time_increment:1,time_range:{since,until},limit:500}),
    metaInsightsPage:async(id,token,since,until,after=null)=>{const body=await meta(id+'/insights',token,{fields:'campaign_id,campaign_name,spend,date_start,date_stop',level:'campaign',time_increment:1,time_range:{since,until},limit:5,...(after?{after}:{})});if(body.paging?.next && !body.paging?.cursors?.after)throw new Error('Meta Ads: paginação sem cursor.');return {rows:body.data,after:body.paging?.next?body.paging.cursors.after:null};},
    shopifyIdentity:async(shop,token)=>(await shopifyGraphql(shop,token,'query { shop { id myshopifyDomain } }')).shop,
    exchangeShopify:async(shop,code)=>jsonResponse(await fetcher(`https://${shopDomain(shop)}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:config.shopifyId,client_secret:config.shopifySecret,code}),signal:AbortSignal.timeout(30000)}),'Shopify'),
    exchangeMeta:async(code,redirect)=>{
      const url=new URL(`https://graph.facebook.com/${config.metaVersion}/oauth/access_token`);
      url.search=new URLSearchParams({client_id:config.metaId,client_secret:config.metaSecret,redirect_uri:redirect,code}).toString();
      const short=await jsonResponse(await fetcher(url,{signal:AbortSignal.timeout(30000)}),'Meta Ads');
      url.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:config.metaId,client_secret:config.metaSecret,fb_exchange_token:short.access_token}).toString();
      return jsonResponse(await fetcher(url,{signal:AbortSignal.timeout(30000)}),'Meta Ads');
    }
  };
}

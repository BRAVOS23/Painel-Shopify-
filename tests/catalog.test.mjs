import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedProduct} from '../server/catalog.mjs';
import {manualRecords} from '../web/manual-cleanup.mjs';
import {validateRecord} from '../server/model.mjs';
import {createProviders} from '../server/providers.mjs';
test('vínculo Shopify altera apenas nome e identidade, preservando custo, imagem e stock local',()=>{
 const previous={id:'local',nome:'Cortador 14 em 1',custo:325,foto:'',locais:[{id:'loc',local:'Maputo',quantidade:7}],aliases:['Cortador antigo']};
 const result=linkedProduct(previous,{id:'123',title:'Cortador de Vegetais 14 em 1'},'fixture.myshopify.com');
 assert.equal(result.id,'local');assert.equal(result.custo,325);assert.deepEqual(result.locais,previous.locais);assert.deepEqual(result.aliases,['Cortador antigo','Cortador 14 em 1']);assert.equal(result.shopifyProductId,'123');validateRecord('produtos',result);
 const created=linkedProduct(null,{id:'456',title:'Novo produto'},'fixture.myshopify.com');assert.equal(created.costConfigured,false);assert.deepEqual(created.locais,[]);validateRecord('produtos',created);
});
test('prévia da limpeza preserva integrações, produtos e stock',()=>{
 const state={vendas:[{id:'manual'},{id:'sh_1_2'},{id:'csv',shopifyOrderId:'1'},{id:'old',fonte:'04.SHOPIFY'}],ads:[{id:'manual_ad'},{id:'meta_1'},{id:'external',accountId:'act_1',campaignId:'1'}],operacional:[{id:'loja'}],produtos:[{id:'product',locais:[{quantidade:7}]}],fluxo:[{id:'cash'}]};const original=structuredClone(state),plan=manualRecords(state);assert.deepEqual(plan.vendas.map(row=>row.id),['manual']);assert.deepEqual(plan.ads.map(row=>row.id),['manual_ad']);assert.equal(plan.operacional.length,1);assert(!('produtos' in plan));assert(!('fluxo' in plan));assert.deepEqual(state,original);
});
test('consulta de produtos Shopify é paginada e não pede nem altera inventário',async()=>{
 const calls=[];const providers=createProviders({shopifyVersion:'2026-07'},async(_url,options)=>{calls.push(JSON.parse(options.body));return Response.json({data:JSON.parse(options.body).query.includes('products(first')?{products:{nodes:[{legacyResourceId:'123',title:'Produto'}],pageInfo:{hasNextPage:true,endCursor:'next'}}}:{nodes:[{legacyResourceId:'123',title:'Produto'}]}});});
 assert.deepEqual(await providers.shopifyProductsPage('fixture.myshopify.com','fixture'),{products:[{id:'123',title:'Produto'}],after:'next'});await providers.shopifyProductsByIds('fixture.myshopify.com','fixture',['123']);assert(calls.every(call=>!/(inventory|stock|mutation|quantity)/i.test(call.query)));assert.deepEqual(calls[1].variables.ids,['gid://shopify/Product/123']);
});

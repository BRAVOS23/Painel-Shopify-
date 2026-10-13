export const normalizeProduct=value=>String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
export function productResolver(products){
 const names=new Map();
 for(const product of products){for(const name of [product.nome,...(product.aliases || [])]){const key=normalizeProduct(name);if(!key)continue;if(!names.has(key))names.set(key,new Map());names.get(key).set(product.id || product.nome,product.nome);}}
 return value=>{const matches=names.get(normalizeProduct(value));return matches?.size===1?[...matches.values()][0]:String(value || '').trim();};
}
function campaignProductName(value){
 const text=String(value || '').trim();
 // Apenas uma data final: não remover números do produto nem nomes de outros produtos.
 const match=text.match(/^(.*?)\s+(?:[-–—|]\s*)?[([]?((?:\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))|(?:\d{4}-\d{2}-\d{2}))[)\]]?$/);
 if(!match)return text;
 const parts=match[2].split(/[/.\-]/).map(Number);
 let [day,month,year]=parts;if(parts[0]>999)[year,month,day]=parts;else if(year<100)year+=2000;
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)return text;
 return match[1].trim();
}
export function metaProductResolver(products){
 const names=new Map();for(const product of products)for(const value of [product.nome,...(product.aliases || [])]){const key=normalizeProduct(value);if(!names.has(key))names.set(key,new Set());names.get(key).add(product.nome);}
 return value=>{const exact=normalizeProduct(value),key=names.has(exact)?exact:normalizeProduct(campaignProductName(value));const choices=names.get(key);return choices?.size===1?[...choices][0]:'';};
}
export function effectiveExpenseProduct(record,products){return (record.source==='meta'?metaProductResolver(products)(record.campaignName):'') || productResolver(products)(record.produto);}

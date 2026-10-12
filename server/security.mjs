import {Buffer} from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
export function shopDomain(input) {
  const shop = String(input || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw Object.assign(new Error('Use apenas o domínio original da loja: nome.myshopify.com, sem https:// ou /admin. Encontra-o nas definições de domínios da Shopify.'),{status:400});
  return shop;
}
export function encrypt(value, key) {
  const bytes = Buffer.from(key || '', 'base64');
  if (bytes.length !== 32) throw new Error('A chave de proteção das integrações não foi configurada.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', bytes, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function decrypt(value, key) {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString());
}
export function sameSignature(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}
export function validWebhook(body, signature, secret) {
  return Boolean(secret) && sameSignature(createHmac('sha256', secret).update(body).digest('base64'), signature);
}
export function validShopifyOAuth(params, secret) {
  const signed = [...params.entries()].filter(([key]) => !['hmac', 'signature'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
  return Boolean(secret) && sameSignature(createHmac('sha256', secret).update(signed).digest('hex'), params.get('hmac'));
}
export function publicConnection(connection) {
  if (!connection) return { connected: false };
  return { connected: true, shop: connection.shop || null, accountId: connection.accountId || null,
    currency: connection.currency || null, lastSync: connection.lastSync || null,
    lastError: connection.lastError || null, unmatchedCampaigns: connection.unmatchedCampaigns || [],
    statusWriteEnabled: true };
}
export function safeId(id) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(id))) throw new Error('Identificador inválido.');
  return id;
}

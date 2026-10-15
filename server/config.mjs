import {commercialConfig} from './access.mjs';
import {existsSync} from 'node:fs';
if(existsSync('.env')) process.loadEnvFile('.env');
export const config={
  ...commercialConfig(process.env),
  emulators:process.env.USE_FIREBASE_EMULATORS==='true',
  projectId:process.env.FIREBASE_PROJECT_ID || 'demo-painel',webApiKey:process.env.FIREBASE_WEB_API_KEY || 'demo-key',
  authDomain:process.env.FIREBASE_AUTH_DOMAIN || 'demo-painel.firebaseapp.com',
  baseUrl:(process.env.APP_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/,''),
  encryptionKey:process.env.INTEGRATION_ENCRYPTION_KEY || '',shopifyId:process.env.SHOPIFY_CLIENT_ID || '',
  shopifySecret:process.env.SHOPIFY_CLIENT_SECRET || '',shopifyVersion:process.env.SHOPIFY_API_VERSION || '2026-07',
  metaId:process.env.META_APP_ID || '',metaSecret:process.env.META_APP_SECRET || '',metaVersion:process.env.META_API_VERSION || 'v24.0',
  port:Number(process.env.PORT || 3000),syncInterval:Number(process.env.SYNC_INTERVAL_MS || 900000)
};
if(!config.emulators && (config.projectId.startsWith('demo-') || !process.env.FIREBASE_WEB_API_KEY || !config.baseUrl.startsWith('https://'))) throw new Error('Produção precisa de projeto Firebase real, configuração web e APP_BASE_URL HTTPS. Use npm run dev para os emuladores.');
if(config.emulators) {
  if(!config.projectId.startsWith('demo-')) throw new Error('Use um projeto demo- para desenvolvimento isolado.');
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'; process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
} else if(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Remova os endereços dos emuladores antes de executar em produção.');
if(config.encryptionKey && Buffer.from(config.encryptionKey,'base64').length!==32) throw new Error('INTEGRATION_ENCRYPTION_KEY deve ter 32 bytes em base64.');

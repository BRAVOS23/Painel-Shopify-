const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

initializeApp();
const db = getFirestore();

/**
 * Primeiro login de um utilizador: se ele ainda não pertence a nenhum negócio, cria um novo
 * negócio com ele como "owner". Isto NÃO pode ser feito por uma escrita direta do cliente no
 * Firestore — firestore.rules nega "create" em businesses/* e no primeiro membro de cada negócio
 * de propósito, para que ninguém possa se auto-nomear dono de um negócio alheio só adivinhando o
 * businessId. O Admin SDK aqui ignora as regras de segurança, então a validação de "isto é
 * legítimo" tem de acontecer neste código, não nas rules.
 *
 * Idempotente: se o utilizador já for membro de um negócio, devolve esse negócio em vez de criar
 * outro (protege contra cliques duplos / reconexões).
 */
exports.bootstrapBusinessForUser = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'É preciso iniciar sessão primeiro.');
  }

  const existing = await db
    .collectionGroup('members')
    .where('uid', '==', uid)
    .limit(1)
    .get();

  if (!existing.empty) {
    const memberDoc = existing.docs[0];
    const businessId = memberDoc.ref.parent.parent.id;
    return { businessId, criado: false };
  }

  const businessRef = db.collection('businesses').doc();
  const nome = (request.data && request.data.nomeNegocio) || 'Meu negócio';

  await db.runTransaction(async (tx) => {
    tx.set(businessRef, {
      nome,
      donoUid: uid,
      criadoEm: FieldValue.serverTimestamp()
    });
    tx.set(businessRef.collection('members').doc(uid), {
      uid,
      role: 'owner',
      addedAt: FieldValue.serverTimestamp()
    });
  });

  return { businessId: businessRef.id, criado: true };
});

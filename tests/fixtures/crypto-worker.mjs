import {encrypt,decrypt} from '../../server/security.mjs';
import {randomBytes} from 'node:crypto';
export default {fetch(){
 try{
  const key=randomBytes(32).toString('base64'),value={token:'synthetic-token',label:'Autorização Moçambique'},encrypted=encrypt(value,key);
  const decoded=decrypt(encrypted,key);
  let tamperRejected=false;try{decrypt({...encrypted,tag:randomBytes(16).toString('base64')},key);}catch{tamperRejected=true;}
  return Response.json({roundTrip:JSON.stringify(decoded)===JSON.stringify(value),tamperRejected,secretHidden:!JSON.stringify(encrypted).includes(value.token)});
 }catch{return Response.json({error:'Teste de cifragem falhou.'},{status:500});}
}};

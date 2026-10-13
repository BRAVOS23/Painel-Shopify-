let deferred=null,refresh=()=>{};
const installed=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;refresh();});
window.addEventListener('appinstalled',()=>{deferred=null;refresh();});
export function initInstallationUi(parent){
 const card=document.createElement('section');card.className='install-card';card.innerHTML='<h3>A app no teu telemóvel</h3><p>Abre o painel diretamente pelo ícone no ecrã inicial. Usa a mesma conta e os mesmos dados.</p><button type="button" class="btn-primary" id="installApp">Instalar app</button><p id="installStatus" role="status"></p><details id="installInstructions"><summary>Como instalar manualmente</summary><p><strong>Android:</strong> abre este painel no Chrome. No menu ⋮, escolhe “Instalar aplicação” ou “Adicionar ao ecrã inicial”.</p><p><strong>iPhone:</strong> abre no Safari, toca em Partilhar e escolhe “Adicionar ao ecrã principal”.</p><p>No computador, procura o ícone de instalação na barra de endereço. Se abriste um link dentro de outra app, abre-o primeiro no Chrome ou Safari.</p></details><small>Precisas de internet para consultar e guardar os dados do negócio.</small>';
 parent.querySelector('.account-identity').after(card);
 const button=card.querySelector('button'),status=card.querySelector('#installStatus'),instructions=card.querySelector('details');
 refresh=()=>{const done=installed();button.hidden=done;button.textContent=deferred?'Instalar app':'Ver como instalar';status.textContent=done?'Estás a usar a app instalada.':'';instructions.hidden=done;};
 button.onclick=async()=>{if(!deferred){instructions.open=true;return;}const event=deferred;deferred=null;button.disabled=true;try{await event.prompt();const choice=await event.userChoice;refresh();status.textContent=choice.outcome==='accepted'?'Instalação solicitada. Segue as instruções do navegador.':'Podes instalar mais tarde pelo menu do navegador.';}catch{refresh();instructions.open=true;status.textContent='Segue as instruções de instalação abaixo.';}finally{button.disabled=false;}};
 window.matchMedia('(display-mode: standalone)').addEventListener('change',refresh);refresh();
}

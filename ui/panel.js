'use strict';
const bridge=new(require('tera-mod-ui').Renderer)(),$=id=>document.getElementById(id);let state=null,displayedId=null;const t=window.UIText.t;
function action(name,data={}){bridge.send('action',name,data);}
function image(element,url){element.hidden=!url;if(url)element.src=url;else element.removeAttribute('src');}
function results(){
    const preview=state&&state.preview;$('result').hidden=!preview;if(!preview)return;const single=preview.mode==='appearance';$('box-id').hidden=single;$('only-mine').parentElement.hidden=single;$('count').hidden=single;
    $('box-name').textContent=preview.box.name;$('box-id').textContent=(preview.identification&&!preview.identification.exactId?t('IDs com conteúdo equivalente: {ids}',{ids:preview.identification.ids.join(', ')}):'ID '+preview.box.id)+' · '+t(preview.kind);image($('box-icon'),preview.box.icon);
    $('description').textContent=preview.box.description;$('source-note').textContent=t(preview.message)+(preview.unsupported?' '+t('Há {count} regra(s) não interpretada(s); a lista pode estar incompleta.',{count:preview.unsupported}):'');
    $('only-mine').disabled=!state.context.identity;
    const items=preview.entries.filter(entry=>single||!$('only-mine').checked||entry.compatible!==false);$('count').textContent=t('{count} de {total} variantes',{count:items.length,total:preview.entries.length});$('items').textContent='';
    if(!items.length){const text=document.createElement('p');text.textContent=t(preview.entries.length?'Nenhuma variante compatível indicada.':'Conteúdo não fornecido em uma estrutura suportada pelo cliente.');$('items').appendChild(text);}
    for(const item of items){const card=document.createElement('article');card.className='item'+(item.compatible===true?' compatible':'');const icon=document.createElement('img');icon.width=48;icon.height=48;icon.alt=t('Ícone de {name}',{name:item.name});image(icon,item.icon);
        const body=document.createElement('div'),title=document.createElement('h3'),detail=document.createElement('p'),rule=document.createElement('p');title.textContent=item.name;detail.hidden=single;detail.textContent='ID '+item.id+(item.amount===null?'':' · '+t('Quantidade: {count}',{count:item.amount}));rule.textContent=window.UIText.conditions(item)+(item.compatible===true?' · '+t('Compatível'):item.compatible===false?' · '+t('Outra raça/gênero/classe'):'');body.append(title,detail,rule);
        if(item.description){const desc=document.createElement('p');desc.className='item-description';desc.textContent=item.description;body.appendChild(desc);}if(!item.icon){const unavailable=document.createElement('span');unavailable.className='missing-icon';unavailable.textContent=t('Ícone indisponível');body.appendChild(unavailable);}card.append(icon,body);const eye=window.TryOnButton.create(item,state,action);if(eye)card.append(eye);$('items').appendChild(card);
    }
}
bridge.on('state',value=>{
    state=value;window.UIText.select(value,action);window.UIText.inputs(value,action);$('version').textContent='v'+value.version;$('server').textContent=t(value.context.server)+' · '+t('Cliente {patch}',{patch:value.context.patch});$('character').textContent=value.context.character||t('Sem personagem identificado');
    $('status').textContent=t(value.busy?'Consultando dados do cliente…':value.tryOnError||value.error|| (value.preview?(value.preview.complete?'Prévia disponível.':'Prévia limitada aos dados disponíveis.'):'Informe um ID ou selecione uma caixa.'));$('status').className=(value.tryOnError||value.error)?'error':'';
    $('show').disabled=$('refresh').disabled=$('inventory').disabled=$('source').disabled=value.busy;
    $('capture-status').textContent=t(value.capture&&value.capture.message||'');
    $('pointer-status').textContent=t(value.pointer&&value.pointer.message||'');
    $('source').textContent='';for(const source of value.sources||[]){const option=document.createElement('option');option.value=source.id;option.textContent=t(source.label)+' ('+t('{count} itens recebidos',{count:source.count})+')';$('source').appendChild(option);}$('source').value=value.source||'inventory';
    const previous=$('inventory').value;$('inventory').textContent='';const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=value.boxes.length?t('Selecione uma caixa/conversão ({count})',{count:value.boxes.length}):t('Nenhuma conversão recebida. Use o ID ou atualize a lista.');$('inventory').appendChild(placeholder);
    for(const box of value.boxes){const option=document.createElement('option');option.value=String(box.id);option.textContent=box.name+' — '+box.id;$('inventory').appendChild(option);}
    if(value.boxes.some(box=>String(box.id)===previous))$('inventory').value=previous;
    if(value.preview){if(displayedId!==value.preview.box.id)$('item-id').value=value.preview.box.id;displayedId=value.preview.box.id;}else displayedId=null;results();
});
$('search').onsubmit=event=>{event.preventDefault();action('preview',{id:Number($('item-id').value)});};$('inventory').onchange=()=>{if($('inventory').value)action('preview',{id:Number($('inventory').value)});};$('source').onchange=()=>action('source',{source:$('source').value});$('refresh').onclick=()=>action('refresh');$('only-mine').onchange=results;window.onbeforeunload=()=>bridge.destructor();bridge.send('ready');

'use strict';
window.UIText=(()=>{
    const Locale=require('../lib/i18n'),texts=[],attributes=[];let language='pt',applied=false;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){if(['SCRIPT','STYLE'].includes(node.parentElement.tagName))continue;const text=node.textContent.trim();if(text)texts.push({node,text,prefix:node.textContent.match(/^\s*/)[0],suffix:node.textContent.match(/\s*$/)[0]});}
    for(const element of document.querySelectorAll('*'))for(const key of ['aria-label','alt','title','placeholder'])if(element.hasAttribute(key))attributes.push({element,key,text:element.getAttribute(key)});
    const t=(key,params)=>params?Locale.t(language,key,params):Locale.translate(language,key);
    function apply(value){const next=Locale.normalize(value)||'en';if(applied&&language===next)return;language=next;applied=true;document.documentElement.lang={pt:'pt-BR',en:'en',es:'es-419'}[language];for(const entry of texts)if(entry.node.isConnected)entry.node.textContent=entry.prefix+t(entry.text)+entry.suffix;for(const entry of attributes)if(entry.element.isConnected)entry.element.setAttribute(entry.key,t(entry.text));document.title=document.getElementById('full')?t('Conteúdo da caixa'):'Box Preview';}
    function select(state,send){apply(state.language);const select=document.getElementById('language');if(!select)return;const selected=state.languagePreference||'auto';if(select.value!==selected)select.value=selected;if(select.disabled)select.disabled=false;const status=document.getElementById('language-status');if(status){const message=t(state.languageError||'');if(status.textContent!==message)status.textContent=message;status.hidden=!state.languageError;}const automatic=document.getElementById('language-auto'),caption=t('Automático: {language}',{language:Locale.names[state.language]});if(automatic.textContent!==caption)automatic.textContent=caption;select.onchange=()=>{select.disabled=true;send('language',{language:select.value});};}
    return {t,apply,select,conditions:entry=>Locale.conditions(language,entry)};
})();

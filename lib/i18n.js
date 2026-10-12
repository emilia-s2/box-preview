'use strict';
const rows=require('./locales.json'), dictionary=new Map(rows.map(row=>[row[0],row]));
const languages=['pt','en','es'],names={pt:'Português',en:'English',es:'Español (Latinoamérica)'};
function normalize(value){const code=String(value||'').trim().toLowerCase().split(/[-_]/)[0];return languages.includes(code)?code:null;}
function preference(value){return normalize(value)||'auto';}
function resolve(mod){
    const selected=preference(mod&&mod.settings&&mod.settings.language);if(selected!=='auto')return selected;
    try{const app=require('electron').app;if(app&&app.isReady()){const locale=app.getLocale();if(locale)return normalize(locale)||'en';}}catch(_){}
    try{const locale=Intl.DateTimeFormat().resolvedOptions().locale;if(locale)return normalize(locale)||'en';}catch(_){}
    return normalize(mod&&mod.game&&mod.game.language)||'en';
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=rows.filter(row=>/\{\w+\}/.test(row[0])).map(row=>{
    const keys=[];let end=0,pattern='';row[0].replace(/\{(\w+)\}/g,(token,key,offset)=>{pattern+=escape(row[0].slice(end,offset))+'(.+?)';keys.push(key);end=offset+token.length;});
    return {key:row[0],keys,regex:new RegExp('^'+pattern+escape(row[0].slice(end))+'$')};
});
function t(language,key,params={}){const row=dictionary.get(key),text=row?row[languages.indexOf(normalize(language)||'en')]:String(key||'');return text.replace(/\{(\w+)\}/g,(token,name)=>Object.prototype.hasOwnProperty.call(params,name)?String(['error','source'].includes(name)?translate(language,params[name]):params[name]):token);}
function translate(language,value){const text=String(value||'');if(dictionary.has(text))return t(language,text);for(const pattern of patterns){const match=pattern.regex.exec(text);if(match){const params={};pattern.keys.forEach((key,index)=>params[key]=match[index+1]);return t(language,pattern.key,params);}}
    const separator=' Consulta ao catálogo do Asura: ',at=text.indexOf(separator);if(at>=0)return translate(language,text.slice(0,at))+' '+t(language,'Consulta ao catálogo do Asura: {error}',{error:text.slice(at+separator.length)});return text;
}
function conditions(language,entry){return String(entry.conditions||'').split(' · ').map(value=>translate(language,value)).join(' · ');}
module.exports={normalize,preference,resolve,t,translate,conditions,names,rows};

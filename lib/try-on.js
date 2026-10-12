'use strict';
const Content=require('./content');
const CATEGORIES=new Set(['style_body','style_head','style_face','style_back','style_weapon','style_footprint','underwear']);
function eligible(entry,character){
    const weapon=entry&&entry.equipType==='EQUIP_STYLE_WEAPON';
    const knownClass=entry&&[entry.rule&&entry.rule.class,entry.restrictions&&entry.restrictions.class].some(value=>value&&!['all','any','none'].includes(value));
    return !!(entry&&Content.number(entry.id)&&Content.number(entry.lookId)&&(CATEGORIES.has(entry.category)||(weapon&&knownClass))&&entry.compatible===true&&character&&Content.compatible(entry.rule||{},character)===true&&Content.compatible(entry.restrictions||{},character)===true);
}
function supported(mod){try{return typeof mod.toClient==='function'&&mod.dispatch.resolve('S_PREVIEW_ITEM',1).definition.writeable!==false;}catch(_){return false;}}
function packet(entry){
    // model/dye/text are instance overrides, not ItemData.linkLookInfoId.
    // Zero keeps the template's original appearance. No owned item UID is needed.
    return {items:[{uid:0n,item:entry.id,model:0,dye:0,text:''}]};
}
function send(mod,entry){const result=mod.toClient('S_PREVIEW_ITEM',1,packet(entry));if(result===false)throw Error('Não foi possível abrir o provador do cliente.');}
module.exports={eligible,supported,packet,send};

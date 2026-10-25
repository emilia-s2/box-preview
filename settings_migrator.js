'use strict';
const Locale=require('./lib/i18n');
// Toolbox invokes this for new installations and schema 1 -> 2 updates.
// Preserve personal fields and explicit true/false choices.
module.exports=function migrate(from,to,settings){
 if(to!==2||from!=null&&![0,1,2].includes(from))throw Error('Versão de configuração não suportada.');
 const data=settings&&typeof settings==='object'&&!Array.isArray(settings)?{...settings}:{};
 data.language=Locale.preference(data.language);
 if(typeof data.openWithMiddleMouse!=='boolean')data.openWithMiddleMouse=true;
 return data;
};

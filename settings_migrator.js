'use strict';
module.exports=function migrate(from,to,settings){if(to!==1)throw Error('Versão de configuração não suportada.');const data=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{};return {...data,language:require('./lib/i18n').preference(data.language)};};

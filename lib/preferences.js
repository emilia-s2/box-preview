'use strict';
const fs=require('fs'),path=require('path'),migrate=require('../settings_migrator');
const VERSION=2,RESTART='Reinicie o Toolbox para carregar a atualização e habilitar esta opção.';
function ready(mod){return !mod.parent||mod.parent.settingsVersion===VERSION;}
function read(root){const file=path.join(root,'config.json');if(!fs.existsSync(file))return {version:VERSION,data:{}};if(fs.statSync(file).size>65536)throw Error('config.json excede o limite.');const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));if(!value||![1,VERSION].includes(value.version))throw Error('Versão de configuração não suportada.');if(!value.data||typeof value.data!=='object'||Array.isArray(value.data))throw Error('config.json precisa ter um objeto data válido.');return value;}
function write(root,value){const file=path.join(root,'config.json'),temporary=file+'.preferences-'+process.pid+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n','utf8');fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
function middleMouse(settings){return !!(settings&&settings.openWithMiddleMouse===true);}
function merged(mod,config,change={}){return migrate(config.version,VERSION,{...config.data,...mod.settings,...change});}
function initialize(mod,root){try{if(!ready(mod))throw Error(RESTART);const value=read(root),data=merged(mod,value);if(!fs.existsSync(path.join(root,'config.json'))||value.version!==VERSION||JSON.stringify(value.data)!==JSON.stringify(data))write(root,{...value,version:VERSION,data});mod.settings={...data};return '';}catch(e){return 'Não foi possível salvar as preferências: '+String(e.message||e);}}
function save(mod,root,change){if(!ready(mod))throw Error(RESTART);const config=read(root),data=merged(mod,config,change);write(root,{...config,version:VERSION,data});mod.settings={...data};}
function set(mod,root,value){if(value!=='auto'&&!['pt','en','es'].includes(value))throw Error('Idioma inválido. Use auto, pt, en ou es.');save(mod,root,{language:value});}
function setMiddleMouse(mod,root,value){if(typeof value!=='boolean')throw Error('Opção do Scroll inválida.');save(mod,root,{openWithMiddleMouse:value});}
module.exports={VERSION,RESTART,ready,read,write,initialize,set,middleMouse,setMiddleMouse};

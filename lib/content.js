'use strict';
const number=value=>['number','string'].includes(typeof value)&&Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=2147483647?Number(value):null;
// UserData template pairs: 101/102 human, 103/104 high elf,
// 105/106 aman, 107/108 castanic, 109/110 popori/elin, 111 baraka.
const races=['human','highelf','aman','castanic','popori','baraka'];
const classes=['warrior','lancer','slayer','berserker','sorcerer','archer','priest','elementalist','soulless','engineer','fighter','assassin','glaiver'];
const raceNames={human:'Humano',castanic:'Castanic',aman:'Aman',highelf:'Elfo alto',popori:'Popori/Elin',baraka:'Baraka'};
function normalized(value){const code=String(value||'').trim().toLowerCase().replace(/[\s_-]/g,'');return {elin:'popori',reaper:'soulless',gunner:'engineer',brawler:'fighter',ninja:'assassin',valkyrie:'glaiver',mystic:'elementalist'}[code]||code;}
function identity(templateId){const id=Number(templateId),code=Math.floor((id%10000)/100),job=id%100;if(!Number.isInteger(id)||id<10000||id>99999||code<1||code>12||job<1||job>13)return null;return {race:races[Math.floor((code-1)/2)],gender:(code-1)%2?'female':'male',class:classes[job-1]};}
function compatible(rule,character){if(!character)return null;for(const field of ['race','gender','class'])if(rule[field]&&!['all','any','none'].includes(normalized(rule[field]))&&normalized(rule[field])!==normalized(character[field]))return false;return true;}
function conditions(a){return {race:normalized(a.race)||null,gender:normalized(a.gender)||null,class:normalized(a.class)||null};}
function describe(rule){const values=[];if(rule.race)values.push(raceNames[rule.race]||rule.race);if(rule.gender)values.push(rule.gender==='female'?'feminino':rule.gender==='male'?'masculino':rule.gender);if(rule.class)values.push(rule.class);return values.join(' · ')||'Sem restrição indicada';}
function cleanText(value){return String(value||'').replace(/\$BR|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').slice(0,6000);}
function parseConversions(rows){
    if(!Array.isArray(rows))throw Error('Resposta de conversão inesperada do cliente.');
    const results=[],seen=new Set();let unsupported=0;
    for(const row of rows){
        if(!row||row.name!=='SeedItem'||!row.attributes||!Array.isArray(row.children))throw Error('Estrutura de ItemConversion não reconhecida.');
        for(const child of row.children){
            if(!child||child.name!=='FixedItem'){unsupported++;continue;}
            const a=child.attributes||{},id=number(a.templateId);if(!id)throw Error('Item de conteúdo inválido no DataCenter.');
            const rule=conditions(a),amount=number(a.amount===undefined?(a.count===undefined?1:a.count):a.amount);if(!amount)throw Error('Quantidade de conteúdo inválida.');
            const key=JSON.stringify([id,amount,rule]);if(seen.has(key))continue;seen.add(key);results.push({id,amount,rule});
            if(results.length>256)throw Error('A caixa excede 256 variantes; a prévia foi interrompida.');
        }
    }
    return {results,unsupported,complete:unsupported===0};
}
module.exports={number,identity,compatible,conditions,describe,cleanText,parseConversions};

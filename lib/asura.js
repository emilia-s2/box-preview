'use strict';
const https=require('https'),Content=require('./content'),{normalize}=require('./title');
const isAsura=server=>/\basura\b/i.test(String(server||''));
function parse(html,id,name){
    if(typeof html!=='string'||html.length>2000000)throw Error('Página do catálogo maior que o permitido.');
    let item=null,visited=0;
    function visit(value){
        if(!value||typeof value!=='object'||++visited>30000)return;
        if(value.id===id&&Array.isArray(value.contain)&&value.name&&typeof value.name==='object')item=value;
        if(Array.isArray(value))for(const entry of value)visit(entry);
        else for(const key of ['item','children'])visit(value[key]);
    }
    for(const script of html.matchAll(/<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)){
        let payload;try{payload=JSON.parse(script[1]);}catch(_){continue;}
        if(payload[0]!==1||typeof payload[1]!=='string')continue;
        for(const line of payload[1].split('\n')){const at=line.indexOf(':');if(at<0)continue;try{visit(JSON.parse(line.slice(at+1)));}catch(_){} }
    }
    if(!item||!Object.values(item.name).some(text=>typeof text==='string'&&normalize(text)===normalize(name)))throw Error('O catálogo não confirmou o ID e o nome recebido do cliente.');
    if(item.contain.length>256)throw Error('O catálogo excede 256 variantes.');
    const seen=new Set(),entries=[];
    for(const entry of item.contain){
        const entryId=Content.number(entry.id);if(!entryId||entryId===id||seen.has(entryId)||!entry.name||typeof entry.name!=='object')throw Error('Conteúdo do catálogo não reconhecido.');
        seen.add(entryId);const names=Object.values(entry.name).filter(text=>typeof text==='string').map(Content.cleanText);if(!names.length)throw Error('Nome de conteúdo ausente no catálogo.');
        const icon=typeof entry.icon==='string'&&/^\/static\/images\/tera-icons\/[a-z0-9_/-]+\.png$/i.test(entry.icon)?'https://tera-asura.com'+entry.icon:null;
        entries.push({id:entryId,names,icon});
    }
    return {id,entries,url:'https://tera-asura.com/en/item/'+id};
}
class Asura {
    constructor({request=https.get,timeout=10000}={}){this.request=request;this.timeout=timeout;this.requests=new Set();this.closed=false;this.cache=new Map();}
    async contents(id,name,server){
        if(!isAsura(server))return null;if(this.closed)throw Error('A conexão do catálogo foi encerrada.');
        const key=id+':'+normalize(name);if(this.cache.has(key))return this.cache.get(key);
        if(this.requests.size>=3)throw Error('Aguarde as consultas pendentes do catálogo.');
        const html=await new Promise((resolve,reject)=>{
            let settled=false,timer,request;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);this.requests.delete(request);if(error){if(request)request.destroy();reject(error);}else resolve(value);};
            try{request=this.request('https://tera-asura.com/en/item/'+id,{headers:{'Accept':'text/html','User-Agent':'TERA-Box-Preview/0.2.14'}},response=>{
                if(response.statusCode!==200){response.resume();finish(Error('O catálogo respondeu HTTP '+response.statusCode+'.'));return;}
                let text='',size=0;response.setEncoding('utf8');response.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>2000000)finish(Error('Página do catálogo maior que o permitido.'));else text+=chunk;});response.on('end',()=>finish(null,text));response.on('error',finish);
            });this.requests.add(request);request.on('error',finish);timer=setTimeout(()=>finish(Error('Tempo de consulta do catálogo encerrado.')),this.timeout);}catch(e){finish(e);}
        });
        if(this.closed)throw Error('A conexão do catálogo foi encerrada.');
        const result=parse(html,id,name);this.cache.set(key,result);if(this.cache.size>32)this.cache.delete(this.cache.keys().next().value);return result;
    }
    reset(){this.cache.clear();}
    close(){this.closed=true;for(const request of this.requests)request.destroy(Error('A conexão do catálogo foi encerrada.'));this.requests.clear();this.reset();}
}
module.exports={Asura,parse,isAsura};

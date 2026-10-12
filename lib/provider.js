'use strict';
const Content=require('./content');
const ITEM_FIELDS=['id','icon','rareGrade','category','combatItemType','requiredRace','requiredGender','requiredClass','linkLookInfoId'];
class Provider {
    constructor(query,{timeout=8000,icons=()=>null,server=()=>'',asura=null}={}){this.query=query;this.timeout=timeout;this.icons=icons;this.server=server;this.asura=asura;this.items=new Map();this.boxes=new Map();this.closed=false;this.pending=0;}
    async ask(path,args,all=true,children=false,fields=null){
        if(this.closed)throw Error('A conexão do cliente foi encerrada.');
        if(this.pending>=6)throw Error('Aguarde as consultas pendentes do cliente antes de tentar novamente.');
        this.pending++;
        const operation=Promise.resolve().then(()=>this.query(path,args,all,children,fields)).then(value=>{this.pending--;if(this.closed)throw Error('A conexão do cliente foi encerrada.');return value;},error=>{this.pending--;throw error;});
        let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('O cliente não respondeu à consulta em tempo hábil.')),this.timeout);})]);}finally{clearTimeout(timer);}
    }
    async metadata(ids){
        ids=[...new Set(ids.map(Content.number).filter(Boolean))];const missing=ids.filter(id=>!this.items.has(id));
        if(missing.length){
            const [data,strings]=await Promise.all([this.ask('/ItemData/Item@id=?/',[missing],true,false,ITEM_FIELDS),this.ask('/StrSheet_Item/String@id=?/',[missing],true,false,['id','string','toolTip'])]);
            if(!Array.isArray(data)||!Array.isArray(strings))throw Error('Dados de itens não reconhecidos.');
            const names=new Map(strings.map(n=>[Content.number(n.attributes&&n.attributes.id),n.attributes]));
            for(const node of data){const a=node.attributes||{},id=Content.number(a.id);if(!id)continue;const text=names.get(id)||{};const ref=String(a.icon||'').toLowerCase();this.items.set(id,{id,name:Content.cleanText(text.string)||'Item '+id,description:Content.cleanText(text.toolTip),category:String(a.category||''),equipType:String(a.combatItemType||''),lookId:Content.number(a.linkLookInfoId),grade:Number(a.rareGrade)||0,icon:this.icons(ref),iconReference:ref,restrictions:Content.conditions({race:a.requiredRace,gender:a.requiredGender,class:a.requiredClass})});}
            if(this.items.size>5000){const keep=new Set(ids);for(const id of this.items.keys())if(!keep.has(id)){this.items.delete(id);if(this.items.size<=3000)break;}}
        }
        return ids.map(id=>this.items.get(id)||{id,name:'Item '+id,description:'Nome não fornecido pelo cliente.',icon:null,category:'',grade:0});
    }
    async preview(id,character){
        id=Content.number(id);if(!id)throw Error('Informe um ID de item válido.');
        let conversion=this.boxes.get(id);
        if(!conversion){const rows=await this.ask('/ItemConversion/SeedItem@itemTemplateId=?/',[id],true,true);conversion=Content.parseConversions(rows);this.boxes.set(id,conversion);if(this.boxes.size>128)this.boxes.delete(this.boxes.keys().next().value);}
        const data=await this.metadata([id,...conversion.results.map(e=>e.id)]),byId=new Map(data.map(i=>[i.id,i]));
        const known=this.items.has(id);let catalogError='';
        if(known&&!conversion.results.length&&!conversion.unsupported&&this.asura){
            try{
                const catalog=await this.asura.contents(id,byId.get(id).name,this.server());
                if(catalog&&catalog.entries.length){
                    const contained=await this.metadata(catalog.entries.map(entry=>entry.id)),indexed=new Map(contained.map(entry=>[entry.id,entry]));
                    if(catalog.entries.some(entry=>!this.items.has(entry.id)||!entry.names.some(name=>require('./title').sameTitle(indexed.get(entry.id).name,name))))throw Error('Os conteúdos do catálogo não correspondem aos nomes deste cliente.');
                    return {box:byId.get(id),kind:'Catálogo do Asura',complete:true,unsupported:0,source:{kind:'asura-catalog',url:catalog.url},message:'Conteúdo publicado no catálogo do Asura. Quantidades e probabilidades não informadas.',entries:catalog.entries.map(entry=>{const item=indexed.get(entry.id),rule=item.restrictions;return {...item,icon:item.icon||entry.icon,amount:null,rule,conditions:Content.describe(rule),compatible:Content.compatible(rule,character)};})};
                }
            }catch(e){if(this.closed)throw e;catalogError=' Consulta ao catálogo do Asura: '+String(e.message||e);}
        }
        return {box:byId.get(id),kind:!known?'ID não encontrado':conversion.results.length?'Conversão por personagem':'Conteúdo não disponível',complete:known&&conversion.complete&&conversion.results.length>0,unsupported:conversion.unsupported,
            message:!known?'O ID '+id+' não foi encontrado no DataCenter deste cliente. Confira o número; isso não identifica uma caixa ou seus conteúdos no servidor.':conversion.results.length?'Variantes declaradas no DataCenter deste cliente. Não são probabilidades de sorteio.':'Esta caixa não declara conteúdo FixedItem em ItemConversion. Não é possível revelar recompensas definidas somente pelo servidor.'+catalogError,
            entries:conversion.results.map(entry=>({...entry,...byId.get(entry.id),rule:entry.rule,conditions:Content.describe(entry.rule),compatible:Content.compatible(entry.rule,character)}))};
    }
    async inventory(ids){ids=[...new Set(ids.map(Content.number).filter(Boolean))].slice(0,512);if(!ids.length)return [];const rows=await this.ask('/ItemConversion/SeedItem@itemTemplateId=?/',[ids],true,false,['itemTemplateId']);if(!Array.isArray(rows))throw Error('Índice de caixas não reconhecido.');return this.metadata(rows.map(n=>n.attributes&&n.attributes.itemTemplateId));}
    reset(){this.items.clear();this.boxes.clear();if(this.asura)this.asura.reset();}
    close(){this.closed=true;if(this.asura)this.asura.close();this.reset();}
}
module.exports=Provider;

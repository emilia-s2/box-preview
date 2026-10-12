'use strict';
const {number}=require('./content');
function instanceKey(value){
    if(typeof value==='bigint')return value>0n&&value<=18446744073709551615n?String(value):null;
    if(typeof value==='number')return Number.isSafeInteger(value)&&value>0?String(value):null;
    if(typeof value!=='string'||!/^\d{1,20}$/.test(value))return null;
    const id=BigInt(value);return id>0n&&id<=18446744073709551615n?String(id):null;
}
// Resolve instance IDs only from complete item lists for the connected character.
// An instance ID is never treated as the template ID or rounded to a JS Number.
module.exports=class ItemIndex {
    constructor(){this.groups=new Map();this.buffers=new Map();this.byInstance=new Map();this.observed=new Map();}
    receive(event,gameId){
        if(gameId===null||gameId===undefined||String(event.gameId)!==String(gameId)||!Number.isInteger(event.container)||event.container<0||event.container>32)return null;
        const pocket=event.pocket===undefined?0:event.pocket;if(!Number.isInteger(pocket)||pocket<0||pocket>32)return null;
        const key=event.container+':'+pocket;
        if(event.first){for(const item of this.groups.get(key)||[])if(item.dbid)this.observed.delete(item.dbid);this.groups.delete(key);this.rebuild();if(!this.buffers.has(key)&&this.buffers.size>=64)return null;this.buffers.set(key,[]);}
        const buffer=this.buffers.get(key);if(!buffer)return null;
        if(!Array.isArray(event.items)||buffer.length+event.items.length>512){this.buffers.delete(key);return null;}
        for(const row of event.items){if(!row||typeof row!=='object'){this.buffers.delete(key);return null;}const id=number(row.id);if(id)buffer.push({id,slot:row.slot,dbid:instanceKey(row.dbid)});}
        if(event.more)return null;
        this.buffers.delete(key);this.groups.set(key,buffer);if(this.groups.size>64)this.groups.delete(this.groups.keys().next().value);this.rebuild();
        return {container:event.container,pocket,items:buffer};
    }
    rebuild(){
        this.byInstance.clear();
        for(const items of this.groups.values())for(const item of items){
            if(!item.dbid)continue;
            if(this.byInstance.has(item.dbid)&&this.byInstance.get(item.dbid)!==item.id)this.byInstance.set(item.dbid,null);
            else this.byInstance.set(item.dbid,item.id);
        }
    }
    observe(value,id){const key=instanceKey(value),template=number(id);if(!key||!template)return;this.observed.delete(key);this.observed.set(key,template);if(this.observed.size>512)this.observed.delete(this.observed.keys().next().value);}
    find(value){const key=instanceKey(value);if(!key)return null;return this.observed.has(key)?this.observed.get(key):this.byInstance.get(key)||null;}
    reset(){this.groups.clear();this.buffers.clear();this.byInstance.clear();this.observed.clear();}
};
module.exports.instanceKey=instanceKey;

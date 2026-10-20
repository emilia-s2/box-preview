'use strict';
const {number}=require('./content');
// Observe existing game packets only. Arming never requests, clicks or buys an item.
module.exports=class Capture {
    constructor(selected,changed,{duration=10000}={}){this.selected=selected;this.changed=changed;this.duration=duration;this.timer=null;this.armed=false;this.last=null;this.nativeLast=null;this.recent=[];this.waiters=new Set();this.message='';this.closed=false;}
    state(){return {armed:this.armed,last:this.last,message:this.message};}
    arm(){if(this.closed)return;this.cancel();this.clearObservations();this.armed=true;this.message='Captura ativa por 10 segundos: aponte para outra caixa ou abra seu tooltip. Aguardo um novo ID do jogo.';this.changed();this.timer=setTimeout(()=>{this.timer=null;if(this.closed)return;this.armed=false;this.message='O jogo não enviou um novo ID. Escolha a origem Rewards/loja ou informe o ID; o item anterior não foi reutilizado.';this.changed();},this.duration);if(this.timer.unref)this.timer.unref();}
    observe(value,source,button=null,details={}){const id=number(value);if(!id||this.closed)return;const event={...details,id,source,time:Date.now(),button:Number.isInteger(button)?button:null};this.record(event);if(this.armed&&event.kind!=='stale'){this.cancel();this.message='ID '+id+' identificado em '+source+'.';this.changed();this.selected(id);}else this.changed();}
    invalidate(source,details={}){if(this.closed)return;this.record({...details,id:null,source,time:Date.now(),kind:'unknown'});this.changed();}
    record(event){
        const previous=this.nativeLast;
        if(event.kind==='hover'&&previous&&['request','unknown'].includes(previous.kind)&&event.time-previous.time<=2000&&previous.point&&event.point&&Math.hypot(previous.point.x-event.point.x,previous.point.y-event.point.y)<5&&((previous.dbid&&event.dbid&&previous.dbid!==event.dbid)||(previous.id&&previous.id!==event.id)))event.kind='stale';
        this.last=event;if(['hover','request','unknown'].includes(event.kind))this.nativeLast=event;this.recent.push(event);if(this.recent.length>8)this.recent.shift();this.notifyWaiters();
    }
    notifyWaiters(){for(const wake of [...this.waiters])wake();}
    watch(test){
        let finish;
        const promise=new Promise(resolve=>{
            let settled=false;
            const wake=()=>{const value=this.closed?null:test();if(value||this.closed)finish(value||null);};
            finish=value=>{if(settled)return;settled=true;this.waiters.delete(wake);resolve(value);};
            wake.cancel=()=>finish(null);
            this.waiters.add(wake);wake();
        });
        return {promise,cancel:()=>finish(null)};
    }
    waitFor(test,duration=350){
        const current=test();if(current||this.closed)return Promise.resolve(current||null);
        if(this.waiters.size>=2)return Promise.resolve(null);
        return new Promise(resolve=>{
            let timer;const finish=value=>{clearTimeout(timer);this.waiters.delete(wake);resolve(value);},wake=()=>{const value=this.closed?null:test();if(value||this.closed)finish(value||null);};
            wake.cancel=()=>finish(null);this.waiters.add(wake);timer=setTimeout(()=>finish(null),Math.max(1,Math.min(500,duration)));wake();
        });
    }
    clearObservations(){this.last=null;this.nativeLast=null;this.recent=[];for(const wake of [...this.waiters])wake.cancel();}
    cancel(){clearTimeout(this.timer);this.timer=null;this.armed=false;}
    reset(){this.cancel();this.clearObservations();this.message='';}
    close(){this.closed=true;this.reset();}
};

'use strict';
const Provider=require('./lib/provider'),Content=require('./lib/content'),Panel=require('./lib/panel'),Capture=require('./lib/capture'),Title=require('./lib/title'),Rewards=require('./lib/rewards'),ItemIndex=require('./lib/item-index'),{Pointer}=require('./lib/pointer');
const Locale=require('./lib/i18n'),Preferences=require('./lib/preferences'),TryOn=require('./lib/try-on');
const LABELS={inventory:'Inventário',rewards:'TERA Rewards',shop:'Outras lojas'};
module.exports={NetworkMod:function BoxPreview(mod){
    const preferenceRoot=mod.info&&mod.info.path||__dirname,preferenceError=Preferences.initialize(mod,preferenceRoot);
    const provider=new Provider((...args)=>mod.queryData(...args),{icons:require('./lib/icons'),server:()=>context().server,asura:new(require('./lib/asura').Asura)()});
    const itemIndex=new ItemIndex();
    let languageError=preferenceError;
    let panel=null,popup=null,self=null,inventory=new Map(),catalogs={rewards:[],shop:[]},rewardSlots=[],source='inventory',boxes=[],preview=null,error='',busy=false,progress='',pendingPoint=null,titleMap=null,titleSize=0,titleCache=null,revision=0,closed=false,pointerMessage='Inicializando Alt + clique esquerdo…';
    const warnings=preferenceError?[preferenceError]:[];
    const tryOnAvailable=TryOn.supported(mod);let tryOnError='',lastTryOn=0;
    const capture=new Capture(id=>{if(self&&open())show(id);},update);
    const pointer=new Pointer(mod.clientInterface&&mod.clientInterface.info&&mod.clientInterface.info.pid,gesture,(message,data)=>{if(data)readerDiagnostic(data);if(message){pointerMessage=message;if(data&&data.event==='error'&&pendingPoint&&self&&!closed){const point=pendingPoint;pendingPoint=null;revision++;busy=false;progress='';preview=null;error=message;showPopup(point);diagnostic({version:'0.4.1',stage:'input-error',error:message});}update();}},prepareGesture);
    function context(){const info=mod.clientInterface&&mod.clientInterface.info||{};let name='';const list=mod.serverList;const server=list instanceof Map?list.get(mod.serverId)||list.get(String(mod.serverId)):Array.isArray(list)?list.find(s=>Number(s.id)===Number(mod.serverId)):list&&list[mod.serverId];if(server)name=String(server.name||server.title||'');return {serverId:mod.serverId||null,server:name||'Servidor conectado',path:info.path||'',patch:String(mod.majorPatchVersion)+'.'+String(mod.minorPatchVersion),character:self&&self.name||'',identity:self&&Content.identity(self.templateId)};}
    function idsFor(origin){return origin==='inventory'?[...new Set([...inventory.values()].flat().map(i=>i.id))].slice(0,512):catalogs[origin]||[];}
    function state(){return {version:'0.4.1',language:Locale.resolve(mod),languagePreference:Locale.preference(mod.settings&&mod.settings.language),languageError,context:context(),busy,progress,error,tryOnError,previewToken:revision,preview:preview&&{...preview,entries:preview.entries.map(entry=>({...entry,canTryOn:tryOnAvailable&&TryOn.eligible(entry,context().identity)}))},boxes,source,sources:Object.keys(LABELS).map(key=>({id:key,label:LABELS[key],count:idsFor(key).length})),capture:capture.state(),pointer:{ready:pointer.ready,message:pointerMessage},warnings};}
    function update(){if(closed)return;const value=state();if(panel)panel.update(value);if(popup)popup.update(value);}
    function notify(text){mod.command.message('Box Preview: '+Locale.translate(Locale.resolve(mod),text));}
    // Reuse the existing core state only on a user action, so a soft reload in the
    // world does not require another S_LOGIN or query anything during startup.
    function ensureSelf(){if(self)return true;try{const game=mod.game,me=game&&game.me;if(game&&game.isIngame&&me&&me.gameId&&me.name&&Content.identity(me.templateId))self={name:me.name,gameId:me.gameId,templateId:me.templateId};}catch(_){}return !!self;}
    function seedInventory(){
        // A hot reload may occur after the server sent the inventory. Reuse only
        // the core's already loaded, complete state for this same character.
        if(!self||inventory.size)return;
        try{const game=mod.game,core=game&&game.loadedSubmodules&&game.loadedSubmodules.inventory;
            if(!game.isIngame||!game.me||String(game.me.gameId)!==String(self.gameId)||!core||core._buffer||!Array.isArray(core.pockets))return;
            core.pockets.forEach((pocket,key)=>{if(!pocket||!pocket.slots)return;const completed=itemIndex.receive({gameId:self.gameId,container:0,pocket:key,first:true,more:false,items:Object.values(pocket.slots)},self.gameId);if(completed)inventory.set(key,completed.items);});
        }catch(_){}
    }
    function startPointer(){if(ensureSelf())pointer.start();}
    function nativePoint(data=null){try{const screen=require('electron').screen;if(data&&Number.isFinite(data.x)&&Number.isFinite(data.y)&&typeof screen.screenToDipPoint==='function')return screen.screenToDipPoint({x:data.x,y:data.y});return screen.getCursorScreenPoint();}catch(_){return null;}}
    function remember(id,origin,button,kind,details={}){capture.observe(id,origin,button,{...details,point:nativePoint(),kind});}
    function currentNative(){const last=capture.nativeLast;if(last&&last.kind==='unknown'&&last.dbid){const id=itemIndex.find(last.dbid);if(id)return {...last,id,kind:'request',instance:true,source:'Unidade do item / lista recebida'};}if(last&&last.instance&&itemIndex.find(last.dbid)!==last.id)return {...last,id:null,kind:'unknown'};return last&&{...last};}
    async function prepareGesture(data){
        seedInventory();
        const started=Date.now(),point=nativePoint(data);pendingPoint=point;
        const pick=()=>{const last=currentNative(),nativeId=Title.nativeCandidate(last,point);return nativeId?{point,last,nativeId}:null;};
        if(panel)panel.hide();if(popup)popup.hide();let selection=pick();
        const pending=currentNative();
        if(!selection&&pending&&pending.kind==='unknown'&&pending.point&&point&&Date.now()-pending.time<1000&&Math.hypot(pending.point.x-point.x,pending.point.y-point.y)<5)selection=await capture.waitFor(pick,350);
        return {...(selection||{point,last:currentNative(),nativeId:null}),prepareMs:Date.now()-started};
    }
    function showPopup(point){if(!popup)popup=new(require('./lib/popup'))(mod,state,(name,data)=>{if(name==='hide')popup.hide();else if(name==='full'){popup.hide();activate();}else if(name==='preview'||name==='language'||name==='try-on')action(name,data);});popup.showAt(point);}
    function cachedTitles(items){if(titleMap!==items||titleSize!==items.size){titleMap=items;titleSize=items.size;titleCache=new Title.TitleIndex(items);}return titleCache;}
    function clearTitles(){titleMap=null;titleSize=0;titleCache=null;}
    function diagnostic(value){try{const fs=require('fs'),path=require('path'),dir=path.join(mod.info.path,'diagnostics');fs.mkdirSync(dir,{recursive:true});const text=JSON.stringify(value,null,2);fs.writeFileSync(path.join(dir,'last-pointer.json'),text);if(value.error)fs.writeFileSync(path.join(dir,'last-failure.json'),text);}catch(_){} }
    function readerDiagnostic(data){try{const fs=require('fs'),path=require('path'),dir=path.join(mod.info.path,'diagnostics'),value={observedAt:Date.now()};for(const key of ['event','version','targetPid','readerPid','hookRegistered','rawRegistered','repairs','accepted','warmedFrames','cachedClicks','immediateClicks','source','error'])if(['string','number','boolean'].includes(typeof data[key]))value[key]=typeof data[key]==='string'?data[key].slice(0,300):data[key];fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'input-state.json'),JSON.stringify(value,null,2));}catch(_){} }
    async function gesture(frame,read,selection=null,recapture=null){
        if(closed||!ensureSelf())return;pendingPoint=null;const started=Date.now(),request=++revision,point=selection?selection.point:nativePoint();let last=selection&&selection.nativeId?selection.last:currentNative(),nativeId=selection&&selection.nativeId?selection.nativeId:Title.nativeCandidate(last,point);const latest=currentNative();if(selection&&selection.nativeId&&latest&&last&&latest.time>=last.time&&latest.point&&point&&Math.hypot(latest.point.x-point.x,latest.point.y-point.y)<5){last=latest;nativeId=Title.nativeCandidate(last,point);}tryOnError='';busy=true;progress='Identificando a caixa…';error='';preview=null;
        update();
        const details={version:'0.4.1',stage:'reading',inputSource:frame.inputSource||null,rewardSlots:rewardSlots.length,nativeId,prepareMs:selection&&selection.prepareMs||0,native:last&&{id:last.id,source:last.source,kind:last.kind,age:Date.now()-last.time,distance:last.point&&point?Math.hypot(last.point.x-point.x,last.point.y-point.y):null},recentNative:capture.recent.slice(-4).map(event=>({id:event.id,source:event.source,kind:event.kind,age:Date.now()-event.time}))};
        const current=()=>!closed&&request===revision;
        function loadingContents(id){if(!current())return;showPopup(point);details.stage='loading-contents';details.identificationMs=Date.now()-started;details.resolvedId=id||null;progress=id?'Carregando conteúdo do item '+id+'…':'Verificando os conteúdos da caixa…';diagnostic(details);update();}
        async function fromNative(id,event,late=false){loadingContents(id);const result=await provider.preview(id,context().identity);if(result.kind==='ID não encontrado')throw Error('O jogo informou o ID '+id+', mas o DataCenter conectado não o reconhece.');result.identification={title:result.box.name,ids:[id],exactId:true,source:event&&event.instance?'ID da unidade recebido pelo proxy':'ID recebido pelo proxy'};if(current())preview=result;details.nativeId=id;details.nativeAfterRead=late;details.stage='native-id';}
        diagnostic(details);
        try{
            // A recent hover/request ID at this cursor is already identified by the game.
            // OCR must not veto this native event.
            if(nativeId){await fromNative(nativeId,last);return;}
            if(frame.nativeOnly){const found=await capture.waitFor(()=>{if(!current())return null;const event=currentNative(),id=Title.nativeCandidate(event,point);return id?{id,event}:null;},350);if(!current())return;if(found){await fromNative(found.id,found.event,true);return;}throw Error('O item mudou antes da confirmação do jogo. Mantenha o mouse na caixa e tente novamente.');}
            async function identifyFrame(){
            let ocr,readError;const readingStarted=Date.now();try{ocr=await read(frame);}catch(e){readError=e;}details.ocrMs=Date.now()-readingStarted;if(!current())return;
            const late=currentNative(),lateId=Title.nativeCandidate(late,point);if(lateId){await fromNative(lateId,late,true);return;}if(readError)throw readError;
            const image=require('electron').nativeImage.createFromBuffer(Buffer.from(frame.image,'base64')),imagePoint=Number.isFinite(frame.left)&&Number.isFinite(frame.top)?{x:frame.x-frame.left,y:frame.y-frame.top}:null,headings=Title.headings(ocr,image,imagePoint);
            details.capture={size:image.getSize(),left:frame.left,top:frame.top,click:{x:frame.x,y:frame.y},source:frame.captureSource||'after-click',snapshotAgeMs:frame.snapshotAgeMs};
            const shortLine=line=>({text:String(line.text||'').slice(0,160),x:line.x,y:line.y,width:line.width,height:line.height});
            details.ocrItemLines=(ocr.lines||[]).filter(line=>/smart|box|triton|swim|caixa|costume|cooldown|for.?level/i.test(line.text||'')).slice(0,18).map(shortLine);
            details.ocrNearPoint=imagePoint?(ocr.lines||[]).filter(line=>Math.abs(line.x-imagePoint.x)<800&&line.y>imagePoint.y-900&&line.y<imagePoint.y+120).sort((a,b)=>Math.hypot(a.x-imagePoint.x,a.y-imagePoint.y)-Math.hypot(b.x-imagePoint.x,b.y-imagePoint.y)).slice(0,18).map(shortLine):[];
            details.headings=headings.slice(0,6).map(h=>h.text.slice(0,140));details.titleGrades=headings.slice(0,6).map(h=>({title:h.text.slice(0,140),grade:h.grade}));
            const nearbyId=Title.nativeCandidate(last,point,Date.now(),32);
            if(nearbyId){const [item]=await provider.metadata([nearbyId]);if(!current())return;if(headings.some(heading=>Title.sameTitle(item.name,heading.text))){loadingContents(nearbyId);const result=await provider.preview(nearbyId,context().identity);result.identification={title:item.name,ids:[nearbyId],exactId:true,source:'ID recebido e nome confirmado'};if(current())preview=result;details.nativeId=nearbyId;details.stage='native-title';return;}}
            details.point=imagePoint;details.ocrLines=(ocr.lines||[]).length;details.storeAnchors=(ocr.lines||[]).filter(line=>/purchase|comprar|rewards|recompensas/i.test(line.text||'')).slice(0,14).map(line=>({text:line.text.slice(0,80),x:line.x,y:line.y}));
            const slot=Rewards.locate(ocr,frame,rewardSlots);if(slot){details.slot={slot:slot.slot,id:slot.id,captions:slot.captions.slice(0,3).map(t=>t.slice(0,140))};const [item]=await provider.metadata([slot.id]);if(!current())return;if(Rewards.captionMatches(item.name,slot.captions)){loadingContents(slot.id);const result=await provider.preview(slot.id,context().identity);result.identification={title:item.name,ids:[slot.id],exactId:true,source:'Rewards / posição '+slot.slot};if(current())preview=result;details.stage='rewards-slot-id';return;}}
            if(!headings.length)throw Object.assign(Error('Não foi possível ler o item nesta captura.'),{code:'NO_ITEM_TITLE'});
            const titles=[...new Set(headings.flatMap(h=>[h.text,Title.stripCounter(h.text)]))];let items;try{items=mod.game.data.items;}catch(_){}
            if(!(items instanceof Map)||!items.size){const names=await provider.ask('/StrSheet_Item/String@string=?/',[titles],true,false,['id','string']);if(!current())return;items=new Map(names.map(n=>[n.attributes.id,{name:n.attributes.string}]));}
            details.cachedItems=items.size;details.stage='match-title';let match;try{match=cachedTitles(items).match(headings);}catch(e){if(!current())return;const names=await provider.ask('/StrSheet_Item/String@string=?/',[titles],true,false,['id','string']);if(!current())return;const live=new Map(names.map(n=>[n.attributes.id,{name:n.attributes.string}]));details.freshMatches=live.size;match=new Title.TitleIndex(live).match(headings);}
            details.matchedIds=match.ids.slice();details.matchedGrade=match.grade;loadingContents(match.ids.length===1?match.ids[0]:null);const result=await Title.resolve(match,{provider,character:context().identity,rewards:catalogs.rewards,ocrLines:ocr.lines,nativeId,isCurrent:current});details.resolvedId=result.identification.exactId?result.box.id:null;details.identification=result.identification;
            if(!closed&&request===revision)preview=result;details.stage='resolved-title';
            }
            details.attempts=[];let frozenFallback=frame.fallbackFrame;
            for(let attempt=0;attempt<3&&current();attempt++){
                try{await identifyFrame();details.attempts.push({attempt:attempt+1,source:frame.captureSource,ocrMs:details.ocrMs,stage:details.stage});break;}
                catch(e){details.attempts.push({attempt:attempt+1,source:frame.captureSource,ocrMs:details.ocrMs,code:e.code||null});if(e.code!=='NO_ITEM_TITLE'||(!frozenFallback&&!recapture)||attempt===2||!current()||Date.now()-started>4000)throw e;
                    const next=frozenFallback||await recapture();frozenFallback=null;if(!current())return;frame.image='';frame=next;
                }
            }
        }catch(e){if(!closed&&request===revision){error=String(e&&e.message||e);details.error=error;if(e.captureFailure)details.captureFailure=e.captureFailure;}}finally{if(!closed&&request===revision){busy=false;progress='';details.imageCaptured=typeof frame.image==='string'&&frame.image.length>0;details.queryMs=Date.now()-started;if(Number.isFinite(details.identificationMs))details.contentMs=details.queryMs-details.identificationMs;diagnostic(details);showPopup(point);update();}}
    }
    function observe(name,version,handler){try{mod.hook(name,version,event=>{try{handler(event);}catch(e){if(typeof mod.warn==='function')mod.warn('Box Preview: evento '+name+' ignorado: '+String(e.message||e));}});}catch(e){warnings.push(name+' indisponível neste protocolo.');if(typeof mod.warn==='function')mod.warn(warnings[warnings.length-1]);}}
    function open(){if(!global.TeraProxy||!global.TeraProxy.GUIMode){notify('Use o Toolbox em modo gráfico para abrir a janela.');return false;}if(!panel)panel=new Panel(mod,state,action);panel.show();update();return true;}
    async function show(id){if(!ensureSelf()){error='Entre no mundo antes de consultar o cliente.';update();return;}const request=++revision;tryOnError='';busy=true;progress='Carregando conteúdo do item '+id+'…';error='';preview=null;update();try{const result=await provider.preview(id,context().identity);if(request===revision&&!closed)preview=result;}catch(e){if(request===revision&&!closed){error=String(e&&e.message||e);notify(error);}}finally{if(request===revision&&!closed){busy=false;progress='';update();}}}
    async function refresh(){if(!ensureSelf()){error='Entre no mundo antes de consultar o cliente.';update();return;}seedInventory();const request=++revision,origin=source,ids=idsFor(origin),started=Date.now();tryOnError='';busy=true;progress='';error='';boxes=[];update();try{const result=await provider.inventory(ids);if(request===revision&&!closed)boxes=result;}catch(e){if(request===revision&&!closed)error=String(e&&e.message||e);}finally{if(request===revision&&!closed){busy=false;try{const fs=require('fs'),path=require('path'),dir=path.join(mod.info.path,'diagnostics');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'inventory.json'),JSON.stringify({version:'0.4.1',server:context().server,origin,ids,boxes:boxes.map(box=>({id:box.id,name:box.name})),queryMs:Date.now()-started,error},null,2));}catch(_){}update();}}}
    function arm(){if(!ensureSelf()){if(typeof mod.warn==='function')mod.warn('Box Preview: entre no mundo antes de usar a captura.');return;}revision++;preview=null;busy=false;error='';capture.arm();notify(capture.message);}
    function tryOn(data){
        tryOnError='';
        try{
            if(!ensureSelf()||closed||!mod.game.isIngame)throw Error('Entre no mundo antes de experimentar uma roupa.');
            if(!tryOnAvailable)throw Error('O provador não está disponível neste protocolo.');
            if(busy||!preview||data.token!==revision||Content.number(data.boxId)!==preview.box.id)throw Error('A consulta mudou. Use o olho da roupa na lista atual.');
            const id=Content.number(data.id),entry=preview.entries.find(item=>item.id===id&&TryOn.eligible(item,context().identity));
            if(!entry)throw Error('Esta variante não pode ser experimentada por este personagem.');
            const me=mod.game.me;if(!me||String(me.gameId)!==String(self.gameId)||me.templateId!==self.templateId)throw Error('O personagem mudou. Consulte a caixa novamente.');
            if(Date.now()-lastTryOn<250){update();return;}
            TryOn.send(mod,entry);lastTryOn=Date.now();if(popup)popup.hide();if(panel)panel.hide();
        }catch(e){tryOnError=String(e&&e.message||e);}
        update();
    }
    function action(name,data){data=data&&typeof data==='object'?data:{};if(name==='try-on'){tryOn(data);return;}
if(name==='language'){try{Preferences.set(mod,preferenceRoot,data.language);languageError='';notify('Idioma salvo.');}catch(e){languageError='Não foi possível salvar o idioma: '+String(e.message||e);notify(languageError);}update();return;}if(name==='preview'){const id=Content.number(data.id);if(id)show(id);else{error='Informe um ID válido ou selecione uma caixa.';update();}}else if(name==='refresh'){clearTitles();provider.reset();refresh();}else if(name==='source'&&Object.prototype.hasOwnProperty.call(LABELS,data.source)){source=data.source;preview=null;refresh();}else if(name==='capture')arm();}
    function activate(){if(open())refresh();}
    function reset(){tryOnError='';lastTryOn=0;self=null;pendingPoint=null;pointer.stop();if(popup)popup.hide();inventory.clear();itemIndex.reset();clearTitles();catalogs={rewards:[],shop:[]};rewardSlots=[];capture.reset();provider.reset();revision++;preview=null;boxes=[];busy=false;progress='';error='';update();}
    function receiveCatalog(origin,ids){catalogs[origin]=[...new Set(ids.map(Content.number).filter(Boolean))].slice(0,512);capture.reset();if(panel&&source===origin)refresh();else update();}
    observe('S_LOGIN',14,event=>{reset();self={name:event.name,gameId:event.gameId,templateId:event.templateId};startPointer();update();});
    observe('S_RETURN_TO_LOBBY',1,reset);
    observe('S_ITEMLIST',mod.majorPatchVersion>=96?4:3,event=>{if(!self)return;const completed=itemIndex.receive(event,self.gameId);if(completed){capture.notifyWaiters();if(completed.container===0){inventory.set(completed.pocket,completed.items);update();}}});
    observe('S_SHOW_ITEM_TOOLTIP',14,event=>{if(self&&(event.type===20||event.type===17)){itemIndex.observe(event.dbid,event.id);remember(event.id,event.container===6?'Broker / tooltip':'Tooltip do jogo',null,event.type===20?'hover':'persistent',{dbid:ItemIndex.instanceKey(event.dbid)});}});
    // item is the template ID. The dbid in C_SHOW_ITEM_TOOLTIP_EX is NOT an item ID.
    observe('C_REQUEST_NONDB_ITEM_INFO',2,event=>{if(self)remember(event.item,'Consulta de item / loja',event.button,'request');});
    observe('C_SHOW_ITEM_TOOLTIP_EX','*',event=>{if(!self||![20,17].includes(event.type))return;const dbid=ItemIndex.instanceKey(event.dbid===undefined?event.id:event.dbid),id=itemIndex.find(dbid);if(id)remember(id,'Unidade do item / tooltip',null,event.type===20?'request':'persistent',{instance:true,dbid});else if(event.type===20)capture.invalidate('Unidade ainda sem ID confirmado',{point:nativePoint(),dbid});});
    observe('S_VIP_STORE_ITEM_LIST',1,event=>{rewardSlots=Array.isArray(event.items)?event.items.filter(i=>Number.isInteger(i.slot)&&i.slot>=1&&i.slot<=10&&Content.number(i.dbid)).map(i=>({slot:i.slot,id:Content.number(i.dbid)})):[];if(new Set(rewardSlots.map(i=>i.slot)).size!==rewardSlots.length)rewardSlots=[];receiveCatalog('rewards',rewardSlots.map(i=>i.id));});
    for(const packet of ['S_STORE_SELL_LIST','S_POINT_STORE_SELL_LIST','S_GUILD_STORE_SELL_LIST','S_BATTLE_FIELD_POINT_STORE_SELL_LIST'])observe(packet,1,event=>receiveCatalog('shop',(event.tabs||[]).flatMap(tab=>(tab.items||[]).map(i=>i.id))));
    observe('S_DUNGEON_WORK_POINT_STORE_SELL_LIST',1,event=>receiveCatalog('shop',(event.tabs||[]).flatMap(tab=>(tab.items||[]).map(i=>i.item))));
    mod.command.add('boxpreview',value=>{if(!value||value==='gui')activate();else if(value==='capture')arm();else if(value==='status'){notify('0.4.1 · '+context().server+' · '+Locale.translate(Locale.resolve(mod),pointerMessage));}else if(value==='refresh'){if(open())action('refresh');}else{const id=Content.number(value);if(id){if(open())show(id);}else notify('Use /8 boxpreview [ID | status | refresh].');}});
    const disposeShortcut=require('./lib/shortcut')(mod,activate);startPointer();
    this.destructor=()=>{closed=true;revision++;pointer.close();capture.close();provider.close();disposeShortcut();if(popup){popup.destructor();popup=null;}if(panel){panel.destructor();panel=null;}mod.command.remove('boxpreview');};
}};

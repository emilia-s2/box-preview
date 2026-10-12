'use strict';
const path=require('path'),Host=require('tera-mod-ui').Host;
module.exports=class Popup extends Host {
    constructor(mod,state,action){
        super(mod,'popup.html',{title:'Box Preview — Conteúdo da caixa',width:560,height:620,minWidth:440,minHeight:350,frame:true,alwaysOnTop:true,skipTaskbar:false,autoHideMenuBar:true,backgroundColor:'#14232f',show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,devTools:false}},false,path.join(__dirname,'..','ui'));
        this._keepAbove=false;this._topmostTimer=null;this._trackedWindow=null;this._disposed=false;
        this.on('ready',()=>this.update(state()));this.on('action',(name,data)=>action(name,data));
    }
    _handleEvent(event,name,...args){if(this.window&&event.sender===this.window.webContents&&['ready','action'].includes(name))this.emit(name,...args);}
    showAt(anchor=null){
        if(this._disposed)return;
        super.show();if(!this.window)return;
        const window=this.window,{screen}=require('electron'),point=anchor||screen.getCursorScreenPoint(),area=screen.getDisplayNearestPoint(point).workArea,size=window.getSize();
        this._trackWindow(window);this._keepAbove=true;
        if(typeof window.setMenu==='function')window.setMenu(null);
        window.setPosition(Math.max(area.x,Math.min(point.x+16,area.x+area.width-size[0])),Math.max(area.y,Math.min(point.y+14,area.y+area.height-size[1])));
        if(window.isMinimized())window.restore();
        this.window.setAlwaysOnTop(true,'pop-up-menu');this.window.show();if(typeof this.window.moveTop==='function')this.window.moveTop();this.window.focus();
        this._stopTimer();this._topmostTimer=setInterval(()=>this._raiseAboveGame(window),250);this._topmostTimer.unref();
    }
    _trackWindow(window){
        if(this._trackedWindow===window)return;
        this._trackedWindow=window;
        window.on('blur',()=>this._raiseAboveGame(window));
        window.on('hide',()=>{if(this._trackedWindow===window)this._stopKeepingAbove();});
        window.on('closed',()=>{if(this._trackedWindow===window){this._stopKeepingAbove();this._trackedWindow=null;}});
    }
    _raiseAboveGame(window){
        if(this._disposed||!this._keepAbove||this.window!==window||window.isDestroyed()||!window.isVisible()||window.isMinimized())return;
        // O jogo pode se colocar acima ao receber foco. Corrigir só a ordem das
        // janelas: não chamar show/focus aqui, para permitir jogar normalmente.
        window.setAlwaysOnTop(true,'pop-up-menu');if(typeof window.moveTop==='function')window.moveTop();
    }
    _stopTimer(){if(this._topmostTimer){clearInterval(this._topmostTimer);this._topmostTimer=null;}}
    _stopKeepingAbove(){this._keepAbove=false;this._stopTimer();}
    hide(){this._stopKeepingAbove();super.hide();}
    close(){this._stopKeepingAbove();super.close();}
    update(state){this.send('state',state);}
    destructor(){this._disposed=true;this._stopKeepingAbove();super.destructor();this.removeAllListeners();}
};

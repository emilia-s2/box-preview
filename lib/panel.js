'use strict';
const path=require('path'),Host=require('tera-mod-ui').Host;
module.exports=class PreviewPanel extends Host {
    constructor(mod,state,action){super(mod,'index.html',{title:'Box Preview',width:870,height:740,minWidth:650,minHeight:480,backgroundColor:'#111a24',autoHideMenuBar:true,webPreferences:{nodeIntegration:true,contextIsolation:false,devTools:false}},false,path.join(__dirname,'..','ui'));this.on('ready',()=>this.update(state()));this.on('action',(name,data)=>action(name,data));}
    _handleEvent(event,name,...args){if(this.window&&event.sender===this.window.webContents&&['ready','action'].includes(name))this.emit(name,...args);}
    show(){super.show();if(this.window){if(this.window.isMinimized())this.window.restore();this.window.show();this.window.focus();}}
    update(state){this.send('state',state);}
    destructor(){super.destructor();this.removeAllListeners();}
};

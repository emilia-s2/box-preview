'use strict';
module.exports=(mod,open)=>{
    if(!global.TeraProxy||!global.TeraProxy.GUIMode)return()=>{};
    let electron;try{electron=require('electron');}catch(_){return()=>{};}
    const {app,globalShortcut}=electron,key='Control+Alt+B';let owned=false,closed=false,warned=false;
    function warn(text){if(typeof mod.warn==='function')mod.warn('Box Preview: '+text);}
    function register(){if(closed||!app.isReady())return;try{if(globalShortcut.isRegistered(key))return;owned=globalShortcut.register(key,()=>{if(!closed)try{open();}catch(error){warn(String(error.message||error));}});if(!owned&&!warned){warned=true;warn('Ctrl+Alt+B indisponível. Use /8 boxpreview.');}}catch(_){} }
    app.once('ready',register);register();const timer=setInterval(register,2500);if(timer.unref)timer.unref();return()=>{closed=true;clearInterval(timer);app.removeListener('ready',register);if(owned)globalShortcut.unregister(key);};
};

'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
let bank=null;
module.exports=function icon(reference){
    if(!bank){try{const file=path.join(__dirname,'..','resources','icons.json.gz');const bytes=fs.readFileSync(file);if(bytes.length>8*1024*1024)return null;bank=JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));}catch(_){bank={};}}
    const value=bank[String(reference).toLowerCase()];return typeof value==='string'&&value.startsWith('data:image/webp;base64,')&&value.length<50000?value:null;
};

'use strict';
const path=require('path'),{spawn}=require('child_process');
const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const native=path.join(__dirname,'..','native');
function executeOcr(image,{timeout=15000,onChild=()=>{}}={}){
    return new Promise((resolve,reject)=>{
        const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(native,'ocr.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
        onChild(child);let output='',errors='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);onChild(null);if(error){child.kill();reject(error);}else resolve(result);};
        const timer=setTimeout(()=>finish(Error('A leitura do tooltip excedeu o tempo permitido.')),timeout);
        child.stdout.on('data',bytes=>{output+=bytes.toString();if(output.length>200000)finish(Error('Resposta de leitura grande demais.'));});child.stderr.on('data',bytes=>{errors=(errors+bytes.toString()).slice(-2000);});
        child.on('error',finish);child.on('exit',()=>{try{const value=JSON.parse(output.replace(/^\uFEFF/,''));if(!value.ok)throw Error(value.error||errors||'Falha na leitura do tooltip.');finish(null,value);}catch(e){finish(e);}});
        child.stdin.on('error',()=>{});child.stdin.end(image+'\n');
    });
}
class OcrReader {
    constructor(){this.child=null;this.pending=null;this.sequence=0;this.buffer='';this.closed=false;}
    start(){
        if(this.child||this.closed)return;
        const child=this.child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(native,'ocr.ps1'),'-Server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
        child.stdin.on('error',error=>{if(this.child===child)this.fail(error);});child.stderr.on('data',()=>{});
        child.stdout.on('data',bytes=>{if(this.child!==child)return;this.buffer+=bytes.toString();if(this.buffer.length>200000){this.fail(Error('Resposta de leitura grande demais.'));return;}let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).trim().replace(/^\uFEFF/,'');this.buffer=this.buffer.slice(end+1);if(!line)continue;try{const value=JSON.parse(line);if(value.event==='ready')continue;const request=this.pending;if(!request)continue;if(!value.ok&&!value.seq){this.fail(Error(value.error||'Falha ao iniciar o leitor.'));return;}if(value.seq!==request.seq)continue;this.pending=null;clearTimeout(request.timer);if(value.ok)request.resolve(value);else request.reject(Error(value.error||'Falha na leitura do tooltip.'));}catch(error){this.fail(error);return;}}});
        child.on('error',error=>{if(this.child===child)this.fail(error);});child.on('exit',()=>{if(this.child===child)this.fail(Error('Leitor de imagem encerrado.'));});
    }
    read(image){
        if(this.closed)return Promise.reject(Error('Leitor de imagem encerrado.'));
        if(this.pending)return Promise.reject(Error('Já existe uma leitura de imagem em andamento.'));
        if(typeof image!=='string'||!image.length||image.length>18000000)return Promise.reject(Error('Imagem ausente ou grande demais.'));
        this.start();const child=this.child,seq=++this.sequence;
        const operation=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(this.child===child)this.fail(Error('A leitura do tooltip excedeu o tempo permitido.'));},12000);this.pending={seq,resolve,reject,timer};child.stdin.write(JSON.stringify({seq,image})+'\n');});
        // A late cancel must never terminate the worker's next request.
        operation.cancel=()=>{if(this.child===child&&this.pending&&this.pending.seq===seq)this.fail(Error('A leitura foi cancelada.'));};
        return operation;
    }
    fail(error){const child=this.child;this.child=null;this.buffer='';const request=this.pending;this.pending=null;if(request){clearTimeout(request.timer);request.reject(error);}if(child)child.kill();}
    close(){this.closed=true;this.fail(Error('Leitor de imagem encerrado.'));}
}
class Pointer {
    constructor(pid,gesture,status,prepare=()=>{}){this.pid=Number(pid);this.gesture=gesture;this.status=status;this.prepare=prepare;this.child=null;this.closed=false;this.reading=false;this.preparing=false;this.plan=null;this.buffer='';this.ready=false;this.ocr=null;this.retry=null;}
    start(){
        if(this.closed||this.child||process.platform!=='win32'||!Number.isInteger(this.pid)||this.pid<1)return;
        this.failed=false;const child=this.child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(native,'input.ps1'),'-TargetPid',String(this.pid),'-ParentPid',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
        child.stdin.on('error',()=>{});
        child.stdout.on('data',bytes=>{
            if(this.closed||this.child!==child)return;
            this.buffer+=bytes.toString();if(this.buffer.length>18000000){this.status('Captura grande demais.');this.stop();return;}
            let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end+1);if(!line)continue;try{this.receive(child,JSON.parse(line));}catch(_){this.status('Falha na resposta do leitor de gesto.');}}
        });
        child.stderr.on('data',()=>{});
        child.on('error',e=>{if(this.child!==child)return;this.failed=true;this.ready=false;this.status('Atalho indisponível: '+e.message);});
        child.on('exit',()=>{if(this.child!==child)return;this.child=null;this.stop();if(!this.closed&&!this.failed)this.status('Leitor de Alt + clique esquerdo encerrado.');});
    }
    receive(child,data){
        if(data.event==='retry-frame'||data.event==='retry-error'){const request=this.retry;if(!request||data.seq!==request.seq)return;this.retry=null;clearTimeout(request.timer);if(data.event==='retry-error'){const error=Error(data.error);error.captureFailure={};for(const key of ['reason','ageMs','cursorDx','cursorDy','foregroundPid','underPid'])if(['string','number'].includes(typeof data[key]))error.captureFailure[key]=data[key];request.reject(error);}else if(typeof data.image==='string'&&Number.isFinite(data.x)&&Number.isFinite(data.y))request.resolve(data);else request.reject(Error('Quadro de leitura inválido.'));return;}
        if(data.event==='ready'){this.ready=true;if(!this.ocr)this.ocr=new OcrReader();this.ocr.start();this.status('Alt + clique esquerdo disponível no TERA.',data);return;}
        if(data.event==='health'){this.status(null,data);return;}
        if(data.event==='error'){this.failed=!this.ready;this.plan=null;this.status(String(data.error),data);return;}
        if(data.event==='prepare'){
            if(!Number.isSafeInteger(data.seq)||data.seq<1||!Number.isFinite(data.x)||!Number.isFinite(data.y))return;
            if(this.reading||this.preparing){child.stdin.write('skip '+data.seq+'\n');return;}
            this.preparing=true;
            Promise.resolve().then(()=>this.prepare(data)).then(selection=>{
                if(this.closed||this.child!==child)return;
                this.plan={seq:data.seq,selection};child.stdin.write((selection&&selection.nativeId?'direct ':'capture ')+data.seq+'\n');
            }).catch(error=>{if(!this.closed&&this.child===child){child.stdin.write('skip '+data.seq+'\n');this.status('Falha ao preparar o menu: '+String(error.message||error));}}).finally(()=>{if(this.child===child)this.preparing=false;});return;
        }
        if(data.event!=='gesture'||this.reading||!this.plan||data.seq!==this.plan.seq||!Number.isFinite(data.x)||!Number.isFinite(data.y))return;
        const selection=this.plan.selection;this.plan=null;
        if(data.nativeOnly===true?!(selection&&selection.nativeId):typeof data.image!=='string')return;
        this.reading=true;
        Promise.resolve().then(()=>{
            if(this.closed||this.child!==child)return;
            return this.gesture(data,(frame=data)=>{
                if(data.nativeOnly===true)throw Error('O ID nativo não precisa de leitura de imagem.');
                if(this.closed||this.child!==child)throw Error('A leitura foi cancelada.');
                if(!this.ocr)this.ocr=new OcrReader();return this.ocr.read(frame.image);
            },selection,()=>this.resample(data.seq));
        }).catch(error=>{if(!this.closed&&this.child===child)this.status(String(error.message||error));}).finally(()=>{data.image='';if(data.fallbackFrame)data.fallbackFrame.image='';if(this.child===child)this.reading=false;});
    }
    resample(seq){if(!this.child||this.closed||!this.reading||this.retry)return Promise.reject(Error('A nova captura foi cancelada.'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.retry=null;reject(Error('A nova captura não respondeu.'));},1500);this.retry={seq,resolve,reject,timer};this.child.stdin.write('retry '+seq+'\n');});}
    stop(){if(this.child){this.child.kill();this.child=null;}if(this.ocr){this.ocr.close();this.ocr=null;}if(this.retry){clearTimeout(this.retry.timer);this.retry.reject(Error('A leitura foi cancelada.'));this.retry=null;}this.ready=false;this.reading=false;this.preparing=false;this.plan=null;this.buffer='';}
    close(){this.closed=true;this.stop();}
}
module.exports={Pointer,executeOcr,OcrReader};

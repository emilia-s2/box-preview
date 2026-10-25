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
    constructor(pid,gesture,status,prepare=()=>{},middleMouse=()=>false,cancelGesture=()=>{}){this.cancelGesture=cancelGesture;this.active=null;this.middleMouse=middleMouse;this.pid=Number(pid);this.gesture=gesture;this.status=status;this.prepare=prepare;this.child=null;this.closed=false;this.reading=false;this.preparing=false;this.plan=null;this.buffer='';this.ready=false;this.ocr=null;this.retry=null;}
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
        child.on('exit',()=>{if(this.child!==child)return;this.child=null;this.stop();if(!this.closed&&!this.failed)this.status('Leitor de Shift + clique esquerdo ou botão central com o cursor sobre o item encerrado.');});
    }
    allowed(data){return data.inputSource==='shift-left-raw'||data.inputSource==='middle-raw'&&this.middleMouse()===true;}
    configure(){if(this.child&&this.ready)try{this.child.stdin.write('middle '+(this.middleMouse()===true?'1':'0')+'\n');}catch(error){this.status('Atalho indisponível: '+String(error.message||error));}}
    current(request){return !!request&&!this.closed&&this.active===request&&this.child===request.child;}
    finish(request){if(this.active!==request)return;this.active=null;this.reading=false;this.preparing=false;this.plan=null;}
    cancel(){
        const request=this.active;if(!request)return false;
        this.active=null;this.reading=false;this.preparing=false;this.plan=null;
        // Release the native preparation handshake as well as the JS work.
        if(this.child===request.child)try{request.child.stdin.write('skip '+request.seq+'\n');}catch(_){}
        if(request.read&&typeof request.read.cancel==='function')request.read.cancel();
        if(this.retry){const retry=this.retry;this.retry=null;clearTimeout(retry.timer);retry.reject(Error('A leitura foi cancelada.'));}
        if(request.frame){request.frame.image='';if(request.frame.fallbackFrame)request.frame.fallbackFrame.image='';}
        this.cancelGesture();return true;
    }
    receive(child,data){
        if(this.closed||this.child!==child)return;
        if(data.event==='retry-frame'||data.event==='retry-error'){const request=this.retry;if(!request||data.seq!==request.seq)return;this.retry=null;clearTimeout(request.timer);if(data.event==='retry-error'){const error=Error(data.error);error.captureFailure={};for(const key of ['reason','ageMs','cursorDx','cursorDy','foregroundPid','underPid'])if(['string','number'].includes(typeof data[key]))error.captureFailure[key]=data[key];request.reject(error);}else if(typeof data.image==='string'&&Number.isFinite(data.x)&&Number.isFinite(data.y))request.resolve(data);else request.reject(Error('Quadro de leitura inválido.'));return;}
        if(data.event==='ready'){this.ready=true;this.configure();if(!this.ocr)this.ocr=new OcrReader();this.ocr.start();this.status('Shift + clique esquerdo ou botão central com o cursor sobre o item disponível no TERA.',data);return;}
        if(data.event==='health'){this.status(null,data);return;}
        if(data.event==='error'){this.failed=!this.ready;this.status(String(data.error),data);this.cancel();return;}
        if(data.event==='prepare'){
            if(!this.allowed(data)){if(Number.isSafeInteger(data.seq))child.stdin.write('skip '+data.seq+'\n');return;}
            if(!Number.isSafeInteger(data.seq)||data.seq<1||!Number.isFinite(data.x)||!Number.isFinite(data.y))return;
            if(this.active&&data.seq<=this.active.seq)return;
            this.cancel();const request=this.active={seq:data.seq,child};this.preparing=true;
            Promise.resolve().then(()=>this.current(request)?this.prepare(data):null).then(selection=>{
                if(!this.current(request))return;
                if(!this.allowed(data)){this.cancel();return;}this.plan={seq:data.seq,selection};child.stdin.write((selection&&selection.nativeId?'direct ':'capture ')+data.seq+'\n');
            }).catch(error=>{if(this.current(request)){this.cancel();this.status('Falha ao preparar o menu: '+String(error.message||error));}}).finally(()=>{if(this.current(request))this.preparing=false;});return;
        }
        const request=this.active;
        if(data.event!=='gesture'||!this.allowed(data)||this.reading||!this.current(request)||data.seq!==request.seq||!this.plan||data.seq!==this.plan.seq||!Number.isFinite(data.x)||!Number.isFinite(data.y))return;
        const selection=this.plan.selection;this.plan=null;
        if(data.nativeOnly===true?!(selection&&selection.nativeId):typeof data.image!=='string'){this.cancel();return;}
        this.reading=true;request.frame=data;
        Promise.resolve().then(()=>{
            if(!this.current(request)||!this.allowed(data))return;
            return this.gesture(data,(frame=data)=>{
                if(!this.current(request))throw Error('A leitura foi cancelada.');
                if(data.nativeOnly===true)throw Error('O ID nativo não precisa de leitura de imagem.');
                if(!this.ocr)this.ocr=new OcrReader();const reading=request.read=this.ocr.read(frame.image);
                const release=()=>{if(request.read===reading)request.read=null;};Promise.resolve(reading).then(release,release);return reading;
            },selection,()=>this.current(request)?this.resample(data.seq):Promise.reject(Error('A leitura foi cancelada.')));
        }).catch(error=>{if(this.current(request))this.status(String(error.message||error));}).finally(()=>{data.image='';if(data.fallbackFrame)data.fallbackFrame.image='';this.finish(request);});
    }
    resample(seq){if(!this.child||this.closed||!this.reading||!this.active||this.active.seq!==seq||this.retry)return Promise.reject(Error('A nova captura foi cancelada.'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.retry=null;reject(Error('A nova captura não respondeu.'));},1500);this.retry={seq,resolve,reject,timer};this.child.stdin.write('retry '+seq+'\n');});}
    stop(){this.cancel();if(this.child){this.child.kill();this.child=null;}if(this.ocr){this.ocr.close();this.ocr=null;}if(this.retry){clearTimeout(this.retry.timer);this.retry.reject(Error('A leitura foi cancelada.'));this.retry=null;}this.ready=false;this.reading=false;this.preparing=false;this.plan=null;this.buffer='';}
    close(){this.closed=true;this.stop();}
}
module.exports={Pointer,executeOcr,OcrReader};

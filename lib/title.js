'use strict';
const Content=require('./content');
const Properties=require('./tooltip-properties');
function normalize(text){return Content.cleanText(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
function cyanLine(line,pixels,width,height){const x=Math.max(0,Math.floor(line.x)),y=Math.max(0,Math.floor(line.y)),right=Math.min(width,Math.ceil(line.x+line.width)),bottom=Math.min(height,Math.ceil(line.y+line.height));let colored=0,lit=0;for(let row=y;row<bottom;row++)for(let col=x;col<right;col++){const p=(row*width+col)*4,b=pixels[p],g=pixels[p+1],r=pixels[p+2],bright=Math.max(r,g,b);if(bright>125)lit++;if(bright>150&&bright-Math.min(r,g,b)>55)colored++;}return colored>=8&&colored/Math.max(lit,1)>.35;}
function titleGrade(line,pixels,width,height){
    // Only the green (uncommon) and cyan (rare) title colors confirmed against
    // this client's item grades are used. Mixed, white and custom colors abstain.
    const x=Math.max(0,Math.floor(line.x)),y=Math.max(0,Math.floor(line.y)),right=Math.min(width,Math.ceil(line.x+line.width)),bottom=Math.min(height,Math.ceil(line.y+line.height));let lit=0,green=0,cyan=0;
    for(let row=y;row<bottom;row++)for(let col=x;col<right;col++){const p=(row*width+col)*4,b=pixels[p],g=pixels[p+1],r=pixels[p+2];if(Math.max(r,g,b)<=125)continue;lit++;if(g>125&&g-r>90&&g-b>90)green++;else if(b>160&&g>120&&b-r>90&&g-r>75)cyan++;}
    if(green>=16&&green/Math.max(lit,1)>.7)return 1;
    if(cyan>=16&&cyan/Math.max(lit,1)>.7)return 2;
    return null;
}
function stripCounter(text){return String(text).replace(/^(?:\(?\d{1,4}\)?\s+|[IlΙ]\s+)/u,'');}
function sameTitle(name,text){return normalize(name)===normalize(text)||normalize(name)===normalize(stripCounter(text));}
function nativeCandidate(last,point,now=Date.now(),distance=5){return Number.isFinite(distance)&&distance>0&&distance<=32&&last&&['hover','request'].includes(last.kind)&&last.point&&point&&Number.isFinite(last.time)&&now>=last.time&&now-last.time<=15000&&Math.hypot(last.point.x-point.x,last.point.y-point.y)<distance?Content.number(last.id):null;}
function panelAtPoint(lines,titles,cooldowns,point){
    if(!point)return null;
    const panels=[];
    for(const title of titles){
        const cooldown=cooldowns.filter(body=>body.y>title.y+title.height&&body.y-title.y<Math.max(700,title.height*65)&&Math.abs(body.x-title.x)<Math.max(24,title.height*2)).sort((a,b)=>a.y-b.y)[0];
        if(!cooldown)continue;
        const adjacent=titles.filter(other=>other!==title&&other.x>title.x&&Math.abs(other.y-title.y)<Math.max(title.height,other.height)*2).map(other=>other.x).sort((a,b)=>a-b)[0];
        const limit=Math.min(title.x+Math.max(700,title.width+30),adjacent===undefined?Infinity:adjacent-20);
        const below=titles.filter(other=>other!==title&&Math.abs(other.x-title.x)<Math.max(24,title.height*2)&&other.y>cooldown.y).map(other=>other.y).sort((a,b)=>a-b)[0];
        const bottomLimit=Math.min(cooldown.y+Math.max(100,cooldown.height*8),below===undefined?Infinity:below-20);
        const body=lines.filter(line=>line.y>=title.y&&line.y<=bottomLimit&&line.x>=title.x-12&&line.x<limit&&line.x+line.width<=limit);
        const right=Math.max(title.x+title.width,...body.map(line=>line.x+line.width))+20;
        const bottom=Math.max(cooldown.y+cooldown.height,...body.map(line=>line.y+line.height))+12;
        if(point.x>=title.x-14&&point.x<=right&&point.y>=title.y-10&&point.y<=bottom)panels.push({title,left:title.x-14,right,top:title.y-10,bottom});
    }
    return panels.length===1?panels[0]:null;
}
function headings(ocr,image,point=null){
    const size=image.getSize();if(ocr.width!==size.width||ocr.height!==size.height)throw Error('A imagem e a leitura têm resoluções diferentes.');
    const pixels=image.toBitmap(),all=(ocr.lines||[]).filter(line=>typeof line.text==='string'&&line.text.length>=4&&line.text.length<=250&&[line.x,line.y,line.width,line.height].every(Number.isFinite)&&line.width>0&&line.height>0);
    // Tolerate OCR mistakes only in structural labels, never in the item name.
    const levels=all.filter(line=>/^(?:for[li1]eve[li1t]|required[li1]eve[li1t]|paranivel|nivelrequerido)/.test(normalize(line.text)));
    const cooldowns=all.filter(line=>/^(?:cooldown|tempoderecarga|tiempodereutilizacion)/.test(normalize(line.text)));
    const near=line=>!point||(Math.abs(line.x-point.x)<=Math.max(700,Math.min(1800,line.height*64))&&line.y>=point.y-Math.max(800,Math.min(1800,line.height*75))&&line.y<=point.y+Math.max(120,line.height*10));
    const qualified=all.filter(line=>near(line)&&levels.some(body=>body.y>line.y+line.height&&body.y-line.y<Math.max(110,line.height*10)&&body.x>=line.x-Math.max(15,line.height*2)&&body.x-line.x<Math.max(120,line.height*12)));
    const colored=all.filter(line=>near(line)&&cyanLine(line,pixels,size.width,size.height)&&(!point||cooldowns.some(body=>body.y>line.y+line.height&&body.y-line.y<Math.max(700,line.height*65)&&Math.abs(body.x-line.x)<Math.max(130,line.height*12))||(line.x>=point.x-40&&line.x<=point.x+600&&Math.abs(line.y-point.y)<55)));
    let lines=[...new Set([...qualified,...colored])];
    const target=panelAtPoint(all,qualified.filter(line=>cyanLine(line,pixels,size.width,size.height)),cooldowns,point);
    if(target)lines=lines.filter(line=>line===target.title||(Math.abs(line.x-target.title.x)<Math.max(12,target.title.height)&&line.y>target.title.y&&line.y-target.title.y<target.title.height*2));
    const candidates=lines.map(line=>{const propertyRead={};return {text:line.text,x:line.x,y:line.y,grade:titleGrade(line,pixels,size.width,size.height),properties:Properties.header(all,pixels,size.width,size.height,line,propertyRead),propertyRead};});
    for(const first of lines)for(const next of lines)if(next!==first&&Math.abs(next.x-first.x)<Math.max(12,first.height)&&next.y>first.y&&next.y-first.y<first.height+Math.max(12,first.height)){const grade=titleGrade(first,pixels,size.width,size.height);candidates.push({text:first.text+' '+next.text,x:first.x,y:first.y,grade:grade===titleGrade(next,pixels,size.width,size.height)?grade:null});}
    return candidates;
}
class TitleIndex {
    constructor(items){this.byName=new Map();for(const [id,item] of items||[]){const key=normalize(item.name||item.string);if(!key||!Content.number(id))continue;const group=this.byName.get(key)||[];group.push(Number(id));this.byName.set(key,group);}}
    find(heading){return this.byName.get(normalize(heading))||this.byName.get(normalize(stripCounter(heading)))||[];}
    match(candidates){const found=candidates.map(line=>({...line,ids:this.find(line.text)})).filter(line=>line.ids.length);const groups=new Map();for(const line of found){const key=JSON.stringify(line.ids.slice().sort((a,b)=>a-b));if(!groups.has(key))groups.set(key,line);}if(groups.size!==1)throw Object.assign(Error(groups.size?'Mais de um título de item foi encontrado; aproxime o mouse da caixa para exibir só seu tooltip.':'Não consegui identificar com segurança o título do tooltip. Deixe-o visível e tente Ctrl ou botão central com o cursor sobre a caixa novamente.'),{code:groups.size?'AMBIGUOUS_TITLE':'NO_ITEM_TITLE'});const result=[...groups.values()][0];if(new Set(found.filter(line=>line.properties).map(line=>normalize(line.properties.text))).size>1)result.properties=null;return result;}
}
async function resolve(match,{provider,character,rewards=[],ocrLines=[],nativeId=null,isCurrent=()=>true,onDecision=()=>{}}){
    let ids=match.ids.slice();
    if(nativeId&&ids.includes(nativeId))ids=[nativeId];
    else if(ocrLines.some(line=>/tera.*rewards.*emporium/i.test(line.text||''))){const available=ids.filter(id=>rewards.includes(id));if(available.length)ids=available;}
    let colorMatched=false;
    if(ids.length>1&&[1,2].includes(match.grade)){
        if(ids.length>64)throw Error('Muitos itens têm esse nome; não foi possível identificar a caixa com segurança.');
        const metadata=await provider.metadata(ids);if(!isCurrent())throw Error('A consulta foi cancelada.');
        const qualified=metadata.filter(item=>item.grade===match.grade&&sameTitle(item.name,match.text)).map(item=>item.id);
        if(qualified.length){ids=qualified;colorMatched=true;}
    }
    if(ids.length>8)throw Error('Muitos itens têm esse nome; não foi possível identificar a caixa com segurança.');
    let propertyMatched=false;
    if(ids.length>1&&match.properties&&typeof provider.tooltipLabels==='function'){
        const metadata=await provider.metadata(ids),labels=await provider.tooltipLabels();if(!isCurrent())throw Error('A consulta foi cancelada.');
        const evidence=Properties.classify(match.properties,labels);
        const decision={stage:'tooltip-properties',ids:ids.slice(),labelIds:Object.keys(labels||{}),headerClassified:!!evidence,missingMetadata:metadata.filter(item=>!item.tooltipFlags).map(item=>item.id)};onDecision(decision);
        if(evidence&&metadata.every(item=>item.tooltipFlags&&sameTitle(item.name,match.text))){
            const qualified=metadata.filter(item=>Properties.matches(item,evidence)).map(item=>item.id);
            onDecision({...decision,acceptedIds:qualified});
            if(!qualified.length)throw Error('Há caixas com esse mesmo nome sem conteúdo inequívoco. O cliente não forneceu um ID seguro para este tooltip.');
            ids=qualified;propertyMatched=true;
        }
    }
    const previews=[];for(const id of ids){if(!isCurrent())throw Error('A consulta foi cancelada.');previews.push(await provider.preview(id,character));}
    if(previews.some(result=>!sameTitle(result.box.name,match.text)))throw Error('O nome recebido não corresponde ao título do cliente; a prévia foi interrompida.');
    const fingerprint=result=>JSON.stringify({complete:result.complete,unsupported:result.unsupported,entries:result.entries.map(item=>[item.id,item.amount,item.rule]).sort((a,b)=>a[0]-b[0])});
    if(new Set(previews.map(fingerprint)).size!==1||ids.length>1&&previews.some(p=>!p.complete))throw Error('Há caixas com esse mesmo nome sem conteúdo inequívoco. O cliente não forneceu um ID seguro para este tooltip.');
    const result=previews[0];if(!result)throw Error('Nenhum item foi identificado.');result.identification={title:match.text,ids,exactId:ids.length===1,...(colorMatched?{grade:match.grade,source:'Nome e qualidade do tooltip / cliente'}:{}),...(propertyMatched?{propertiesMatched:true,source:'Nome e propriedades completas do tooltip / cliente'}:{})};return result;
}
module.exports={normalize,cyanLine,titleGrade,headings,stripCounter,sameTitle,nativeCandidate,TitleIndex,resolve};

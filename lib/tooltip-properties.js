'use strict';
const normalize=text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const red=(pixels,p)=>pixels[p+2]>=150&&pixels[p+2]-pixels[p+1]>85&&pixels[p+2]-pixels[p]>85;
function panelRight(lines,pixels,width,title,level,top,bottom,limit){
 const textRight=Math.max(title.x+title.width,level.x+level.width,...lines.filter(line=>line.y>level.y&&line.y<level.y+200&&Math.abs(line.x-title.x)<18).map(line=>line.x+line.width));
 const ys=Array.from({length:8},(_,i)=>Math.round(top+(bottom-top-1)*i/7));
 for(let x=Math.ceil(textRight+3);x<limit;x++){
  const samples=ys.map(y=>{const p=(y*width+x)*4;return [pixels[p+2],pixels[p+1],pixels[p]];}),mean=[0,1,2].map(c=>samples.reduce((sum,row)=>sum+row[c],0)/8);
  if(mean[2]-mean[0]<35||mean[1]-mean[0]<15||samples.some(row=>row.some((value,c)=>Math.abs(value-mean[c])>14)))continue;
  if(ys.every((y,i)=>{const p=(y*width+x-3)*4;return Math.max(Math.abs(samples[i][0]-pixels[p+2]),Math.abs(samples[i][1]-pixels[p+1]),Math.abs(samples[i][2]-pixels[p]))>=18;}))return x;
 }
 return null;
}
// Only a complete, visibly covered restriction block is evidence. Missing words
// or a cropped line must not turn a non-trade item into a tradeable item.
function header(lines,pixels,width,height,title,trace={}){
 const reject=reason=>{trace.reason=reason;return null;};
 const levels=lines.filter(line=>/^(?:for[li1]eve[li1t]|required[li1]eve[li1t]|paranivel|nivelrequerido)/.test(normalize(line.text))&&line.y>title.y+title.height&&line.y<title.y+120&&line.x>title.x+30&&line.x<title.x+160);
 if(levels.length!==1)return reject('level-anchor');const level=levels[0];
 const bodies=lines.filter(line=>line.y>level.y+level.height+15&&line.y<level.y+200&&Math.abs(line.x-title.x)<18&&line.width>100).sort((a,b)=>a.y-b.y);
 if(!bodies.length)return reject('description-anchor');
 const left=Math.floor(level.x-4),limit=Math.min(width-2,Math.ceil(level.x+Math.max(500,title.width*2))),top=Math.floor(level.y+level.height+1),bottom=Math.floor(bodies[0].y-5);
 if(left<2||top<2||bottom>=height-2||bottom<=top||bottom-top>160)return reject('cropped-header');
 const border=panelRight(lines,pixels,width,title,level,top,bottom,limit),right=border===null?limit:border;
 trace.bounds={left,right,top,bottom,border};
 const candidates=lines.filter(line=>line.x>=left&&line.x+line.width<=right&&line.y>=top&&line.y+line.height<=bottom);
 const selected=candidates.filter(line=>{let colored=0,lit=0;for(let y=Math.floor(line.y);y<line.y+line.height;y++)for(let x=Math.floor(line.x);x<line.x+line.width;x++){const p=(y*width+x)*4;if(Math.max(pixels[p],pixels[p+1],pixels[p+2])>125)lit++;if(red(pixels,p))colored++;}return colored>=12&&colored/Math.max(lit,1)>.65;}).sort((a,b)=>a.y-b.y||a.x-b.x);
 if(!selected.length||selected.length>4||Math.abs(selected[0].x-level.x)>4||selected[0].y-top>level.height+8)return reject('incomplete-restriction-lines');
 for(let i=1;i<selected.length;i++)if(Math.abs(selected[i].x-level.x)>5||selected[i].y-selected[i-1].y>selected[i-1].height*2+8)return reject('disconnected-restriction-lines');
 let uncovered=0,covered=0;
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(red(pixels,(y*width+x)*4)){
  if(selected.some(line=>x>=line.x-2&&x<=line.x+line.width+2&&y>=line.y-2&&y<=line.y+line.height+2))covered++;else uncovered++;
 }
 trace.covered=covered;trace.uncovered=uncovered;
 if(covered<20||uncovered>3||selected.some(line=>line.x+line.width>=(border===null?width-5:right-2)||/\.\.\.|…/.test(line.text)))return reject('unread-restriction-pixels');
 trace.reason='complete';
 return {text:selected.map(line=>line.text).join(' '),complete:true};
}
function combinations(parts){if(!parts.length)return [''];return parts.flatMap((part,i)=>combinations(parts.filter((_,j)=>i!==j)).map(tail=>part+tail));}
function classify(evidence,labels){
 if(!evidence||evidence.complete!==true||!labels)return null;
 const sale=normalize(labels['$101065']),trade=normalize(labels['$101072']),guild=normalize(labels['$102197']);
 if(!sale||!trade||!guild||new Set([sale,trade,guild]).size!==3)return null;
 const text=normalize(evidence.text);
 for(const tradable of [false,true])if(combinations(tradable?[sale,guild]:[trade,sale,guild]).includes(text))return {tradable};
 return null;
}
function matches(item,evidence){
 const flags=item.tooltipFlags;
 return !!(flags&&flags.tradable===evidence.tradable&&flags.sellPrice===0&&flags.guildWarehouseStorable===false&&flags.warehouseStorable===true&&flags.boundType==='none');
}
module.exports={header,classify,matches};

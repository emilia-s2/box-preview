'use strict';
const {normalize}=require('./title');
const finite=line=>['x','y','width','height'].every(key=>Number.isFinite(line[key]));
function cluster(values,tolerance){const groups=[];for(const value of [...values].sort((a,b)=>a-b)){let group=groups.find(g=>Math.abs(value-g[0])<=tolerance);if(!group){group=[];groups.push(group);}group.push(value);}return groups.map(g=>g.reduce((sum,x)=>sum+x,0)/g.length);}
// Bind an existing server-provided slot to its visible grid position; never invent an ID.
function locate(ocr,frame,records){
 const lines=(ocr.lines||[]).filter(finite),header=lines.find(line=>/tera/i.test(line.text)&&/(rewards|recompensas)/i.test(line.text));if(!header||!Array.isArray(records)||!records.length)return null;
 const buttons=lines.filter(line=>/^(purchase|purchased|sold out|comprar|comprado|agotado|esgotado)$/i.test(String(line.text||'').trim()));if(buttons.length<6)return null;
 const columns=cluster(buttons.map(b=>b.x),20),rows=cluster(buttons.map(b=>b.y),20);if(columns.length!==2||rows.length!==5)return null;
 const gap=columns[1]-columns[0],step=(rows[4]-rows[0])/4;if(gap<100||step<40||step>300||rows.some((y,i)=>i&&Math.abs(y-rows[i-1]-step)>step*.25))return null;
 if(header.y>=rows[0]-25||Math.abs(header.x+header.width/2-(columns[0]+columns[1])/2)>gap)return null;
 const x=frame.x-frame.left,y=frame.y-frame.top,candidates=[];
 for(let row=0;row<5;row++)for(let col=0;col<2;col++){
  const rect={x:columns[col]-gap*.78,right:columns[col]+gap*.22,y:rows[row]-step*.65,bottom:rows[row]+step*.22};
  if(x<rect.x||x>columns[col]-gap*.3||y<rect.y||y>rect.bottom)continue;
  const slot=row*2+col+1,record=records.find(r=>r.slot===slot);if(!record)continue;
  const captions=lines.filter(line=>line.x>=rect.x&&line.x<columns[col]&&line.y>=rect.y&&line.y<rows[row]-step*.08).map(line=>line.text);
  candidates.push({id:record.id,slot,captions});
 }
 return candidates.length===1?candidates[0]:null;
}
function captionMatches(name,captions){const expected=normalize(name);return captions.some(caption=>{const text=normalize(caption);return text.length>=Math.min(12,expected.length)&&expected.startsWith(text);});}
module.exports={locate,captionMatches};

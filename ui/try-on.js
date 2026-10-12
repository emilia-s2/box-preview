'use strict';
window.TryOnButton={create(entry,state,send){
    if(!entry.canTryOn)return null;
    const button=document.createElement('button'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),outline=document.createElementNS(svg.namespaceURI,'path'),pupil=document.createElementNS(svg.namespaceURI,'circle');
    button.type='button';button.className='try-on';button.disabled=state.busy;
    const label=window.UIText.t('Experimentar {name} no personagem',{name:entry.name});button.title=label;button.setAttribute('aria-label',label);
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');outline.setAttribute('d','M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');pupil.setAttribute('cx','12');pupil.setAttribute('cy','12');pupil.setAttribute('r','3');svg.append(outline,pupil);button.append(svg);
    button.onclick=()=>{button.disabled=true;send('try-on',{id:entry.id,boxId:state.preview.box.id,token:state.previewToken});};return button;
}};

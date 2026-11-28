export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const button=(label,action,{primary=false,disabled=false,extra='',cls=''}={})=>`<button type="button" class="${primary?'primary ':''}${cls}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${esc(label)}</button>`;
export const options=(values,selected)=>values.map((v,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(v)}</option>`).join('');
export const check=(id,label,checked,disabled=false)=>`<label class="check"><input type="checkbox" id="${id}" ${checked?'checked':''} ${disabled?'disabled':''}>${esc(label)}</label>`;
export const masked=s=>`•••• ${esc(s.slice(-4))}`;

const stateLabel={queued:'Ready',processing:'Processing',pending:'Pending',complete:'Complete',error:'Error',duplicate:'Duplicate',other:'Unknown'};
export function workspaceRecordList(rows,index,action,history=false,rewards=false,revealedReward=null,queueRemoval=false){
 const total=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(index,total-1);
 const items=rows.slice(current*25,current*25+25).map((r,i)=>{
   const revealed=rewards&&revealedReward?.index===r.index;
   return '<li class="row spread"><span class="mono">'+(r.last4===null?'Unavailable':'•••• '+esc(r.last4))+'</span>'+
     (rewards?'<span>'+(r.value===null?'Value unavailable':'CAD $'+esc(r.value))+'</span>'+button(revealed?'Hide':'Reveal','toggleReward',{extra:'data-value="'+r.index+'" aria-label="'+(revealed?'Hide':'Reveal')+' reward '+(r.index+1)+'" aria-expanded="'+!!revealed+'"'})+
       (revealed?'<div class="full stack"><span>Merchant: '+esc(revealedReward.merchant)+'</span><span class="mono">Card: '+esc(revealedReward.number)+'</span><span class="mono">PIN: '+esc(revealedReward.pin)+'</span></div>':'')
       :history?'':'<span>'+esc(stateLabel[r.state])+'</span>'+
       (queueRemoval&&r.state==='queued'&&r.last4!==null?button('Review removal','reviewRemoval',{extra:'data-value="'+(current*25+i)+'" aria-label="Review removal of queue entry '+(current*25+i+1)+' ending '+esc(r.last4)+'"'}):''))+'</li>';
 }).join('');
 return '<ul class="list">'+items+'</ul>'+(total>1?'<div class="row spread">'+button('Previous',action,{disabled:current===0,extra:'data-value="'+(current-1)+'"'})+'<span>'+(current+1)+'/'+total+'</span>'+button('Next',action,{disabled:current===total-1,extra:'data-value="'+(current+1)+'"'})+'</div>':'');
}

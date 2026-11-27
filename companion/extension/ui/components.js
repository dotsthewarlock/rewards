export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const button=(label,action,{primary=false,disabled=false,extra='',cls=''}={})=>`<button type="button" class="${primary?'primary ':''}${cls}" data-action="${esc(action)}" ${disabled?'disabled':''} ${extra}>${esc(label)}</button>`;
export const options=(values,selected)=>values.map((v,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(v)}</option>`).join('');
export const check=(id,label,checked,disabled=false)=>`<label class="check"><input type="checkbox" id="${id}" ${checked?'checked':''} ${disabled?'disabled':''}>${esc(label)}</label>`;
export const masked=s=>`•••• ${esc(s.slice(-4))}`;

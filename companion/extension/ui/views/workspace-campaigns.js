import {esc,button} from '../components.js';
// Catalog state is rendered, never retrieved or promoted to workflow authority.
function catalogView({recording,catalog,catalogBusy,catalogError,now}){
 if(!recording)return '<p>Public directory refresh requires the extension.</p>';
 const c=catalog;
 const restricted=c?.outcome==='restricted';
 const rateLimited=c?.outcome==='rate-limited',interrupted=c?.outcome==='checking';
 const age=now-Date.parse(c?.checkedAt);
 const current=!catalogBusy&&!catalogError&&c?.outcome==='verified-directory'&&age>=0&&age<=86400000;
 return '<section class="surface stack"><h3>Canadian public catalog</h3><p>Manual directory check only. No claims, verified terms or stock inferred.</p>'+
 button('Refresh public directory','refreshCatalog',{disabled:catalogBusy||restricted||rateLimited||interrupted})+
 '<p role="status">'+esc(catalogBusy?'Checking…':catalogError?'Catalog unavailable; prior evidence retained.':restricted?'Access restricted. Further checks stopped.':rateLimited?'Rate limited. Further checks stopped.':interrupted?'Previous check interrupted or unverified. Further checks stopped.':c?.checkedAt?(current?'Directory checked ':'Stale or unavailable · last check ')+c.checkedAt:'Not yet checked')+'</p>'+
 (c?.entries?.length?'<ul class="list">'+c.entries.map(e=>'<li><strong>'+esc(e.campaign)+'</strong><p>'+esc(current&&e.listed?'Listed at last check':'Previously seen · stale')+' · Terms, availability and workflow compatibility unknown</p><p>Last seen: '+esc(e.lastSeen)+'</p></li>').join('')+'</ul>':'<p>No observed identities stored.</p>')+
 '<a href="https://getmybonus.ca/" target="_blank" rel="noopener noreferrer">Official directory</a></section>';
}

export function workspaceCampaignsView({cp,recording=true,catalog=null,catalogBusy=false,catalogError=false,now=Date.now()}){
 let body='';
   body='<h2>Campaigns</h2>'+(cp?'<section class="surface"><strong>'+esc(cp.name)+'</strong><p>'+esc(cp.products.join(' / '))+'</p><p>'+esc(cp.rewards.join(' / '))+'</p><p>Published claim deadline: '+esc(cp.deadline)+'</p>'+(cp.note?'<p>'+esc(cp.note)+'</p>':'')+'</section>':'<p>No recognized campaign metadata.</p>')+'<p>Recognition is structural evidence only, not verified eligibility or stock.</p>'+catalogView({recording,catalog,catalogBusy,catalogError,now});

 return body;
}

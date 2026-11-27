import {esc,button,workspaceRecordList} from '../components.js';
// Only masked records by default. The controller supplies one temporary reveal.
export function workspaceRewardsView({state,browseTab='cards',browseSearch='',rewardPage=0,historyPage=0,revealedReward=null}){
 const summary=state?.summary,details=state?.details;
 let body='';
   body='<h2>Rewards</h2><p>'+(summary?.ok?summary.rewards+' legacy gift-card records · '+summary.history+' redemption history records':'No connected cache')+'</p><p>Pending claims are not counted as captured rewards. Existing legacy records are not independently verified. Reveal and export show private saved reward details. Reveal displays one current record for 30 seconds. Keep the workspace and exports private.</p>' + button('Download CSV','rewardCSV',{disabled:!summary?.rewards||!state?.target}) + button('Copy TSV','rewardTSV',{disabled:!summary?.rewards||!state?.target}) + '';
   if(details?.ok){
     const cards=browseTab==='cards',rows=cards?details.rewards.map((r,index)=>({...r,index})):details.history;
     const filtered=rows.filter(r=>!browseSearch||r.last4?.toUpperCase().includes(browseSearch.toUpperCase()));
     body+='<section class="surface stack"><div class="row" role="group" aria-label="Browse records">'+
       button('Saved rewards','browseTab',{extra:'data-value="cards" aria-pressed="'+cards+'"',primary:cards})+
       button('Redemption history','browseTab',{extra:'data-value="history" aria-pressed="'+!cards+'"',primary:!cards})+
       '</div><label for="browseSearch">Find by ending digits or characters</label><input id="browseSearch" type="text" maxlength="4" autocomplete="off" value="'+esc(browseSearch)+'"><p role="status">'+filtered.length+' of '+rows.length+' records</p>'+
       (filtered.length?workspaceRecordList(filtered,cards?rewardPage:historyPage,cards?'rewardPage':'historyPage',!cards,cards,revealedReward):'<p>No matching records.</p>')+'</section>';
   }

 return body;
}

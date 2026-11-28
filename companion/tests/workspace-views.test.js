import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceQueueView} from '../extension/ui/views/workspace-queue.js';
import {workspaceRewardsView} from '../extension/ui/views/workspace-rewards.js';
import {workspaceCampaignsView} from '../extension/ui/views/workspace-campaigns.js';
import {workspaceSettingsView} from '../extension/ui/views/workspace-settings.js';
import {campaignById} from '../extension/core/campaigns.js';
const cp=campaignById('CA1126VANW');
function fixture(){
 return {ok:true,target:{},report:{stage:'entry',controls:{submit:{actionable:1,present:1,visible:1}}},summary:{ok:true,queue:{queued:1,complete:0,pending:0,duplicate:0,error:0},rewards:2,history:1,emailConfigured:true,clipboard:false,unresolved:false},details:{ok:true,queue:[{last4:'0001',state:'queued'}],history:[{last4:'0002'}],rewards:[{last4:'1234',value:'15.00'},{last4:'5678',value:'10.00'}]},diagnostics:{enabled:true,count:1,eventCount:2,blocked:false}};
}
test('queue view keeps unresolved state, explicit review and draft gates distinct',()=>{
 const state=fixture(),ready=workspaceQueueView({state,cp,draft:'fixture'});
 assert.match(ready,/1 ready/);assert.match(ready,/Prepare next redemption/);assert.match(ready,/Review final claim/);assert.doesNotMatch(ready,/Authorize reviewed claim/);
 state.summary.unresolved=true;
 const pending=workspaceQueueView({state,cp,draft:'fixture'});
 assert.match(pending,/No replay or advancement/);assert.match(pending,/data-action="addQueue" disabled/);assert.doesNotMatch(pending,/Review final claim/);
 state.summary.unresolved=false;
 const reviewed={confirmed:false,review:{product:'Fixture',reward:'Fixture reward',valueRecent:'15.00',code:'000000000000000000000000000001',email:'fixture@example.invalid',attemptId:'fixture'}};
 assert.match(workspaceQueueView({state,cp,reviewed}),/data-action="authorizeFinal" disabled/);
 assert.doesNotMatch(workspaceQueueView({state,cp,reviewed:{...reviewed,confirmed:true}}),/data-action="authorizeFinal" disabled/);
});
test('record views paginate 999 rows and render only explicitly selected reward credentials',()=>{
 const state=fixture();state.details.queue=Array.from({length:999},()=>({last4:'0001',state:'queued'}));
 const first=workspaceQueueView({state,cp});
 assert.equal((first.match(/<li class="row spread">/g)||[]).length,25);assert.match(first,/1\/40/);
 const last=workspaceQueueView({state,cp,page:39});assert.equal((last.match(/<li class="row spread">/g)||[]).length,24);
 const revealedReward={index:1,merchant:'Fixture',number:'SYNTHETIC_REVEAL',pin:'0000'};
 assert.doesNotMatch(workspaceRewardsView({state}),/SYNTHETIC_REVEAL/);
 const shown=workspaceRewardsView({state,revealedReward});assert.equal((shown.match(/SYNTHETIC_REVEAL/g)||[]).length,1);
 assert.doesNotMatch(workspaceRewardsView({state,revealedReward,browseSearch:'1234'}),/SYNTHETIC_REVEAL/);
});
test('campaign and diagnostic views distinguish capability, restriction, staleness and retention',()=>{
 const now=Date.UTC(2026,10,27),catalog={outcome:'verified-directory',checkedAt:new Date(now).toISOString(),entries:[{campaign:'CA1126VANW',listed:true,lastSeen:new Date(now).toISOString()}]};
 assert.match(workspaceCampaignsView({cp,catalog,now}),/Listed at last check/);
 assert.match(workspaceCampaignsView({cp,catalog,now:now+86400001}),/Previously seen · stale/);
 assert.match(workspaceCampaignsView({cp,catalog:{...catalog,outcome:'restricted'},now}),/data-action="refreshCatalog" disabled/);
 assert.doesNotMatch(workspaceCampaignsView({cp,recording:false}),/data-action="refreshCatalog"/);
 const state=fixture();assert.match(workspaceSettingsView({state}),/2\/2000 events/);
 state.diagnostics.blocked=true;assert.match(workspaceSettingsView({state}),/data-action="captureDiagnostics" disabled/);
 assert.doesNotMatch(workspaceSettingsView({state,recording:false}),/data-action="captureDiagnostics"/);
});

test('ambiguous product/reward choice remains visible and cannot enter final review',()=>{const state=fixture(),multiple=campaignById('CA1126PZFT');const html=workspaceQueueView({state,cp:multiple});assert.match(html,/Multiple product or reward choices/);assert.doesNotMatch(html,/Review final claim|Prepare next redemption/);assert.match(workspaceCampaignsView({cp:campaignById('CA1126DTZFT')}),/Avondale participation inferred/);assert.match(workspaceRewardsView({state}),/Pending claims are not counted/);});

test('queue removal confirmation masks the exact reviewed entries and separates cancellation from mutation',()=>{
 const state=fixture();state.details.queueSnapshot='snapshot';state.details.queueBlock=null;
 const ready=workspaceQueueView({state,cp});
 assert.match(ready,/Review removal of queue entry 1 ending 0001/);assert.match(ready,/Review safe removals/);
 const html=workspaceQueueView({state,cp,removal:{rows:[{index:0,last4:'0001'}],retained:2}});
 assert.match(html,/Confirm queue removal/);assert.match(html,/Entry 1/);assert.match(html,/Confirm removal/);assert.match(html,/Cancel removal/);
 assert.doesNotMatch(html,/Authorize reviewed claim|Prepare next redemption|Add to queue/);
 state.summary.unresolved=true;state.details.queueBlock='pending';
 const blocked=workspaceQueueView({state,cp});
 assert.match(blocked,/Absence of confirmation does not prove failure/);assert.doesNotMatch(blocked,/Review safe removals/);
});

test('diagnostic guidance explains observed stages, unavailable fields and coverage without inferring outcomes',()=>{
 const state=fixture();Object.assign(state.report,{status:'recognized',campaign:'CA1126VANW',labels:['Submit']});
 state.report.controls={serial:{present:1,visible:0,actionable:0},submit:{present:1,visible:1,actionable:1},errors:{present:1,visible:0,actionable:0}};
 state.diagnostics.issue='diagnostics-write-unverified';
 const html=workspaceSettingsView({state});
 assert.match(html,/Submit control available/);assert.match(html,/Barcode field is hidden/);
 assert.match(html,/does not mean an error occurred/);assert.match(html,/could not be confirmed in storage/);
 assert.match(html,/does not guarantee complete coverage or disable claim controls/);
 assert.match(html,/leave Companion form, queue and claim actions alone/);
 assert.match(html,/first observed time/);assert.match(html,/unknown or mixed build identities/);
 assert.match(html,/How to collect useful evidence/);
 state.diagnostics.enabled=null;
 const unknown=workspaceSettingsView({state});
 assert.match(unknown,/Recording setting unknown/);assert.match(unknown,/data-action="captureDiagnostics" disabled/);
 const bm=workspaceSettingsView({state,recording:false});
 assert.match(bm,/Current document only/);assert.doesNotMatch(bm,/id="diagnosticsEnabled"/);
});
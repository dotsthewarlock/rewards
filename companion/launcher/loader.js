(async () => {
  'use strict';
  const ROOT = new URL('https://dotsthewarlock.github.io/rewards/');
  const BASE = 'companion/launcher/';
  const busy = () => document.getElementById('bsp') || document.getElementById('rewards-companion-dev') || window.__BS_REWARDS__;
  if (busy()) return;
  const key = Symbol.for('rewards.companion.launcher.ui');
  if (window[key]) return;
  if (window.top !== window || !window.isSecureContext || !crypto.subtle || !document.documentElement) throw Error('Unsupported launch context');
  const host = document.createElement('div');
  const root = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = [
    ':host{all:initial;color-scheme:light dark}',
    'dialog{box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border:1px solid #79747e;border-radius:28px;background:#f7f7fc;color:#191b20;font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 32px #0003}',
    'dialog::backdrop{background:#0006}',
    'h2{font-size:22px;line-height:1.3;font-weight:500;margin:0 0 8px}',
    'p{margin:0 0 12px;overflow-wrap:anywhere}',
    'button{box-sizing:border-box;min-height:48px;width:100%;border-radius:24px;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;cursor:pointer}',
    'button:focus-visible{outline:3px solid #1759a8;outline-offset:3px}',
    '.open{background:#2459a5;color:white;border:1px solid transparent;min-height:64px;overflow-wrap:anywhere;margin:4px 0}',
    '.dev{background:#dce6f8;color:#233b60;border:1px solid transparent;margin-top:8px}',
    '.cancel{background:transparent;color:inherit;border:0;margin-top:8px}',
    'button:disabled{opacity:.55;cursor:default}[hidden]{display:none!important}summary{box-sizing:border-box;cursor:pointer;min-height:48px;padding:14px 0}summary:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
    '.meta{font-size:12px;margin:4px 0 8px;color:inherit}#loader-status{margin:12px 0 0}.report{display:flex;align-items:center;min-height:48px;color:inherit;text-decoration:underline}.report:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
    '@media(prefers-color-scheme:dark){dialog{background:#21232b;color:#e4e6f0}.open{background:#b1c5ff;color:#082e68}.dev{background:#354865;color:#e1e9ff}button:focus-visible{outline-color:#b1c5ff}}',
    '@media(forced-colors:active){button{border:1px solid ButtonText}button:focus-visible{outline:3px solid Highlight}}'
  ].join('\n');
  const dialog = document.createElement('dialog');
  const add = (tag,text,cls,parent=dialog) => {const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
  const title=add('h2','Rewards Companion');title.id='loader-title';title.tabIndex=-1;title.setAttribute('autofocus','');dialog.setAttribute('aria-labelledby',title.id);
  const description=add('p','Regular v15 is the original production version and may start or resume your rewards. Close other rewards tools first. If a claim is unfinished or uncertain, do not switch versions.');description.id='loader-description';dialog.setAttribute('aria-describedby',description.id);
  const stable=add('button','Open Regular','open'),dev=add('button','Open Preview','open');
  const meta=add('p','For testing only. Do not use for real claims.','meta');meta.id='loader-dev';dev.setAttribute('aria-describedby',meta.id);
  const more=add('details','');more.hidden=true;add('summary','More testing options','',more);
  const test=add('button','Test','dev',more),purpose=add('p','','meta',more);purpose.id='loader-test';test.setAttribute('aria-describedby',purpose.id);
  const status=add('p','Finding available versions...');status.id='loader-status';status.setAttribute('role','status');status.setAttribute('aria-atomic','true');
  const retry=add('button','Retry','dev');retry.hidden=true;retry.setAttribute('aria-describedby',status.id);
  const cancel=add('button','Cancel','cancel');
  const help=add('details','');add('summary','Help & version details','',help);
  const versions=add('p','Versions not yet available.','meta',help);
  const diagnostic=add('p','','meta',help);diagnostic.hidden=true;
  add('p','Reports are public and may require a GitHub account. Never include reward codes, card numbers, PINs, email addresses or screenshots with personal information.','meta',help);
  const report=add('a','Report a problem','report',help);
  report.href='https://github.com/dotsthewarlock/rewards/issues/new';report.target='_blank';report.rel='noopener noreferrer';report.referrerPolicy='no-referrer';
  for(const button of [stable,dev,test,retry,cancel])button.type='button';
  const previous=document.activeElement;
  let manifest=null, current=null, closed=false, complete;
  const done=new Promise(resolve=>{complete=resolve;});
  const valid=c=>c && typeof c.path==='string' && typeof c.sha256==='string' && /^[a-f0-9]{64}$/.test(c.sha256);
  const candidate=(c,grade)=>valid(c)&&typeof c.version==='string'&&new RegExp('^\\d+\\.\\d+\\.\\d+-'+grade+'-[a-f0-9]{12}$').test(c.version)&&(c.path===BASE+'releases/'+c.version+'.js'||c.path===BASE+'releases/'+c.version+'/rewards-companion-'+c.version+'-bookmarklet.js');
  const stableOK=c=>valid(c)&&c.version==='15'&&c.path==='redeem/Redeem_Prepaid_Rewards_v15.js'&&c.sha256==='23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1';
  const testOK=c=>candidate(c,'test')&&c.mode==='read-only'&&typeof c.purpose==='string'&&c.purpose.trim().length>0&&c.purpose.length<=120;
  // Previous source verification is informational only; never selection or execution authority.
  const preferenceKey='rewards.companion.launcher.preference.v1';
  const identity=(channel,c)=>({schema:1,channel,version:c.version,sha256:c.sha256});
  const same=(a,b)=>a?.version===b?.version&&a?.sha256===b?.sha256;
  let previousVerified=null;
  try{
    const raw=localStorage.getItem(preferenceKey);
    if(raw&&raw.length<=256){
      const p=JSON.parse(raw);
      if(p?.schema===1&&Object.keys(p).length===4&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256)&&
         ((p.channel==='stable'&&p.version==='15')||(p.channel==='dev'&&typeof p.version==='string'&&/^\d+\.\d+\.\d+-dev-[a-f0-9]{12}$/.test(p.version))))previousVerified=p;
    }
  }catch{}
  const recordVerification=(grade,c)=>{if(grade==='test')return;try{const raw=JSON.stringify(identity(grade,c));if(raw.length<=256)localStorage.setItem(preferenceKey,raw);}catch{}};
  const eligible=(value,grade)=>grade==='stable'?stableOK(value?.stable):grade==='dev'?candidate(value?.dev,'dev'):testOK(value?.test);
  const get=async(path,controller)=>{
    const url=new URL(path,ROOT);
    if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.search||url.hash)throw Error('Invalid URL');
    const response=await fetch(url.href,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error('HTTP '+response.status);return response;
  };
  const available=()=>{
    // After a failure, Retry must recheck the manifest; direct Open cannot bypass it.
    const blocked=!!current||!retry.hidden;
    stable.disabled=blocked||!stableOK(manifest?.stable);
    dev.disabled=blocked||!candidate(manifest?.dev,'dev');
    test.disabled=blocked||!testOK(manifest?.test);more.hidden=!testOK(manifest?.test);
  };
  const display=value=>{
    manifest=value;
    stable.textContent='Open Regular · v15';
    dev.textContent=candidate(value.dev,'dev')?'Open Preview · '+value.dev.version.replace('-dev-',' · '):'Preview unavailable';
    meta.textContent=candidate(value.dev,'dev')?'For testing only. Do not use for real claims.':'Preview is unavailable. Regular is still available.';
    versions.textContent=['Regular (Stable): v15',candidate(value.dev,'dev')?'Preview (Dev): '+value.dev.version:'Preview: unavailable',testOK(value.test)?'Test: '+value.test.version:null].filter(Boolean).join(' · ');
    if(testOK(value.test)){test.textContent='Test · '+value.test.version.split('-test-')[0];purpose.textContent=value.test.purpose;}
    status.textContent='Choose a version.';
    if(previousVerified){
      const label=previousVerified.channel==='dev'?'Preview':'Regular';
      versions.textContent+=' · Previously verified on this site: '+label+' '+previousVerified.version+' (source verification only)';
      if(!eligible(value,previousVerified.channel)){
        status.textContent='The previously verified '+label+' is unavailable. Choose an available version.';
        help.open=true;
      }else if(!same(previousVerified,value[previousVerified.channel])){
        status.textContent='A different '+label+' version is available. Check version details before opening.';
        if(previousVerified.version===value[previousVerified.channel].version)
          versions.textContent+=' · Source fingerprint changed. Previous: '+previousVerified.sha256+' · Available: '+value[previousVerified.channel].sha256;
        help.open=true;
      }
    }
  };
  const stop=(source=null)=>{if(closed)return;closed=true;current?.abort();complete(source);};
  const active=controller=>!closed&&current===controller&&!controller.signal.aborted&&host.isConnected;
  const work=async (grade, label, fresh=false, selected=grade?manifest?.[grade]:null)=>{
    if(closed||current)return;if(busy()){stop();return;}
    const controller=new AbortController();current=controller;available();retry.hidden=true;
    diagnostic.hidden=true;diagnostic.textContent='';
    let stage=grade&&!fresh?'download':'versions';
    status.textContent=grade&&!fresh?'Opening '+label+'...':'Finding available versions...';if(grade||fresh)cancel.focus();else title.focus();
    try {
      if(!grade||fresh){
        manifest=null;
        const value=await(await get(BASE+'channels.json',controller)).json();
        if(!active(controller))return;
        if(value?.schema!==1||!stableOK(value.stable))throw Error('Invalid release manifest');
        display(value);
        if(!grade)return;
        const next=value[grade];
        if(!eligible(value,grade)||!same(selected,next)||selected.path!==next.path||
           (grade==='test'&&(selected.mode!==next.mode||selected.purpose!==next.purpose))){
          status.textContent='The selected version changed or is unavailable. Choose a version again. Nothing opened.';return;
        }
        selected=next;stage='download';status.textContent='Opening '+label+'...';
      }
      if(grade){
        if(!eligible(manifest,grade)||!same(selected,manifest[grade]))throw Error('Invalid selection');
        const channel=selected;
        const bytes=await(await get(channel.path,controller)).arrayBuffer();
        if(!active(controller))return;
        stage='verification';status.textContent='Checking '+label+' before opening...';
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(!active(controller))return;
        if(hash!==channel.sha256)throw Error('Script integrity check failed');
        if(busy()){stop();return;}
        const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        recordVerification(grade,channel);
        stop(source);
      }
    }catch(error){
      if(active(controller)){if(!manifest){stable.textContent='Regular unavailable';dev.textContent='Preview unavailable';meta.textContent='Available versions could not be checked. Try again.';versions.textContent='Versions not yet available.';}status.textContent=(stage==='versions'?'Could not find available versions.':stage==='download'?'Could not download '+label+'.':'Could not safely check '+label+'.')+' Nothing opened.';
        diagnostic.textContent='Check failed: '+stage+(label?' ('+label+')':'')+'.';diagnostic.hidden=false;
        retry.hidden=false;retry.onclick=()=>work(grade,label,true,selected);}
    }finally{
      if(current===controller){current=null;available();if(!closed){if(!retry.hidden)retry.focus();else title.focus();}}
    }
  };
  stable.onclick=()=>work('stable','Regular');dev.onclick=()=>work('dev','Preview');test.onclick=()=>work('test','Test');cancel.onclick=()=>stop();
  dialog.addEventListener('cancel',e=>{e.preventDefault();stop();});dialog.addEventListener('close',()=>stop());
  const onHide=()=>stop();const observer=new MutationObserver(()=>{if(!host.isConnected)stop();});
  let restored=false;
  const restoreFocus=()=>{if(restored)return;restored=true;if(previous?.isConnected&&!busy())previous.focus({preventScroll:true});};
  window[key]=true;
  try {
    root.append(style,dialog);document.documentElement.append(host);
    observer.observe(document.documentElement,{childList:true});window.addEventListener('pagehide',onHide,{once:true});
    available();dialog.showModal();title.focus();void work(null);
    const source=await done;
    if(dialog.open)dialog.close();host.remove();
    restoreFocus();
    if(source!==null&&!busy()){
      try{await(0,eval)(source);}catch(error){alert('Rewards may not have opened correctly. Check whether a claim is unfinished before trying again or switching versions.');}
    }
  }finally{
    stop();observer.disconnect();window.removeEventListener('pagehide',onHide);if(dialog.open)dialog.close();host.remove();
    restoreFocus();delete window[key];
  }
})();

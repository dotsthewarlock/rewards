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
    '.stable{background:#2459a5;color:white;border:1px solid transparent}',
    '.dev{background:#dce6f8;color:#233b60;border:1px solid transparent;margin-top:8px}',
    '.cancel{background:transparent;color:inherit;border:0;margin-top:8px}',
    'button:disabled{opacity:.55;cursor:default}[hidden]{display:none!important}summary{box-sizing:border-box;cursor:pointer;min-height:48px;padding:14px 0}summary:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
    '.meta{font-size:12px;margin:4px 0 8px;color:inherit}#loader-status{margin:12px 0 0}#loader-status:empty{margin:0}',
    '@media(prefers-color-scheme:dark){dialog{background:#21232b;color:#e4e6f0}.stable{background:#b1c5ff;color:#082e68}.dev{background:#354865;color:#e1e9ff}button:focus-visible{outline-color:#b1c5ff}}',
    '@media(forced-colors:active){button{border:1px solid ButtonText}button:focus-visible{outline:3px solid Highlight}}'
  ].join('\n');
  const dialog = document.createElement('dialog');
  const add = (tag,text,cls,parent=dialog) => {const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;};
  const title=add('h2','Rewards Companion');title.id='loader-title';dialog.setAttribute('aria-labelledby',title.id);
  const description=add('p','Stable may start or resume v15. Close other rewards tools; never switch with an unresolved submission.');description.id='loader-description';dialog.setAttribute('aria-describedby',description.id);
  const stable=add('button','Stable','stable'),dev=add('button','Dev','dev');
  const meta=add('p','Development builds are for testing only.','meta');meta.id='loader-dev';dev.setAttribute('aria-describedby',meta.id);
  const more=add('details','');more.hidden=true;add('summary','Testing builds','',more);
  const test=add('button','Test','dev',more),purpose=add('p','','meta',more);purpose.id='loader-test';test.setAttribute('aria-describedby',purpose.id);
  const status=add('p','Loading versions...');status.id='loader-status';status.setAttribute('role','status');status.setAttribute('aria-atomic','true');
  const retry=add('button','Retry','dev');retry.hidden=true;retry.setAttribute('aria-describedby',status.id);
  const cancel=add('button','Cancel','cancel');
  for(const button of [stable,dev,test,retry,cancel])button.type='button';
  const previous=document.activeElement;
  let manifest=null, current=null, closed=false, complete;
  const done=new Promise(resolve=>{complete=resolve;});
  const valid=c=>c && typeof c.path==='string' && typeof c.sha256==='string' && /^[a-f0-9]{64}$/.test(c.sha256);
  const candidate=(c,grade)=>valid(c)&&typeof c.version==='string'&&new RegExp('^\\d+\\.\\d+\\.\\d+-'+grade+'-[a-f0-9]{12}$').test(c.version)&&(c.path===BASE+'releases/'+c.version+'.js'||c.path===BASE+'releases/'+c.version+'/rewards-companion-'+c.version+'-bookmarklet.js');
  const stableOK=c=>valid(c)&&c.version==='15'&&c.path==='redeem/Redeem_Prepaid_Rewards_v15.js'&&c.sha256==='23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1';
  const testOK=c=>candidate(c,'test')&&c.mode==='read-only'&&typeof c.purpose==='string'&&c.purpose.trim().length>0&&c.purpose.length<=120;
  const get=async(path,controller)=>{
    const url=new URL(path,ROOT);
    if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.search||url.hash)throw Error('Invalid URL');
    const response=await fetch(url.href,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error('HTTP '+response.status);return response;
  };
  const available=()=>{
    stable.disabled=!!current||!stableOK(manifest?.stable);
    dev.disabled=!!current||!candidate(manifest?.dev,'dev');
    test.disabled=!!current||!testOK(manifest?.test);more.hidden=!testOK(manifest?.test);
  };
  const stop=(source=null)=>{if(closed)return;closed=true;current?.abort();complete(source);};
  const active=controller=>!closed&&current===controller&&!controller.signal.aborted&&host.isConnected;
  const work=async (channel, label)=>{
    if(closed||current)return;if(busy()){stop();return;}
    const controller=new AbortController();current=controller;available();retry.hidden=true;
    status.textContent=channel?'Loading '+label+'...':'Loading versions...';cancel.focus();
    try {
      if(!channel){
        const value=await(await get(BASE+'channels.json',controller)).json();
        if(!active(controller))return;
        if(value?.schema!==1||!stableOK(value.stable))throw Error('Invalid release manifest');
        manifest=value;stable.textContent='Stable · v15';dev.textContent=candidate(value.dev,'dev')?'Dev · '+value.dev.version.split('-dev-')[0]:'Dev unavailable';
        meta.textContent=candidate(value.dev,'dev')?value.dev.version+' · Testing only; not live accepted.':'Development unavailable. Stable remains available.';
        if(testOK(value.test)){test.textContent='Test · '+value.test.version.split('-test-')[0];purpose.textContent=value.test.version+' · '+value.test.purpose;}
        status.textContent='';
      }else{
        const bytes=await(await get(channel.path,controller)).arrayBuffer();
        if(!active(controller))return;
        status.textContent='Verifying '+label+'...';
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(!active(controller))return;
        if(hash!==channel.sha256)throw Error('Script integrity check failed');
        if(busy()){stop();return;}
        stop(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      }
    }catch(error){
      if(active(controller)){status.textContent=(channel?label+': ':'')+error.message+'; nothing launched.';retry.hidden=false;retry.onclick=()=>work(channel,label);}
    }finally{
      if(current===controller){current=null;available();if(!closed){if(!retry.hidden)retry.focus();else if(!stable.disabled)stable.focus();}}
    }
  };
  stable.onclick=()=>work(manifest.stable,'Stable');dev.onclick=()=>work(manifest.dev,'Dev');test.onclick=()=>work(manifest.test,'Test');cancel.onclick=()=>stop();
  dialog.addEventListener('cancel',e=>{e.preventDefault();stop();});dialog.addEventListener('close',()=>stop());
  const onHide=()=>stop();const observer=new MutationObserver(()=>{if(!host.isConnected)stop();});
  let restored=false;
  const restoreFocus=()=>{if(restored)return;restored=true;if(previous?.isConnected&&!busy())previous.focus({preventScroll:true});};
  window[key]=true;
  try {
    root.append(style,dialog);document.documentElement.append(host);
    observer.observe(document.documentElement,{childList:true});window.addEventListener('pagehide',onHide,{once:true});
    available();dialog.showModal();void work(null);
    const source=await done;
    if(dialog.open)dialog.close();host.remove();
    restoreFocus();
    if(source!==null&&!busy()){
      try{await(0,eval)(source);}catch(error){alert('Script launch failed or is incomplete. Do not retry or switch tools until you confirm the workspace and transaction state are safe.');}
    }
  }finally{
    stop();observer.disconnect();window.removeEventListener('pagehide',onHide);if(dialog.open)dialog.close();host.remove();
    restoreFocus();delete window[key];
  }
})();

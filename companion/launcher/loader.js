(async () => {
  'use strict';
  const ROOT = new URL('https://dotsthewarlock.github.io/rewards/');
  const get = async path => {
    const url = new URL(path, ROOT);
    if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname) || url.search || url.hash) throw Error('Invalid artifact URL');
    const response = await fetch(url.href, {
      cache: 'no-store', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response;
  };
  const busy = () => document.getElementById('bsp') ||
    document.getElementById('rewards-companion-dev') || window.__BS_REWARDS__;
  if (busy()) throw Error('A rewards workspace is already active. Close it or finish and reload before switching.');
  const manifest = await (await get('companion/launcher/channels.json')).json();
  if (manifest.schema !== 1) throw Error('Unsupported channel manifest');
  const choice = prompt('Rewards Companion\n\n1 = Stable (v' + (manifest.stable?.version ?? 'unavailable') +
    ')\n2 = Dev (' + (manifest.dev?.version ?? 'unavailable') + '; testing only, not live accepted)\n\nDo not run alongside another rewards tool. Cancel to exit.', '1');
  if (choice === null) return;
  const channel = choice.trim() === '1' ? manifest.stable : choice.trim() === '2' ? manifest.dev : null;
  if (!channel || typeof channel.path !== 'string' || !/^[a-f0-9]{64}$/.test(channel.sha256)) throw Error('Invalid or unavailable channel');
  const bytes = await (await get(channel.path)).arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== channel.sha256) throw Error('Script integrity check failed');
  if (busy()) throw Error('Another workspace became active. Launch cancelled.');
  const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  await (0, eval)(source);
})();

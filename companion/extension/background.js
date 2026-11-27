// Browser shell only. No merchant permissions, no transaction messages.
const configure = () => chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
configure();

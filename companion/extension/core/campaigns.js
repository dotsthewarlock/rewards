import './registry.js';
export const campaigns=globalThis.RewardsCampaigns.campaigns;
export const campaignById=globalThis.RewardsCampaigns.byId;
export const money = cents => `CAD $${(cents/100).toFixed(2)}`;

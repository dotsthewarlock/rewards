import {immutable} from './contracts.js';
// Historical registry from R3 02/06. Not current stock or live compatibility.
export const campaigns = immutable([
 {id:'CA1126VANW',name:'Walmart Canada',origin:'https://getmybonus.ca',path:'/CA1126VANW/en',products:['$100 Vanilla prepaid card'],rewards:['Walmart eGift Card'],merchant:['Walmart'],cents:1500,purchase:'Nov 26–29, 2026',deadline:'Nov 30, 2026',observations:8,dialog:'Purchase location'},
 {id:'CA1126PKIZ',name:'On the Run / Parkland',origin:'https://prepaidrewards.ca',path:'/CA1126PKIZ',products:['$75 Vanilla Visa prepaid card'],rewards:['Zift Zillions of Gifts eGift Card'],merchant:['Zift Zillions of Gifts'],cents:1500,purchase:'Nov 20–Dec 7, 2026',deadline:'Dec 8, 2026',observations:14,dialog:'Purchased product'},
 {id:'CA1126DTZFT',name:'Dollar Tree',origin:'https://bonusrewards.ca',path:'/CA1126DTZFT',products:['$50 yellow Zift Have Fun gift card'],rewards:['Zift Zillions of Gifts eGift Card'],merchant:['Zift Zillions of Gifts'],cents:1000,purchase:'Nov 2–Dec 31, 2026',deadline:'Jan 2, 2027',observations:18,dialog:'Purchased product',note:'Avondale participation inferred, not confirmed. Total cap 3,000; remaining stock unknown.'},
 {id:'CA1126PZFT',name:'Petro-Canada',origin:'https://cardbonuses.com',path:'/CA1126PZFT',products:['$50 Zift Merry Christmas','$50 Zift Have Fun'],rewards:['Zift Have Fun eGift Card','Petro-Canada eGift Card'],merchant:['Zift Have Fun','Petro-Canada'],cents:1000,purchase:'Nov 17, 2026–Jan 12, 2027',deadline:'Jan 13, 2027',observations:21,dialog:'Purchased product and reward choice'}
]);
export const campaignById = id => campaigns.find(c=>c.id===id);
export const money = cents => `CAD $${(cents/100).toFixed(2)}`;

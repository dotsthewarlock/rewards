import {campaignById} from './campaigns.js';
// Presentation commands only. Never write queue, rewards or transaction outcome.
export function reducePresentation(state, command) {
  switch (command.type) {
    case 'navigate':
      if (['queue','rewards','campaigns','settings'].includes(command.screen)) state.screen=command.screen;
      return true;
    case 'view':
      if (campaignById(command.id)) state.view=command.id;
      return true;
    case 'theme':
      if (['system','light','dark'].includes(command.value)) state.theme=command.value;
      return true;
    case 'nav':
      if (['top','bottom'].includes(command.value)) state.nav=command.value;
      return true;
    default: return false;
  }
}

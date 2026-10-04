/// <reference path="./dtypes.d.ts" />

import * as tut from './tutorial_popup.mjs';
import { TutorialModal } from './components/TutorialModal.mjs';

const { game } = window.engine;

console.log('tutorial_popup plugin loaded');

game.registerState('tutorial_seen', []);
// The modal's live page list and current page. Saved like any other UI state so a save taken
// while the hint is up reloads into a hint the player can actually read and close.
game.registerState('tutorial_session', []);
game.registerState('tutorial_page', 0);

game.registerComponent('TutorialModal', TutorialModal);

game.addComponent({
  id: 'tutorial_hint',
  slot: 'popup',
  component: TutorialModal,
  mask: 'rgba(0, 0, 0, 0.2)',
});

game.registerService('tutorial', {
  showHint: tut.showHint,
  isShown: tut.isShown,
  reset: tut.resetTutorials,
});

game.registerAction('show_hint', (recordId) => tut.showHint(recordId));

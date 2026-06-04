/// <reference path="../dtypes.d.ts" />
const { game, vue } = window.engine;
const { defineComponent } = vue;

import { currentRecord, dismissCurrent, tutorialEnabled } from '../tutorial_popup.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const TutorialModal = defineComponent({
  setup() {
    return { record: currentRecord, tutorialEnabled, dismiss: dismissCurrent };
  },
  template: /*html*/`
    <div v-if="record" class="tutorial-modal">
      <h2 class="tutorial-title">{{ record.title }}</h2>
      <img v-if="record.image" class="tutorial-image" :src="record.image" :alt="record.title" />
      <div class="tutorial-body" v-script="record.content || record.summary"></div>
      <div class="tutorial-footer">
        <label class="tutorial-dont-show">
          <input type="checkbox" :checked="!tutorialEnabled" @change="tutorialEnabled = !$event.target.checked" />
          Don't show tutorial
        </label>
        <button class="tutorial-ok" @click="dismiss">Got it</button>
      </div>
    </div>
  `,
});

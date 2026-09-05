/// <reference path="../dtypes.d.ts" />
const { game, vue } = window.engine;
const { defineComponent, ref, watch } = vue;

import { currentRecord, dismissAll, pageBy, pageIndex, pageCount, tutorialEnabled } from '../tutorial_popup.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const TutorialModal = defineComponent({
  setup() {
    const body = ref(null);
    // each page scrolls independently — landing mid-scroll on a new page reads as broken
    watch(currentRecord, () => { if (body.value) body.value.scrollTop = 0; });
    return { record: currentRecord, tutorialEnabled, dismiss: dismissAll, pageBy, pageIndex, pageCount, body };
  },
  template: /*html*/`
    <div v-if="record" class="tutorial-modal">
      <h2 class="tutorial-title">{{ record.title }}</h2>
      <img v-if="record.image" class="tutorial-image" :src="record.image" :alt="record.title" />
      <div class="tutorial-body" ref="body" v-script="record.content || record.summary"></div>
      <div class="tutorial-footer">
        <label class="tutorial-dont-show">
          <input type="checkbox" :checked="!tutorialEnabled" @change="tutorialEnabled = !$event.target.checked" />
          Don't show tutorial
        </label>
        <div v-if="pageCount > 1" class="tutorial-pager">
          <button class="tutorial-page-btn" :disabled="pageIndex === 0" @click="pageBy(-1)">‹</button>
          <span class="tutorial-page-count">{{ pageIndex + 1 }} / {{ pageCount }}</span>
          <button class="tutorial-page-btn" :disabled="pageIndex === pageCount - 1" @click="pageBy(1)">›</button>
        </div>
        <button class="tutorial-ok" @click="dismiss">Got it</button>
      </div>
    </div>
  `,
});

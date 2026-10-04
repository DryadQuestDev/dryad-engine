<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Global } from '../../../global/global';
import { Game } from '../../game';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import ChoiceList from '../ChoiceList.vue';
import Toolbar from '../Toolbar.vue';
import CharacterFace from '../CharacterFace.vue';
import { useTypingAnimation } from '../../../composables/useTypingAnimation';
import gsap from 'gsap';
import TextEncounter from '../TextEncounter.vue';
import DialogueDisplay from './DialogueDisplay.vue';

const global = Global.getInstance();
const game = Game.getInstance();

const COMPONENT_ID = 'overlay-navigation';

const isTextSelectable = ref(false);

// The player's fold of the dialogue box (Ctrl+H, the header's collapse button). A registered
// state so content can set it too and a save restores it; the show-dialogue button brings it back.
const isDialogueCollapsed = computed({
  get: () => !!game.coreSystem.getState('dialogue_minimized'),
  set: (value: boolean) => game.setState('dialogue_minimized', value),
});
// The author's hide: the box goes away together with its buttons, so the player cannot bring
// it back. Meant for staging beats ([nw] transitions) where an empty box would sit over the art.
// Cleared by the next playScene like hide_events. Choices hide with it: a paragraph that ends
// in choices under hide_dialogue is the author's to resolve.
const isDialogueHidden = computed(() => !!game.coreSystem.getState('hide_dialogue'));

// Passed into the tooltips as a placeholder: a key name is the keyboard's, not a word, so it has
// no business inside a translatable sentence.
const DIALOGUE_TOGGLE_SHORTCUT = 'Ctrl+H';
const hideDialogueTitle = computed(() => global.getString('navigation.hide_dialogue', { shortcut: DIALOGUE_TOGGLE_SHORTCUT }));
const showDialogueTitle = computed(() => global.getString('navigation.show_dialogue', { shortcut: DIALOGUE_TOGGLE_SHORTCUT }));
const showAnimatedContinueIndicator = ref(false);
const showFlashContent = ref(false);
const flashFooterRef = ref<HTMLElement | null>(null);

function toggleDialogueCollapse() {
  isDialogueCollapsed.value = !isDialogueCollapsed.value;
}

function handleKeyPress(event: KeyboardEvent) {
  // Renpy uses Ctrl+H to hide/show dialogue box
  if (event.ctrlKey && event.key === 'h') {
    event.preventDefault();
    toggleDialogueCollapse();
    return;
  }

  // Space or Enter to skip typing animation or advance dialogue
  if (event.key === ' ' || event.key === 'Enter') {

    // Don't interfere with typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    // A modal popup owns the keyboard. The scene underneath is unreachable by mouse —
    // PopupContainer's full-screen overlay eats the click — so keyboard advance must not
    // reach it either, or a popup that parks the scene (the reward popup, choose_item)
    // re-runs its delayed action on every press. Returning before preventDefault leaves
    // Space/Enter free to activate a focused control inside the popup.
    if (game.getOpenPopups().length) {
      return;
    }

    event.preventDefault();

    if (game.coreSystem.getState('disable_ui')) {
      return;
    }

    if (isSceneBlocked.value) {
      return;
    }

    // The event box is hidden (e.g. a battle is running with a parked scene) — the
    // scene is invisible, so keyboard advance must not execute its live choice
    // (which may be the very {battle} action that parked it).
    if (game.coreSystem.getState('hide_events')) {
      return;
    }

    // Typing in progress: reveal up to the next [w] click-wait, or continue from one
    if (typingAnimation.isAnimating.value) {
      typingAnimation.skipAnimation();
      return;
    }

    // When animation is done, advance to next scene
    advanceScene();
  }
}

/** Advance past a single-continue scene. Branch choices (an array) are the player's to pick. */
function advanceScene() {
  const choices = game.dungeonSystem.relevantChoices.value;
  if (!Array.isArray(choices)) {
    choices?.do();
  }
}

// [nw] auto-advance. Armed by the typing animation when the text ends; dropped when the scene
// changes underneath it or the same guards that stop a click from advancing are up.
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

function cancelAutoAdvance() {
  if (autoAdvanceTimer !== null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function scheduleAutoAdvance(delaySeconds: number) {
  cancelAutoAdvance();
  const sceneId = game.dungeonSystem.currentSceneId.value;
  autoAdvanceTimer = setTimeout(() => {
    autoAdvanceTimer = null;
    if (game.dungeonSystem.currentSceneId.value !== sceneId) return;
    if (game.getOpenPopups().length) return;
    if (game.coreSystem.getState('disable_ui') || game.coreSystem.getState('hide_events')) return;
    if (isSceneBlocked.value) return;
    advanceScene();
  }, delaySeconds * 1000);
}

function handleCtrlKeyDown(event: KeyboardEvent) {
  if (event.key === 'Control') {
    isTextSelectable.value = true;
  }
}

function handleCtrlKeyUp(event: KeyboardEvent) {
  if (event.key === 'Control') {
    isTextSelectable.value = false;

    // Clear any text selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyPress);
  window.addEventListener('keydown', handleCtrlKeyDown);
  window.addEventListener('keyup', handleCtrlKeyUp);
});

onUnmounted(() => {
  cancelAutoAdvance();
  window.removeEventListener('keydown', handleKeyPress);
  window.removeEventListener('keydown', handleCtrlKeyDown);
  window.removeEventListener('keyup', handleCtrlKeyUp);
});

const isSceneBlocked = computed(() => game.coreSystem.getState('block_scene_advance'));

const showContinueIndicator = computed(() => {
  if (isSceneBlocked.value) return false;
  const choices = game.dungeonSystem.relevantChoices.value;
  return game.dungeonSystem.choiceType.value !== 'encounter' && choices && !Array.isArray(choices);
});


// 3 mods: map encounters, dialogue events, prose content

function handleEventClick(event: MouseEvent) {
  //console.log('handleEventClick', event);
  if (game.coreSystem.getState('disable_ui')) {
    return;
  }

  if (isSceneBlocked.value) {
    return;
  }

  // Don't trigger click if Ctrl key is held (user is trying to select text)
  if (event.ctrlKey) {
    return;
  }

  // Typing in progress: reveal up to the next [w] click-wait, or continue from one
  if (typingAnimation.isAnimating.value) {
    typingAnimation.skipAnimation();
    return;
  }

  advanceScene();
}

const encounterContent = computed(() => {
  const currentRoom = game.dungeonSystem.currentRoom.value;
  if (!currentRoom) return '';

  // Both branches resolve for text only: the inline actions already fired from enterRoom /
  // selectEncounter, and executing them here would re-fire them on every re-evaluation.

  // If there's a selected encounter that's visible, show it
  const selectedEncounter = game.dungeonSystem.selectedEncounter.value;
  if (selectedEncounter && selectedEncounter.getVisibilityState()) {
    return game.logicSystem.resolveString(selectedEncounter.rawContent, true).output;
  }

  // Otherwise show room description
  const descriptionEncounter = currentRoom.descriptionEncounter;
  if (descriptionEncounter && descriptionEncounter.getVisibilityState()) {
    return game.logicSystem.resolveString(descriptionEncounter.rawContent, true).output;
  }

  return '';
});

const characterName = computed(() => {
  return game.dungeonSystem.talkingCharacter.value?.getTrait('name') ?? '';
});

const talkingCharacterHasNoArt = computed(() => {
  const c = game.dungeonSystem.talkingCharacter.value;
  return !!c && !c.hasArt();
});

const characterTitleColor = computed(() => {
  const color = game.dungeonSystem.talkingCharacter.value?.getTrait('title_color');
  return color ? `#${color}` : '#ffffff';
});

const shouldColorCharacterName = computed(() => {
  const coloredTitleSetting = game.getProperty('colored_character_title')?.currentValue ?? 0;
  // 0 - not used, 1 - used
  return coloredTitleSetting === 1;
});

const shouldColorDialogueContent = computed(() => {
  const coloredTextSetting = game.getProperty('colored_character_text')?.currentValue ?? 0;
  // 0 - not used, 1 - all text
  return coloredTextSetting === 1;
});

const shouldColorQuotedText = computed(() => {
  const coloredTextSetting = game.getProperty('colored_character_text')?.currentValue ?? 0;
  // 2 - only text inside quotes
  return coloredTextSetting === 2;
});

const characterNameStyle = computed(() => {
  if (shouldColorCharacterName.value) {
    return { color: characterTitleColor.value };
  }
  return {};
});

const dialogueContentStyle = computed(() => {
  if (shouldColorDialogueContent.value) {
    return { color: characterTitleColor.value };
  }
  return {};
});

function processDialogueContent(content: string): string {
  if (!shouldColorQuotedText.value) {
    return content;
  }

  // Replace text inside quotes with colored spans
  // Matches text inside double quotes (straight and curly) and preserves the quotes
  const color = characterTitleColor.value;
  // Match straight quotes "..." or curly quotes "..."
  return content.replace(/(“.+?”|".+?")/g, (match: string) => {
    return `<span style="color: ${color};">${match}</span>`;
  });
}

const processedEventContent = computed(() => {
  const baseContent = game.dungeonSystem.cachedText.value ?? '';
  const content = processDialogueContent(baseContent);
  return content;
});

// Typing animation setup
const typingSpeed = computed(() => {
  const speedSetting = global.userSettings.value.typing_speed || 'fast';

  // Map string values to numeric speeds
  // Lower numbers = faster animation (less delay between characters)
  const speedMap: Record<string, number> = {
    'none': 0,        // Instant
    'very_fast': 200,  // Very fast
    'fast': 120,       // Fast
    'medium': 90,     // Medium
    'slow': 60        // Slow
  };

  return speedMap[speedSetting] ?? 120;
});

const typingAnimation = useTypingAnimation({
  speed: typingSpeed,
  onComplete: async () => {
    showAnimatedContinueIndicator.value = true;

    // Mark this scene as animated
    game.dungeonSystem.currentSceneIdAnimated.value = game.dungeonSystem.currentSceneId.value;

    // Show flash content after animation completes
    if (game.dungeonSystem.cachedFlashArray.value.length > 0) {
      showFlashContent.value = true;
      await animateFlashIn();
    }
  },
  onNoWait: scheduleAutoAdvance
});

async function animateFlashIn() {
  await nextTick();
  const flashEl = flashFooterRef.value;
  if (!flashEl) return;
  // The flash sits in the scrolling region under the text. When the text already fills the
  // box, the flash lands below the fold — bring it up so a notice is never missed.
  flashEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  gsap.fromTo(flashEl,
    {
      opacity: 0,
      y: -10
    },
    {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out'
    }
  );
}

// Watch for content changes and start animation for scenes
watch(processedEventContent, (newContent) => {
  cancelAutoAdvance();
  const isScene = game.dungeonSystem.choiceType.value === 'scene';
  const currentSceneId = game.dungeonSystem.currentSceneId.value;
  const animatedSceneId = game.dungeonSystem.currentSceneIdAnimated.value;

  if (isScene && newContent) {
    // Check if this scene has already been animated
    const alreadyAnimated = currentSceneId === animatedSceneId;

    // A paragraph behind a hide_dialogue box has nobody to type for: count it revealed at once,
    // so one press advances and an [nw] delay runs from the moment the paragraph appears.
    if (alreadyAnimated || isDialogueHidden.value) {
      // Skip animation, show content instantly
      typingAnimation.reset();
      game.dungeonSystem.currentSceneIdAnimated.value = currentSceneId;
      showAnimatedContinueIndicator.value = true;
      showFlashContent.value = game.dungeonSystem.cachedFlashArray.value.length > 0;
      // A paragraph shown in full never runs the typewriter, so its [nw] would never fire. After a
      // save load that strands the player: with hide_dialogue on there is no box to click. Read
      // the marker off the content and arm the advance the way the typewriter would have. Either
      // quote: the resolver writes single-quoted attributes, but a save round trip hands the text
      // back with double quotes.
      const noWait = /data-tag=["']nw["'](?:\s+data-value=["']([^"']+)["'])?/.exec(newContent);
      if (noWait) scheduleAutoAdvance(noWait[1] ? parseFloat(noWait[1]) : 0);
    } else {
      // Play animation
      showAnimatedContinueIndicator.value = false;
      showFlashContent.value = false; // Hide flash content during animation
      typingAnimation.startAnimation(newContent);
    }
  } else {
    // For non-scenes, show content instantly (their flash is gated by showFlash, not by this latch)
    typingAnimation.reset();
  }
}, { immediate: true });

// A click on the event box does something when it advances a single-continue scene, or while the
// text is still typing or parked on a [w] — even a scene that ends in branch choices is clickable
// until its text is fully revealed.
const isEventClickable = computed(() =>
  !isSceneBlocked.value && (typingAnimation.isAnimating.value || !Array.isArray(game.dungeonSystem.relevantChoices.value))
);

// Choices wait for the text: not while it types, and not while a [w] holds it for a click —
// the clicks those ask for would otherwise compete with the choice buttons.
const choicesReady = computed(() => !typingAnimation.isAnimating.value);

// Continue arrow for the dialogue. A [w] click-wait shows it whatever the scene ends in — the
// click it asks for continues the text, not the scene.
const showDialogueArrow = computed(() =>
  typingAnimation.isWaiting.value || (showAnimatedContinueIndicator.value && !!showContinueIndicator.value)
);

const flashHtml = computed(() => game.dungeonSystem.cachedFlashArray.value.join('<br>'));

// A scene holds its flash back until the typing animation lands on the last character, so it
// waits on the showFlashContent latch. An encounter — a room description, or a selected
// encounter on the map — has no animation to wait for, so its flash shows as soon as it exists.
const showFlash = computed(() => {
  if (game.dungeonSystem.cachedFlashArray.value.length === 0) return false;
  return game.dungeonSystem.choiceType.value === 'scene' ? showFlashContent.value : true;
});

// The encounter counterpart of the typing animation's onComplete fade-in. Keyed on the encounter
// as well as the text: adjacent rooms can raise a byte-identical line (11c and 11d of the prologue
// both only apply darkness), and watching the text alone would see no change and skip the fade.
watch(() => `${game.dungeonSystem.activeEncounter.value?.id ?? ''} ${flashHtml.value}`, () => {
  if (!flashHtml.value || game.dungeonSystem.choiceType.value === 'scene') return;
  animateFlashIn();
});
/*
const isRoomDescription = computed(() => {
  return !game.dungeonSystem.selectedEncounter.value;
});

const hasConnectedRooms = computed(() => {
  const currentRoom = game.dungeonSystem.currentRoom.value;
  return currentRoom && currentRoom.neighborsWithDirection && currentRoom.neighborsWithDirection.length > 0;
});
*/
function navigateToNeighbor(neighborRoom: any) {
  if (game.coreSystem.getState('disable_ui')) {
    return;
  }
  game.dungeonSystem.enterRoom(neighborRoom.room.id);
}

// Text-based dungeon helper
const isTextDungeon = computed(() => {
  return game.dungeonSystem.currentDungeon.value?.dungeon_type === 'text';
});

// The event layer (dialogue box, choices, toolbar) is put away by the Ctrl+H collapse or by the
// toolbar's minimize button. The text-dungeon side column follows it, but stays mounted.
const isEventLayerHidden = computed(() =>
  game.dungeonSystem.toolbarMinimized.value || isDialogueCollapsed.value || isDialogueHidden.value
);

// Over-encumbered indicator: shown atop the room description while the party bag is overweight.
// Both banner sites live inside the no-scene (description) branch, so this only needs the weight
// check — a no-op unless a game caps the party inventory.
const isOverEncumbered = computed(() => !!game.itemSystem.getInventory(PARTY_INVENTORY_ID)?.isOverCapacity());
const overEncumberedLabel = computed(() => global.getString('over_encumbered_label'));

</script>

<template>
  <!-- hide_events hides the whole event presentation layer — dialogue, choices, toolbar.
       A battle keeps its parked triggering scene current, and that scene must not render
       (or accept clicks) while the battle screen owns the view. -->
  <!-- Enter-only fade: the overlay fades in when the event layer reappears (e.g. a
       mid-battle cutaway scene starting). No leave transition — systems that need a
       fade-out animate it themselves before flipping hide_events (the content is torn
       down synchronously on exit, so a leave transition would show the wrong text). -->
  <Transition name="overlay-fade">
  <div v-if="!game.coreSystem.getState('hide_events')" :id="COMPONENT_ID" class="overlay"
    :class="[game.dungeonSystem.currentDungeon.value?.dungeon_type, {
      'overlay-closing': game.dungeonSystem.isSceneClosing.value,
      'has-side-column': isTextDungeon && !isEventLayerHidden
    }]">

    <div class="overlay-content" :class="game.dungeonSystem.choiceType.value + '-type'">

      <!-- Choices in normal position: when NOT scene OR when scene with character name (not for text dungeons - they show choices inline) -->
      <ChoiceList
        v-if="choicesReady && !isTextDungeon && !isEventLayerHidden && !game.coreSystem.isTextUIContent.value && (game.dungeonSystem.choiceType.value !== 'scene' || characterName)" />

      <Toolbar v-if="game.dungeonSystem.choiceType.value === 'encounter'" />

      <!-- Show dialogue button when collapsed -->
      <button v-if="isDialogueCollapsed && !game.dungeonSystem.toolbarMinimized.value && !isDialogueHidden" class="show-dialogue-button"
        @click="toggleDialogueCollapse" :title="showDialogueTitle">
      </button>

      <div
        v-if="game.dungeonSystem.choiceType.value === 'scene' && !isEventLayerHidden"
        class="dialogue-header">
        <!-- Character name OR choices in left column -->
        <div v-if="characterName && !game.coreSystem.isTextUIContent.value" class="character-name"
          :style="characterNameStyle">{{ characterName }}</div>
        <div v-else class="dialogue-header-left">
          <!-- Choices inside header when it's a scene with no character name -->
          <ChoiceList v-if="choicesReady && !game.coreSystem.isTextUIContent.value" />
        </div>
        <div class="header-buttons">
          <button class="header-button logs-button" @click="game.dungeonSystem.isLogsPopupOpen.value = true"
            :title="global.getString('navigation.view_logs')">
            <i class="pi pi-book"></i>
          </button>
          <button class="header-button collapse-button" @click="toggleDialogueCollapse" :title="hideDialogueTitle">
          </button>
        </div>
      </div>

      <!-- Text dungeon layout: the content column (max 800px). The side column beside it is a
           child of .overlay, above — not of this row. -->
      <div v-if="isTextDungeon && !isEventLayerHidden" class="text-dungeon-layout">
        <div class="event-container" :class="{
          'clickable': isEventClickable,
          'text-selectable': isTextSelectable,
          'dialogue-mode': !!game.dungeonSystem.currentSceneId.value
        }" @click="handleEventClick">
          <div v-if="game.dungeonSystem.talkingCharacter.value?.hasArt()" class="character-section">
            <CharacterFace :key="game.dungeonSystem.talkingCharacter.value?.id"
              :character="game.dungeonSystem.talkingCharacter.value ?? undefined" :show-name="true" />
          </div>

          <div class="content-wrapper">
            <div class="text-dialogue-box">
              <CustomComponentContainer :slot="'scene-content-top'"
                :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
              <!-- events scenes-->
              <DialogueDisplay v-if="game.dungeonSystem.currentSceneId.value" :content="processedEventContent"
                :revealed-chars="typingAnimation.revealedChars.value" :show-arrow="showDialogueArrow"
                :selectable="isTextSelectable" :character-name="characterName"
                :show-inline-name="talkingCharacterHasNoArt" :content-style="dialogueContentStyle"
                :name-style="characterNameStyle" />
              <!-- encounters-->
              <div v-else class="dialogue-content encounter-content" :style="dialogueContentStyle">
                <div v-if="isOverEncumbered" class="over-encumbered-banner">{{ overEncumberedLabel }}</div>
                <TextEncounter />
              </div>
              <!-- flash (scene + encounter): follows the text inside the scrolling region, so a long
                   run of notices scrolls with the text under the one scrollbar instead of squeezing it out -->
              <div v-if="showFlash" ref="flashFooterRef"
                class="flash-content flash-inline" v-script="{ html: flashHtml, resolver: false }"></div>

              <!-- Scene choices for text dungeons -->
              <ChoiceList v-if="choicesReady && game.dungeonSystem.currentSceneId.value" />
              <CustomComponentContainer :slot="'scene-content-bottom'"
                :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
            </div>

          </div>
        </div>
      </div>

      <!-- Regular (non-text) dungeon layout -->
      <div v-else-if="!isEventLayerHidden" class="event-container"
        :class="{ 'clickable': isEventClickable, 'text-selectable': isTextSelectable }"
        @click="handleEventClick">
        <div class="character-section">
          <CharacterFace :key="game.dungeonSystem.talkingCharacter.value?.id"
            :character="game.dungeonSystem.talkingCharacter.value ?? undefined" />
        </div>

        <div class="content-wrapper">
          <div class="content-scroll">
            <CustomComponentContainer :slot="'scene-content-top'"
              :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
            <!-- events scenes-->
            <DialogueDisplay v-if="game.dungeonSystem.currentSceneId.value" :content="processedEventContent"
              :revealed-chars="typingAnimation.revealedChars.value" :show-arrow="showDialogueArrow"
              :selectable="isTextSelectable" :character-name="characterName"
              :show-inline-name="false" :content-style="dialogueContentStyle" :name-style="characterNameStyle" />
            <!-- encounters-->
            <div v-else class="dialogue-content encounter-content" :style="dialogueContentStyle">
              <div v-if="isOverEncumbered" class="over-encumbered-banner">{{ overEncumberedLabel }}</div>
              <!-- Keyed off activeEncounter (the selected one, else the room description) — the same
                   encounter whose text and `!` choices are on screen. Sits above the layout row, not
                   inside it, since that row is a flex line (arrows beside text). -->
              <div v-if="game.dungeonSystem.activeEncounter.value?.discoverSpec" class="encounter-discover-cue">
                {{ game.dungeonSystem.activeEncounter.value?.getDiscoverCue() }}
              </div>
              <!-- Map/Screen dungeon: original layout -->
              <div class="encounter-content-layout">
                <!-- Direction arrows for room navigation -->
                <div class="direction-arrows" v-if="game.dungeonSystem.currentDungeon.value?.dungeon_type !== 'screen'">
                  <template v-for="neighbor in game.dungeonSystem.currentRoom.value?.neighborsWithDirection"
                    :key="neighbor.angle">
                    <div class="direction-arrow" :style="{ '--rotation': neighbor.angle + 'deg' }"
                      @click.stop="navigateToNeighbor(neighbor)">
                    </div>
                  </template>
                </div>

                <div class="encounter-text" v-script="{ html: encounterContent, resolver: false }"></div>
              </div>
            </div>
            <!-- flash (scene + encounter): follows the text inside .content-scroll, so a long run of
                 notices scrolls with the text under the one scrollbar instead of squeezing it out.
                 animateFlashIn scrolls it into view when it lands, so it is never hidden below the fold. -->
            <div v-if="showFlash" ref="flashFooterRef"
              class="flash-content flash-inline" v-script="{ html: flashHtml, resolver: false }"></div>

            <ChoiceList v-if="choicesReady && !game.dungeonSystem.toolbarMinimized.value && game.coreSystem.isTextUIContent.value" />
            <CustomComponentContainer :slot="'scene-content-bottom'"
              :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
          </div>
        </div>
      </div>
    </div>

    <!-- Side column: the same strip down the left edge of the overlay layer in every dungeon
         type. Teleported out of .overlay because that box is the event layer's own — narrow,
         centred and transformed in map/screen dungeons, and a transform makes it the containing
         block for anything positioned inside it. `defer` waits for #overlay-wrapper to be in the
         document (it mounts in the same tick, further up the tree). Mounted for the whole dungeon:
         putting the UI away must not tear down the slot's components. -->
    <Teleport defer to="#overlay-wrapper">
      <div class="overlay-navigation-side" :class="[
        isTextDungeon ? 'overlay-navigation-side--text' : 'overlay-navigation-side--screen',
        { 'overlay-navigation-side--hidden': isEventLayerHidden }
      ]">
        <CustomComponentContainer :slot="'overlay-navigation-side'"
          :context="{ dungeon: game.dungeonSystem.currentDungeon.value }" />
      </div>
    </Teleport>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID"
      :context="{ dungeon: game.dungeonSystem.currentDungeon.value, choices: game.dungeonSystem.relevantChoices.value }" />
  </div>
  </Transition>


</template>

<style scoped>
/* Over-encumbered indicator: red banner atop the room description while the party bag is overweight. */
.over-encumbered-banner {
  margin-bottom: 8px;
  padding: 5px 10px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85em;
  text-align: center;
  color: #ffd7d2;
  background: rgba(200, 40, 40, 0.28);
  border: 1px solid rgba(230, 70, 70, 0.6);
}

.overlay-fade-enter-active {
  transition: opacity 0.3s ease;
}

.overlay-fade-enter-from {
  opacity: 0;
}

/* Graceful scene exit (dungeonSystem.isSceneClosing): the dialogue fades out while
   actors play their exit animations; input is ignored until the teardown lands. */
.overlay.overlay-closing {
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.overlay {
  color: white;

  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  max-width: 800px;
  max-height: 80dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;


  border-radius: 4px;

}

.overlay.text {
  top: 0;
  bottom: 0;
  max-height: 100dvh;
  /* Clear the .ui-container tray on the left. See --ui-tray-reserved-left
     in src/style.css — shared with .progression-container's padding. */
  width: calc(100% - var(--ui-tray-reserved-left, 120px));
  max-width: none;
  left: 0;
  margin-left: var(--ui-tray-reserved-left, 120px);
  transform: none;
  display: flex;
  flex-direction: column;
}

.overlay.text .overlay-content {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Everything in the event layer — header, dialogue box, choices — starts where the side
   column ends, so the header and the content box always share one left edge. */
.overlay.text.has-side-column .overlay-content {
  padding-left: calc(var(--overlay-side-width) + var(--overlay-side-gap));
}

.overlay.text .character-section {
  align-items: start;
}

.event-container {
  border: 2px solid #535353;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.8);
  margin-bottom: 1rem;
  display: flex;
  position: relative;
  max-height: 40dvh;
  min-height: 0;
  /* Clip here; the inner .content-scroll owns the one scrollbar. */
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.event-container.text-selectable {
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  cursor: text;
}

.overlay.text .event-container {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 800px;
  margin: 0;
  border: none;
  padding: 10px;
  border-radius: 0;
  height: 100%;
  max-height: none;
  overflow: visible;
  background: #2d2d2d4f;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Scrollable text region of the event box (regular/screen layout). The flash lives
   inside it, right after the text, so text and flash share this one scrollbar. */
.content-scroll {
  display: flex;
  flex-direction: column;
  /*flex: 1 1 auto;*/
  min-height: 0;
  overflow-y: auto;
}

/* Encounters were vertically centred via .content-wrapper; keep that now that
   the content lives inside .content-scroll. */
.encounter-type .content-scroll {
  justify-content: safe center;
}

.flash-inline {
  flex: 0 0 auto;
}

.scene-type .content-wrapper {
  min-height: 130px;
}

.encounter-type .content-wrapper {
  justify-content: safe center;
}



.overlay.text .content-wrapper {
  display: block;
}

.overlay.text .event-container .content-wrapper {
  overflow-y: auto;
  justify-content: space-between;
}

.flash-content {
  padding: 0px 10px 10px 10px;
  font-style: italic;
  color: antiquewhite;
}

.overlay-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.dialogue-content {
  padding: 10px;
  line-height: 1.2em;
  font-family: var(--font-family-serif);
}

.text-dungeon-layout .dialogue-content {
  padding: 0px;
}

.text-dialogue-box {
  background: #1e1e1ebd;
  border-radius: 10px;
  padding: 10px;
  min-height: 20dvh;
  margin-bottom: 5dvh;
}

.clickable {
  cursor: pointer;
}

.character-section {
  display: flex;
  /*flex-direction: column;*/
  align-items: center;
  position: relative;
  margin-left: 4px;
}

.dialogue-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: -1px;
  max-width: 800px;
}

.overlay.text .dialogue-header {
  max-width: 800px;
  flex: 0 0 auto;
}

.character-name {
  font-weight: bold;
  padding: 4px 8px;
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid #535353;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  width: fit-content;
}

.inline-character-name {
  font-weight: bold;
}

.dialogue-header-left {
  flex: 1;
  display: flex;
  align-items: flex-end;
}

.header-buttons {
  display: flex;
  align-items: flex-end;
}

.character-name-spacer {
  flex: 1;
}

.encounter-content-layout {
  display: flex;
  gap: 15px;
  align-items: center;
}

.encounter-text {
  flex: 1;
}

.encounter-discover-cue {
  font-weight: bold;
  text-align: center;
  color: #7ddc8a;
  margin-bottom: 0.4em;
}



.header-button {
  background: #2d2d2df2;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  color: white;
  /* Fixed square footprint so logs (pi-book) and collapse (▼) buttons render
     at identical size regardless of their glyph widths. */
  width: 32px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s ease;
  margin-left: 5px;
  box-sizing: border-box;
}

.header-button:hover {
  background: rgba(0, 0, 0, 0.9);
}

/* Touch devices: bigger glyph + hit area, and shift the group away from the
   right edge so mobile browser chrome / gesture areas don't crowd them. */
@media (pointer: coarse) {
  .header-button {
    width: 54px !important;
    height: 48px !important;
    font-size: 2rem !important;
  }

  .header-buttons {
    margin-right: 12px;
  }
}

.collapse-button::before {
  content: '▼';
  line-height: 1;
}

.show-dialogue-button {
  background: #80808087;
  border: 1px solid #eee;
  border-radius: 4px;
  color: white;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 16px;
  margin-bottom: 1rem;
  transition: background 0.2s ease;
  align-self: flex-start;
}

.show-dialogue-button::before {
  content: '▲';
}

.show-dialogue-button:hover {
  background: rgba(0, 0, 0, 0.9);
}

/* Text dungeon layout: the event box column, offset past the side column by .overlay-content. */
.text-dungeon-layout {
  display: flex;
  height: 100%;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

/* In dialogue (scene) mode the whole event-container is the click target,
   so lift the whole container via border only — keep the dark base background. */
.overlay.text .event-container.dialogue-mode {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

/* Side column: a strip down the left edge of the game area, clearing the .ui-container tray, in
   every dungeon type. Its box never depends on what the event layer renders. Teleported, so it
   inherits nothing from .overlay — its text colour is set here. */
.overlay-navigation-side {
  position: absolute;
  left: var(--ui-tray-reserved-left, 120px);
  top: 0;
  bottom: 0;
  width: var(--overlay-side-width);
  padding: 10px;
  padding-bottom: 2em;
  box-sizing: border-box;
  color: white;
  z-index: 5;
}

/* Text dungeons: a real column of the layout, with the event box beside it. It takes clicks —
   .overlay-wrapper turns pointer-events off for the whole layer, and that property inherits. */
.overlay-navigation-side--text {
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #2d2d2d4f;
  pointer-events: auto;
}

/* Map/screen dungeons: the same strip, but over the map art — no backdrop, and empty space
   passes clicks through to the map and the UI underneath. */
.overlay-navigation-side--screen {
  pointer-events: none;
}

.overlay-navigation-side--screen>* {
  pointer-events: auto;
}

/* Put away with the rest of the UI, but kept mounted so slot components hold their state. */
.overlay-navigation-side--hidden {
  display: none;
}
</style>

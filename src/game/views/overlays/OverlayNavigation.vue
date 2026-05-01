<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Global } from '../../../global/global';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import ChoiceList from '../ChoiceList.vue';
import Toolbar from '../Toolbar.vue';
import CharacterFace from '../CharacterFace.vue';
import { useTypingAnimation } from '../../../composables/useTypingAnimation';
import gsap from 'gsap';
import TextEncounter from '../TextEncounter.vue';

const global = Global.getInstance();
const game = Game.getInstance();

const COMPONENT_ID = 'overlay-navigation';

const isTextSelectable = ref(false);

const isDialogueCollapsed = ref(false);
const showAnimatedContinueIndicator = ref(false);
const showFlashContent = ref(false);
const flashContentElement = ref<HTMLElement | null>(null);

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

    event.preventDefault();

    if (game.coreSystem.getState('disable_ui')) {
      return;
    }

    if (isSceneBlocked.value) {
      return;
    }

    // If typing animation is in progress, skip to end
    if (typingAnimation.isAnimating.value) {
      typingAnimation.skipAnimation();
      return;
    }

    // When animation is done, advance to next scene
    let choices = game.dungeonSystem.relevantChoices.value;
    if (!Array.isArray(choices)) {
      choices?.do();
    }
  }
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

  // If typing animation is in progress, skip to end
  if (typingAnimation.isAnimating.value) {
    typingAnimation.skipAnimation();
    return;
  }

  let choices = game.dungeonSystem.relevantChoices.value
  if (!Array.isArray(choices)) {
    choices?.do();
  }
}

const encounterContent = computed(() => {
  const currentRoom = game.dungeonSystem.currentRoom.value;
  if (!currentRoom) return '';

  // If there's a selected encounter that's visible, show it
  const selectedEncounter = game.dungeonSystem.selectedEncounter.value;
  if (selectedEncounter && selectedEncounter.getVisibilityState()) {
    return game.logicSystem.resolveString(selectedEncounter.rawContent).output;
  }

  // Otherwise show room description
  const descriptionEncounter = currentRoom.descriptionEncounter;
  if (descriptionEncounter && descriptionEncounter.getVisibilityState()) {
    return game.logicSystem.resolveString(descriptionEncounter.rawContent).output;
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
      await nextTick();

      // Animate flash content in
      if (flashContentElement.value) {
        gsap.fromTo(flashContentElement.value,
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
    }
  }
});

// Watch for content changes and start animation for scenes
watch(processedEventContent, (newContent) => {
  const isScene = game.dungeonSystem.choiceType.value === 'scene';
  const currentSceneId = game.dungeonSystem.currentSceneId.value;
  const animatedSceneId = game.dungeonSystem.currentSceneIdAnimated.value;

  if (isScene && newContent) {
    // Check if this scene has already been animated
    const alreadyAnimated = currentSceneId === animatedSceneId;

    if (alreadyAnimated) {
      // Skip animation, show content instantly
      typingAnimation.reset();
      typingAnimation.displayedText.value = newContent;
      showAnimatedContinueIndicator.value = true;
      showFlashContent.value = game.dungeonSystem.cachedFlashArray.value.length > 0;
    } else {
      // Play animation
      showAnimatedContinueIndicator.value = false;
      showFlashContent.value = false; // Hide flash content during animation
      typingAnimation.startAnimation(newContent);
    }
  } else {
    // For non-scenes, show content instantly
    typingAnimation.reset();
    typingAnimation.displayedText.value = newContent;
    // For non-scenes, show flash content immediately
    showFlashContent.value = game.dungeonSystem.cachedFlashArray.value.length > 0;
  }
}, { immediate: true });

// Content to display (either animated or instant)
const displayContent = computed(() => {
  const isScene = game.dungeonSystem.choiceType.value === 'scene';
  const baseText = isScene ? typingAnimation.displayedText.value : processedEventContent.value;

  // Add continue indicator
  const shouldShowIndicator = isScene
    ? (showAnimatedContinueIndicator.value && showContinueIndicator.value)
    : showContinueIndicator.value;

  return baseText + (shouldShowIndicator ? ' ➢' : '');
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

</script>

<template>
  <div :id="COMPONENT_ID" class="overlay" :class="game.dungeonSystem.currentDungeon.value?.dungeon_type">

    <div class="overlay-content" :class="game.dungeonSystem.choiceType.value + '-type'">

      <!-- Choices in normal position: when NOT scene OR when scene with character name (not for text dungeons - they show choices inline) -->
      <ChoiceList
        v-if="!isTextDungeon && !game.dungeonSystem.toolbarMinimized.value && !game.coreSystem.isTextUIContent.value && !isDialogueCollapsed && (game.dungeonSystem.choiceType.value !== 'scene' || characterName)" />

      <Toolbar v-if="game.dungeonSystem.choiceType.value === 'encounter'" />

      <!-- Show dialogue button when collapsed -->
      <button v-if="isDialogueCollapsed && !game.dungeonSystem.toolbarMinimized.value" class="show-dialogue-button"
        @click="toggleDialogueCollapse" title="Show dialogue (Ctrl+H)">
      </button>

      <div
        v-if="game.dungeonSystem.choiceType.value === 'scene' && !isDialogueCollapsed && !game.dungeonSystem.toolbarMinimized.value"
        class="dialogue-header">
        <!-- Character name OR choices in left column -->
        <div v-if="characterName && !game.coreSystem.isTextUIContent.value" class="character-name"
          :style="characterNameStyle">{{ characterName }}</div>
        <div v-else class="dialogue-header-left">
          <!-- Choices inside header when it's a scene with no character name -->
          <ChoiceList v-if="!game.coreSystem.isTextUIContent.value" />
        </div>
        <div class="header-buttons">
          <button class="header-button logs-button" @click="game.dungeonSystem.isLogsPopupOpen.value = true"
            title="View logs">
            <i class="pi pi-book"></i>
          </button>
          <button class="header-button collapse-button" @click="toggleDialogueCollapse" title="Hide dialogue (Ctrl+H)">
          </button>
        </div>
      </div>

      <!-- Text dungeon layout: side column (left, fixed 500px) + content (right, flex, max 800px) -->
      <div v-if="isTextDungeon && !game.dungeonSystem.toolbarMinimized.value && !isDialogueCollapsed"
        class="text-dungeon-layout">
        <div class="overlay-navigation-side">
          <CustomComponentContainer :slot="'overlay-navigation-side'"
            :context="{ dungeon: game.dungeonSystem.currentDungeon.value }" />
        </div>

        <div class="event-container" :class="{
          'clickable': !isSceneBlocked && !Array.isArray(game.dungeonSystem.relevantChoices.value),
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
              <div v-if="game.dungeonSystem.currentSceneId.value" class="dialogue-content event-content"
                :style="dialogueContentStyle">
                <span v-if="talkingCharacterHasNoArt" class="inline-character-name" :style="characterNameStyle">{{
                  characterName }}: </span>
                <span v-script="{ html: displayContent, resolver: false, disabled: typingAnimation.isAnimating.value }"
                  style="display:inline"></span>
              </div>
              <!-- encounters-->
              <div v-else class="dialogue-content encounter-content" :style="dialogueContentStyle">
                <TextEncounter />
              </div>
              <!-- flash messages-->
              <div v-if="showFlashContent && game.dungeonSystem.cachedFlashArray.value.length > 0"
                ref="flashContentElement" class="flash-content"
                v-script="{ html: game.dungeonSystem.cachedFlashArray.value.join('<br>'), resolver: false }"></div>

              <!-- Scene choices for text dungeons -->
              <ChoiceList v-if="game.dungeonSystem.currentSceneId.value" />
              <CustomComponentContainer :slot="'scene-content-bottom'"
                :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
            </div>

          </div>
        </div>
      </div>

      <!-- Regular (non-text) dungeon layout -->
      <div v-else-if="!game.dungeonSystem.toolbarMinimized.value && !isDialogueCollapsed" class="event-container"
        :class="{ 'clickable': !isSceneBlocked && !Array.isArray(game.dungeonSystem.relevantChoices.value), 'text-selectable': isTextSelectable }"
        @click="handleEventClick">
        <div class="character-section">
          <CharacterFace :key="game.dungeonSystem.talkingCharacter.value?.id"
            :character="game.dungeonSystem.talkingCharacter.value ?? undefined" />
        </div>

        <div class="content-wrapper">
          <CustomComponentContainer :slot="'scene-content-top'"
            :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
          <!-- events scenes-->
          <div v-if="game.dungeonSystem.currentSceneId.value" class="dialogue-content event-content"
            :style="dialogueContentStyle"
            v-script="{ html: displayContent, resolver: false, disabled: typingAnimation.isAnimating.value }"></div>
          <!-- encounters-->
          <div v-else class="dialogue-content encounter-content" :style="dialogueContentStyle">
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
          <!-- flash messages-->
          <div v-if="showFlashContent && game.dungeonSystem.cachedFlashArray.value.length > 0" ref="flashContentElement"
            class="flash-content"
            v-script="{ html: game.dungeonSystem.cachedFlashArray.value.join('<br>'), resolver: false }">
          </div>

          <ChoiceList v-if="!game.dungeonSystem.toolbarMinimized.value && game.coreSystem.isTextUIContent.value" />
          <CustomComponentContainer :slot="'scene-content-bottom'"
            :context="{ sceneId: game.dungeonSystem.currentSceneId.value }" />
        </div>
      </div>
    </div>

    <!-- Screen-dungeon side column: absolutely positioned on the right edge of the viewport -->
    <div v-if="!isTextDungeon" class="overlay-navigation-side overlay-navigation-side--screen">
      <CustomComponentContainer :slot="'overlay-navigation-side'"
        :context="{ dungeon: game.dungeonSystem.currentDungeon.value }" />
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID"
      :context="{ dungeon: game.dungeonSystem.currentDungeon.value, choices: game.dungeonSystem.relevantChoices.value }" />
  </div>


</template>

<style scoped>
.overlay {
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
  display: flex;
  flex-direction: column;
}

.overlay.text .character-section {
  align-items: start;
}

.event-container {
  border: 1px solid #eee;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.8);
  margin-bottom: 1rem;
  display: flex;
  position: relative;
  max-height: 40dvh;
  min-height: 0;
  overflow-y: auto;
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
  overflow-y: visible;
  background: #2d2d2d4f;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;

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
  color: white;
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
  margin-left: 520px;
}

.character-name {
  font-weight: bold;
  padding: 4px 8px;
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid #eee;
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
  background: none;
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

/* Text dungeon layout: fixed-width content column + side column */
.text-dungeon-layout {
  display: flex;
  gap: 20px;
  height: 100%;
  flex: 1;
  align-items: stretch;
}

/* In dialogue (scene) mode the whole event-container is the click target,
   so lift the whole container via border only — keep the dark base background. */
.overlay.text .event-container.dialogue-mode {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

/* Side column — left, fixed 500px in text dungeons. */
.overlay.text .overlay-navigation-side {
  flex: 0 0 500px;
  width: 500px;
  padding: 10px;
  padding-bottom: 1em;
  box-sizing: border-box;
  overflow-y: auto;
  background: #2d2d2d4f;
  height: 100%;
}

/* Side column — screen dungeons: absolutely positioned on the right edge of the viewport,
   empty by default so pass clicks through to underlying UI. */
.overlay-navigation-side--screen {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  padding: 20px;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 5;
}

.overlay-navigation-side--screen>* {
  pointer-events: auto;
}
</style>

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
import TextMap from '../TextMap.vue';

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

const showContinueIndicator = computed(() => {
  const choices = game.dungeonSystem.relevantChoices.value;
  return game.dungeonSystem.choiceType.value !== 'encounter' && choices && !Array.isArray(choices);
});


// 3 mods: map encounters, dialogue events, prose content

function handleEventClick(event: MouseEvent) {
  //console.log('handleEventClick', event);
  if (game.coreSystem.getState('disable_ui')) {
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

// Full map modal state
const isFullMapOpen = ref(false);

function openFullMap() {
  isFullMapOpen.value = true;
}

function closeFullMap() {
  isFullMapOpen.value = false;
}

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

      <!-- Text dungeon layout: content + map side by side -->
      <div v-if="isTextDungeon && !game.dungeonSystem.toolbarMinimized.value && !isDialogueCollapsed"
        class="text-dungeon-layout">
        <div class="event-container"
          :class="{ 'clickable': !Array.isArray(game.dungeonSystem.relevantChoices.value), 'text-selectable': isTextSelectable }"
          @click="handleEventClick">
          <div class="character-section">
            <CharacterFace :key="game.dungeonSystem.talkingCharacter.value?.id"
              :character="game.dungeonSystem.talkingCharacter.value ?? undefined" />
          </div>

          <div class="content-wrapper">
            <!-- events scenes-->
            <div v-if="game.dungeonSystem.currentSceneId.value" class="dialogue-content event-content"
              :style="dialogueContentStyle" v-html="displayContent"></div>
            <!-- encounters-->
            <div v-else class="dialogue-content encounter-content" :style="dialogueContentStyle">
              <TextEncounter />
            </div>
            <!-- flash messages-->
            <div v-if="showFlashContent && game.dungeonSystem.cachedFlashArray.value.length > 0"
              ref="flashContentElement" class="flash-content"
              v-html="game.dungeonSystem.cachedFlashArray.value.join('<br>')"></div>

            <!-- Scene choices for text dungeons -->
            <ChoiceList v-if="game.dungeonSystem.currentSceneId.value" />
          </div>
        </div>

        <!-- Mini map for text dungeons (hide during scenes) -->
        <div v-if="!game.dungeonSystem.currentSceneId.value" class="text-map-column">
          <button class="logs-button" @click="game.dungeonSystem.isLogsPopupOpen.value = true" title="View logs">
            <i class="pi pi-book"></i>
          </button>
          <TextMap mode="mini" @openFullMap="openFullMap" @closeFullMap="closeFullMap" />
        </div>
      </div>

      <!-- Regular (non-text) dungeon layout -->
      <div v-else-if="!game.dungeonSystem.toolbarMinimized.value && !isDialogueCollapsed" class="event-container"
        :class="{ 'clickable': !Array.isArray(game.dungeonSystem.relevantChoices.value), 'text-selectable': isTextSelectable }"
        @click="handleEventClick">
        <div class="character-section">
          <CharacterFace :key="game.dungeonSystem.talkingCharacter.value?.id"
            :character="game.dungeonSystem.talkingCharacter.value ?? undefined" />
        </div>

        <div class="content-wrapper">
          <!-- events scenes-->
          <div v-if="game.dungeonSystem.currentSceneId.value" class="dialogue-content event-content"
            :style="dialogueContentStyle" v-html="displayContent"></div>
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

              <div class="encounter-text" v-html="encounterContent"></div>
            </div>
          </div>
          <!-- flash messages-->
          <div v-if="showFlashContent && game.dungeonSystem.cachedFlashArray.value.length > 0" ref="flashContentElement"
            class="flash-content" v-html="game.dungeonSystem.cachedFlashArray.value.join('<br>')"></div>

          <ChoiceList v-if="!game.dungeonSystem.toolbarMinimized.value && game.coreSystem.isTextUIContent.value" />
        </div>
      </div>
    </div>

    <!-- Full map modal for text dungeons -->
    <Teleport to="body">
      <div v-if="!game.dungeonSystem.currentSceneId.value && isFullMapOpen" class="full-map-overlay"
        @click.self="closeFullMap">
        <TextMap mode="full" @openFullMap="openFullMap" @closeFullMap="closeFullMap" />
      </div>
    </Teleport>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
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


  border-radius: 4px;

}

.overlay.text {
  top: 0;
  bottom: 0;
  height: 100vh;
  width: calc(100% - 125px);
  max-width: none;
  left: 0;
  margin-left: 125px;
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
  flex: 1;
  margin: 0;
  border: none;
  padding: 40px 0px;
  max-width: 800px;
  border-radius: 0;
  height: 100%;
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
  justify-content: center;
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
  font-size: v-bind("global.userSettings.value.font_size + 'px'");
}

.dialogue-content {
  padding: 10px;
  line-height: 1.2em;
  font-family: var(--font-family-serif);
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
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid #eee;
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  color: white;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s ease;
  width: fit-content;
  margin-left: 5px;
}

.header-button:hover {
  background: rgba(0, 0, 0, 0.9);
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

/* Text dungeon layout with map */
.text-dungeon-layout {
  display: flex;
  gap: 20px;
  height: 100%;
  flex: 1;
}

.text-dungeon-layout .event-container {
  flex: 1;
}

.text-map-column {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: 50px;
  gap: 10px;
}

.text-map-column .logs-button {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.text-map-column .logs-button:hover {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.5);
}

/* Full map modal overlay */
.full-map-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
</style>

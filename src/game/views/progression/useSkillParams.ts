import { computed } from 'vue';
import { Game } from '../../game';

/**
 * Parse params from skill
 */
export function parseSkillParams(skill: any): Record<string, any> | null {
  if (!skill.params || typeof skill.params !== 'string' || skill.params.trim() === '') {
    return null;
  }

  try {
    const game = Game.getInstance();
    return JSON.parse(game.logicSystem.fixJson(skill.params));
  } catch (e) {
    console.error(`Failed to parse params for skill ${skill.id}:`, e);
    return null;
  }
}

/**
 * Check if a skill is visible (non-reactive)
 */
export function isSkillVisible(skill: any): boolean {
  const params = parseSkillParams(skill);
  if (!params) {
    return true;
  }

  const game = Game.getInstance();
  return game.logicSystem.performConditionalEvaluation(params, false);
}

/**
 * Check if skill is disabled by params (non-reactive)
 */
export function isSkillDisabledByParams(skill: any): boolean {
  const params = parseSkillParams(skill);
  if (!params) {
    return false;
  }

  const game = Game.getInstance();
  return !game.logicSystem.performConditionalEvaluation(params, true);
}

/**
 * Composable for reactive skill params in components
 */
export function useSkillParams(skill: any) {
  // Computed 'if' condition for skill visibility
  const isVisible = computed(() => {
    const params = parseSkillParams(skill);
    if (!params) {
      return true;
    }

    const game = Game.getInstance();
    return game.logicSystem.performConditionalEvaluation(params, false);
  });

  // Computed 'disabled' condition for skill availability
  const isDisabledByParams = computed(() => {
    const params = parseSkillParams(skill);
    if (!params) {
      return false; // Not disabled by params
    }

    // active means "is available", so we need to invert it for "is disabled"
    const game = Game.getInstance();
    return !game.logicSystem.performConditionalEvaluation(params, true);
  });

  return {
    isVisible,
    isDisabledByParams
  };
}

import type { SceneGrade } from '../game/systems/dungeonSystem';

/**
 * Scene grade and flash presets as authored: partial grades that DungeonSystem fills out with
 * fullGrade. Pure data, so the editor can list the preset names without loading the game.
 */

// Two things learned tuning these against real art:
//
// 1. The tint is a linear blend TOWARD a colour — the matrix is scaled by (1 - tint_amount) and the
//    tint added to the offset column. Any tint therefore drags luminance toward that colour, so a
//    dark tint darkens. Bright presets use light tint colours; copying a dark-tint preset and merely
//    raising `brightness` gives muddy grey, not a brighter scene.
// 2. Pull `saturate` down before leaning on the tint. A source colour that keeps its saturation
//    fights the blend, so a subtle tint over, say, a yellow-green field reads as no tint at all.
//    Every preset here that wants a recognisable hue desaturates first.
export const RAW_GRADE_PRESETS: Record<string, Partial<SceneGrade>> = {
  // fullGrade fills every field from the identity grade.
  none: {},

  // Light & time of day
  dawn: {
    brightness: 1.0, saturate: 0.88, contrast: 1.0, hue: 3, r: 255, g: 190, b: 150, tint_amount: 0.1,
    shadow_r: 70, shadow_g: 80, shadow_b: 140, shadow_amount: 0.25, highlight_r: 255, highlight_g: 200, highlight_b: 170, highlight_amount: 0.35,
    sky_top_r: 150, sky_top_g: 165, sky_top_b: 215, sky_mid_r: 255, sky_mid_g: 175, sky_mid_b: 140, sky_bottom_r: 110, sky_bottom_g: 105, sky_bottom_b: 140, sky_amount: 0.55,
    vignette: 0.2, rays: 0.3, rays_angle: 30,
  },
  // Low sun: warm amber highlights over cool violet shadows, a sky that is dark violet up top and
  // glows at the horizon, a soft vignette and slanting rays. Brightness barely drops — dusk is a
  // colour shift, not a dimmer.
  dusk: {
    brightness: 0.9, saturate: 0.92, contrast: 1.1, hue: 0, r: 255, g: 140, b: 70, tint_amount: 0.08,
    shadow_r: 40, shadow_g: 30, shadow_b: 85, shadow_amount: 0.22,
    highlight_r: 255, highlight_g: 175, highlight_b: 105, highlight_amount: 0.45,
    sky_top_r: 55, sky_top_g: 40, sky_top_b: 110, sky_mid_r: 255, sky_mid_g: 125, sky_mid_b: 55,
    sky_bottom_r: 45, sky_bottom_g: 30, sky_bottom_b: 80, sky_amount: 0.7,
    vignette: 0.5, rays: 0.5, rays_angle: -25,
  },
  night: {
    brightness: 0.6, saturate: 0.6, contrast: 1.08, hue: -8, r: 25, g: 40, b: 85, tint_amount: 0.18,
    shadow_r: 10, shadow_g: 18, shadow_b: 50, shadow_amount: 0.35, highlight_r: 150, highlight_g: 175, highlight_b: 230, highlight_amount: 0.25,
    sky_top_r: 20, sky_top_g: 30, sky_top_b: 70, sky_mid_r: 60, sky_mid_g: 80, sky_mid_b: 140, sky_bottom_r: 15, sky_bottom_g: 20, sky_bottom_b: 45, sky_amount: 0.6,
    vignette: 0.6,
  },
  moonlit: {
    brightness: 0.8, saturate: 0.45, contrast: 1.12, hue: -12, r: 30, g: 60, b: 125, tint_amount: 0.14,
    shadow_r: 12, shadow_g: 22, shadow_b: 60, shadow_amount: 0.35, highlight_r: 215, highlight_g: 228, highlight_b: 255, highlight_amount: 0.55,
    sky_top_r: 120, sky_top_g: 140, sky_top_b: 200, sky_mid_r: 60, sky_mid_g: 80, sky_mid_b: 140, sky_bottom_r: 15, sky_bottom_g: 20, sky_bottom_b: 50, sky_amount: 0.6,
    vignette: 0.5, rays: 0.35, rays_angle: 15,
  },
  sunlit: {
    brightness: 1.12, saturate: 1.0, contrast: 1.06, hue: 3, r: 255, g: 228, b: 176, tint_amount: 0.12,
    shadow_r: 90, shadow_g: 70, shadow_b: 60, shadow_amount: 0.12, highlight_r: 255, highlight_g: 235, highlight_b: 190, highlight_amount: 0.3,
    sky_top_r: 175, sky_top_g: 195, sky_top_b: 235, sky_mid_r: 255, sky_mid_g: 225, sky_mid_b: 170, sky_bottom_r: 140, sky_bottom_g: 120, sky_bottom_b: 95, sky_amount: 0.45,
    vignette: 0.1, rays: 0.45, rays_angle: 25,
  },
  bright: {
    brightness: 1.3, saturate: 0.65, contrast: 1.15, hue: 0, r: 255, g: 248, b: 232, tint_amount: 0.15,
    shadow_r: 200, shadow_g: 195, shadow_b: 190, shadow_amount: 0.2, highlight_r: 255, highlight_g: 252, highlight_b: 240, highlight_amount: 0.45,
    rays: 0.35, rays_angle: 10,
  },

  // Weather & place
  overcast: {
    brightness: 0.94, saturate: 0.5, contrast: 0.95, hue: 0, r: 170, g: 180, b: 192, tint_amount: 0.15,
    shadow_r: 60, shadow_g: 66, shadow_b: 78, shadow_amount: 0.2, highlight_r: 220, highlight_g: 225, highlight_b: 232, highlight_amount: 0.2,
    sky_top_r: 175, sky_top_g: 180, sky_top_b: 190, sky_mid_r: 128, sky_mid_g: 128, sky_mid_b: 132, sky_bottom_r: 100, sky_bottom_g: 104, sky_bottom_b: 110, sky_amount: 0.4,
    vignette: 0.25,
  },
  stormy: {
    brightness: 0.6, saturate: 0.38, contrast: 1.12, hue: 0, r: 42, g: 48, b: 58, tint_amount: 0.18,
    shadow_r: 20, shadow_g: 26, shadow_b: 38, shadow_amount: 0.35, highlight_r: 175, highlight_g: 190, highlight_b: 205, highlight_amount: 0.25,
    sky_top_r: 30, sky_top_g: 35, sky_top_b: 50, sky_mid_r: 90, sky_mid_g: 100, sky_mid_b: 115, sky_bottom_r: 40, sky_bottom_g: 45, sky_bottom_b: 55, sky_amount: 0.65,
    vignette: 0.55,
  },
  foggy: {
    brightness: 1.06, saturate: 0.35, contrast: 0.8, hue: 0, r: 221, g: 227, b: 232, tint_amount: 0.3,
    shadow_r: 175, shadow_g: 182, shadow_b: 190, shadow_amount: 0.35, highlight_r: 240, highlight_g: 243, highlight_b: 246, highlight_amount: 0.25,
    sky_top_r: 150, sky_top_g: 155, sky_top_b: 160, sky_mid_r: 200, sky_mid_g: 205, sky_mid_b: 210, sky_bottom_r: 215, sky_bottom_g: 220, sky_bottom_b: 225, sky_amount: 0.6,
  },
  underwater: {
    brightness: 0.72, saturate: 0.55, contrast: 1.02, hue: -10, r: 20, g: 112, b: 126, tint_amount: 0.32,
    shadow_r: 5, shadow_g: 40, shadow_b: 60, shadow_amount: 0.35, highlight_r: 150, highlight_g: 235, highlight_b: 230, highlight_amount: 0.3,
    sky_top_r: 120, sky_top_g: 220, sky_top_b: 220, sky_mid_r: 40, sky_mid_g: 120, sky_mid_b: 130, sky_bottom_r: 10, sky_bottom_g: 40, sky_bottom_b: 55, sky_amount: 0.6,
    vignette: 0.45, rays: 0.45, rays_angle: 8,
    actor_strength: 0.8
  },

  // Fire, cold, magic
  candlelit: {
    brightness: 0.72, saturate: 0.85, contrast: 1.08, hue: 6, r: 107, g: 58, b: 18, tint_amount: 0.16,
    shadow_r: 40, shadow_g: 22, shadow_b: 15, shadow_amount: 0.3, highlight_r: 255, highlight_g: 190, highlight_b: 110, highlight_amount: 0.4,
    vignette: 0.65,
  },
  infernal: {
    brightness: 0.8, saturate: 0.75, contrast: 1.15, hue: -4, r: 160, g: 28, b: 5, tint_amount: 0.3,
    shadow_r: 60, shadow_g: 5, shadow_b: 0, shadow_amount: 0.35, highlight_r: 255, highlight_g: 170, highlight_b: 60, highlight_amount: 0.4,
    sky_top_r: 40, sky_top_g: 10, sky_top_b: 10, sky_mid_r: 150, sky_mid_g: 50, sky_mid_b: 20, sky_bottom_r: 255, sky_bottom_g: 120, sky_bottom_b: 40, sky_amount: 0.6,
    vignette: 0.45,
  },
  frozen: {
    brightness: 1.02, saturate: 0.38, contrast: 1.06, hue: -6, r: 168, g: 220, b: 240, tint_amount: 0.25,
    shadow_r: 70, shadow_g: 110, shadow_b: 150, shadow_amount: 0.3, highlight_r: 230, highlight_g: 248, highlight_b: 255, highlight_amount: 0.35,
    sky_top_r: 190, sky_top_g: 225, sky_top_b: 245, sky_mid_r: 160, sky_mid_g: 200, sky_mid_b: 225, sky_bottom_r: 120, sky_bottom_g: 150, sky_bottom_b: 175, sky_amount: 0.45,
    vignette: 0.25,
  },
  arcane: {
    brightness: 0.82, saturate: 0.55, contrast: 1.1, hue: 0, r: 107, g: 46, b: 168, tint_amount: 0.2,
    shadow_r: 35, shadow_g: 15, shadow_b: 70, shadow_amount: 0.35, highlight_r: 230, highlight_g: 170, highlight_b: 255, highlight_amount: 0.35,
    sky_top_r: 60, sky_top_g: 25, sky_top_b: 110, sky_mid_r: 150, sky_mid_g: 90, sky_mid_b: 220, sky_bottom_r: 40, sky_bottom_g: 20, sky_bottom_b: 80, sky_amount: 0.4,
    vignette: 0.5,
  },
  void: {
    brightness: 0.42, saturate: 0.2, contrast: 1.2, hue: 0, r: 10, g: 6, b: 18, tint_amount: 0.35,
    shadow_r: 8, shadow_g: 4, shadow_b: 16, shadow_amount: 0.3, highlight_r: 120, highlight_g: 100, highlight_b: 150, highlight_amount: 0.15,
    sky_top_r: 15, sky_top_g: 10, sky_top_b: 25, sky_mid_r: 40, sky_mid_g: 30, sky_mid_b: 60, sky_bottom_r: 10, sky_bottom_g: 6, sky_bottom_b: 18, sky_amount: 0.5,
    vignette: 0.8,
    actor_strength: 0.8
  },

  // Body & mind
  sickly: {
    brightness: 0.75, saturate: 0.6, contrast: 1.08, hue: 30, r: 45, g: 74, b: 30, tint_amount: 0.18,
    shadow_r: 35, shadow_g: 45, shadow_b: 15, shadow_amount: 0.3, highlight_r: 210, highlight_g: 230, highlight_b: 120, highlight_amount: 0.3,
    vignette: 0.5,
  },
  bloodied: {
    brightness: 0.72, saturate: 0.55, contrast: 1.12, hue: -4, r: 140, g: 16, b: 16, tint_amount: 0.35,
    shadow_r: 60, shadow_g: 0, shadow_b: 0, shadow_amount: 0.3, highlight_r: 255, highlight_g: 140, highlight_b: 140, highlight_amount: 0.2,
    vignette: 0.7,
  },
  dream: {
    brightness: 1.12, saturate: 0.5, contrast: 0.9, hue: 4, r: 255, g: 210, b: 238, tint_amount: 0.2,
    shadow_r: 200, shadow_g: 170, shadow_b: 215, shadow_amount: 0.28, highlight_r: 255, highlight_g: 240, highlight_b: 250, highlight_amount: 0.35,
    sky_top_r: 255, sky_top_g: 210, sky_top_b: 240, sky_mid_r: 220, sky_mid_g: 200, sky_mid_b: 240, sky_bottom_r: 200, sky_bottom_g: 190, sky_bottom_b: 230, sky_amount: 0.5,
    rays: 0.25, rays_angle: 0,
    actor_strength: 0.8
  },
  nightmare: {
    brightness: 0.48, saturate: 0.25, contrast: 1.3, hue: 0, r: 26, g: 13, b: 20, tint_amount: 0.3,
    shadow_r: 30, shadow_g: 0, shadow_b: 10, shadow_amount: 0.35, highlight_r: 170, highlight_g: 140, highlight_b: 150, highlight_amount: 0.15,
    vignette: 0.85,
    actor_strength: 0.8
  },

  // Utility
  memory: {
    brightness: 0.98, saturate: 0.35, contrast: 0.95, hue: 12, r: 201, g: 168, b: 120, tint_amount: 0.3,
    shadow_r: 80, shadow_g: 60, shadow_b: 40, shadow_amount: 0.3, highlight_r: 245, highlight_g: 230, highlight_b: 200, highlight_amount: 0.3,
    vignette: 0.5,
    actor_strength: 1
  },
  noir: {
    brightness: 0.95, saturate: 0, contrast: 1.25, hue: 0, r: 0, g: 0, b: 0, tint_amount: 0,
    vignette: 0.55,
    actor_strength: 1
  },
};

// Colours for {screen_flash}: a short pulse on the grade matrix, then straight back to the saved
// grade. Any grade preset name also works ("infernal", "arcane#0.6").
export const RAW_FLASH_PRESETS: Record<string, Partial<SceneGrade>> = {
  red: { brightness: 1.05, saturate: 0.6, contrast: 1.1, hue: 0, r: 200, g: 20, b: 20, tint_amount: 0.55, actor_strength: 1 },
  white: { brightness: 1.8, saturate: 0.4, contrast: 0.9, hue: 0, r: 255, g: 255, b: 255, tint_amount: 0.55, actor_strength: 1 },
};

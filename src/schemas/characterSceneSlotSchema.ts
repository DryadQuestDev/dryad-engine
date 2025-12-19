import { Schema, SchemaToType } from '../utility/schema';

export const CharacterSceneSlotSchema = {
    // Base Properties
    id: { type: 'string', required: true, tooltip: 'Slot ID used to reference this slot.' },
    x: { type: 'number', tooltip: 'Position in % of the scene width.' },
    y: { type: 'number', tooltip: 'Position in % of the scene height.' },
    // Layering
    z: { type: 'number', tooltip: 'Z-index for layering (higher = front).', defaultValue: 0, step: 1 },
    scale: { type: 'number', tooltip: 'Scale of the character.', defaultValue: 1, step: 0.1 },

    // Transform Properties
    xanchor: { type: 'number', defaultValue: 50, tooltip: 'Horizontal rotation pivot in % (0=left, 50=center, 100=right). Only affects rotation, NOT position or scale.', step: 1 },
    yanchor: { type: 'number', defaultValue: 50, tooltip: 'Vertical rotation pivot in % (0=top, 50=center, 100=bottom). Only affects rotation, NOT position or scale.', step: 1 },
    rotation: { type: 'number', tooltip: 'Rotation in degrees.', defaultValue: 0, step: 1 },
    alpha: { type: 'number', tooltip: 'Opacity (0.0 = transparent, 1.0 = opaque).', defaultValue: 1, step: 0.1 },
    blur: { type: 'number', tooltip: 'Blur effect in pixels.', defaultValue: 0, step: 1 },
    mirror: { type: 'boolean', tooltip: 'Flip character horizontally.' },

    // Enter Transition Properties
    enter: {
        type: 'chooseOne',
        tooltip: 'Enter transition effect type.',
        defaultValue: 'none',
        options: [
            'none', 'blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut',
            'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp',
            'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop',
            'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom',
            'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp',
            'sweep', 'zoomIn', 'zoomOut'
        ]
    },
    enter_duration: { type: 'number', tooltip: 'Enter transition duration in seconds.', step: 0.1, show: { enter: ['fade', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'zoomIn', 'zoomOut', 'grow', 'shrink', 'fadeSlideUp', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'rotate', 'rotateIn', 'rotateOut', 'flip', 'flipVertical', 'elastic', 'bounce', 'pop', 'sweep', 'blurIn', 'moveInLeft', 'moveInRight', 'moveInTop', 'moveInBottom', 'ease', 'easeIn', 'easeOut', 'easeInOut'] } },
    enter_delay: { type: 'number', tooltip: 'Delay before enter transition starts in seconds.', step: 0.1, show: { enter: ['fade', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'zoomIn', 'zoomOut', 'grow', 'shrink', 'fadeSlideUp', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'rotate', 'rotateIn', 'rotateOut', 'flip', 'flipVertical', 'elastic', 'bounce', 'pop', 'sweep', 'blurIn', 'moveInLeft', 'moveInRight', 'moveInTop', 'moveInBottom', 'ease', 'easeIn', 'easeOut', 'easeInOut'] } },
    enter_ease: {
        type: 'chooseOne',
        tooltip: 'Enter transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { enter: ['fade', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'zoomIn', 'zoomOut', 'grow', 'shrink', 'fadeSlideUp', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'rotate', 'rotateIn', 'rotateOut', 'flip', 'flipVertical', 'elastic', 'bounce', 'pop', 'sweep', 'blurIn', 'moveInLeft', 'moveInRight', 'moveInTop', 'moveInBottom', 'ease', 'easeIn', 'easeOut', 'easeInOut'] }
    },

    // Exit Transition Properties
    exit: {
        type: 'chooseOne',
        tooltip: 'Exit transition effect type.',
        defaultValue: 'none',
        options: [
            'none', 'blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown',
            'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow',
            'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom',
            'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut'
        ]
    },
    exit_duration: { type: 'number', tooltip: 'Exit transition duration in seconds.', defaultValue: 0, step: 0.1, show: { exit: ['fade', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideOutBottom', 'zoomIn', 'zoomOut', 'shrink', 'grow', 'fadeSlideUp', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'rotate', 'rotateOut', 'flip', 'flipVertical', 'elastic', 'bounce', 'blurOut'] } },
    exit_ease: {
        type: 'chooseOne',
        tooltip: 'Exit transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { exit: ['fade', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideOutBottom', 'zoomIn', 'zoomOut', 'shrink', 'grow', 'fadeSlideUp', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'rotate', 'rotateOut', 'flip', 'flipVertical', 'elastic', 'bounce', 'blurOut'] }
    },

    // Loop Animation Properties
    idle: {
        type: 'chooseOne',
        tooltip: 'Continuous idle animation type.',
        defaultValue: 'none',
        options: [
            'none', 'blink', 'bounce', 'breathe', 'float', 'glitch', 'glow', 'hop', 'jitter', 'lean',
            'nod', 'pan', 'pulse', 'rock', 'rotate', 'shake', 'shimmy', 'sway', 'wave', 'wiggle'
        ]
    },
    idle_duration: { type: 'number', tooltip: 'Duration of one loop cycle in seconds.', defaultValue: 0, step: 0.1, show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'] } },
    idle_intensity: { type: 'number', tooltip: 'Loop animation intensity (0.0 = subtle, 1.0 = strong).', defaultValue: 0, step: 0.1, show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'] } },

    // Filter Effects
    brightness: { type: 'number', tooltip: 'Brightness adjustment (1.0 = normal).', defaultValue: 1, step: 0.1 },
    contrast: { type: 'number', tooltip: 'Contrast adjustment (1.0 = normal).', defaultValue: 1, step: 0.1 },
    saturate: { type: 'number', tooltip: 'Saturation level (0 = grayscale, 1.0 = normal).', defaultValue: 1, step: 0.1 },
    sepia: { type: 'number', tooltip: 'Sepia effect (0 = none, 1.0 = full sepia).', defaultValue: 0, step: 0.1 },
    hue: { type: 'number', tooltip: 'Hue rotation in degrees for color tinting.', defaultValue: 0, step: 1 },


} satisfies Schema;

export type CharacterSceneSlotObject = SchemaToType<typeof CharacterSceneSlotSchema>;
import { Schema, SchemaToType } from '../utility/schema';

export const AssetSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true },
    type: { type: 'chooseOne', options: ['image', 'video', 'spine'], defaultValue: 'image', tooltip: 'Type of asset to display.' },
    hide_actors: { type: 'boolean', tooltip: 'Hide the scene actors while this asset is visible. Auto-cleared when an actor is staged/moved/updated, so staging a character brings the actors back.' },
    solo: { type: 'boolean', tooltip: 'Remove all currently staged assets when this one is added, so it becomes the only asset on scene. The dungeon/room default assets (the backdrop) are kept. Removed assets honor their own exit animations.' },
    bg: { type: 'boolean', tooltip: 'Mark this asset as a background: like the dungeon/room defaults, it is preserved by the "clear" keyword and by solo assets, until "false"/"reset" or an explicit removal. Set at stage time via inline props, e.g. forest(bg = true).' },

    // File fields (conditional based on type)
    file_image: { type: 'file', fileType: 'image', tooltip: 'Path to an image file.', show: { type: ['image'] } },
    layers: { type: 'file[]', fileType: 'image', tooltip: 'Extra image layers stacked on top of the base image, in order. Every layer shares the asset\'s fit mode, position, scale, opacity and blur — author them pre-registered at the same canvas size. Listeners on the asset_resolve emitter may filter this list or swap an entry for { file, classes } to add css classes to one layer.', show: { type: ['image'] } },
    file_video: { type: 'file', fileType: 'video', tooltip: 'Path to a video file.', show: { type: ['video'] } },
    file_spine_atlas: { type: 'file', fileType: 'atlas', tooltip: 'Path to Spine atlas file (.atlas).', show: { type: ['spine'] } },
    file_spine_skeleton: { type: 'file', fileType: 'spine_skeleton', tooltip: 'Path to Spine skeleton file (.json or .skel binary).', show: { type: ['spine'] } },
    gallery: {
        type: 'schema', objects: {
            gallery_id: { type: 'chooseOne', fromFile: 'galleries', fromFileTypeAnd: { type: 'assets' }, tooltip: 'Gallery ID to display the asset in.' },
            gallery_order: { type: 'number', tooltip: 'Display order within the gallery (ascending). Falls back to ID when unset or tied.', defaultValue: 0 },
            entity_name: { type: 'string', tooltip: 'Name of the asset to display in the gallery.' },
            entity_description: { type: 'htmlarea', tooltip: 'Description of the asset to display in the gallery.' },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
    // Fit mode
    fit_mode: {
        type: 'chooseOne',
        tooltip: 'How the asset fits within its container. Cover = fills container (may crop), Contain = fits inside (may letterbox), Fill = stretches to fill, Scale-down = like contain but never upscales, None = original size.',
        options: ['cover', 'contain', 'fill', 'scale-down', 'none'],
        defaultValue: 'none'
    },
    // Positioning
    x: { type: 'number', tooltip: 'Horizontal position as percentage of container width (0-100). 0 = left edge, 50 = center, 100 = right edge.', defaultValue: 0 },
    y: { type: 'number', tooltip: 'Vertical position as percentage of container height (0-100). 0 = top edge, 50 = center, 100 = bottom edge.', defaultValue: 0 },

    // Layering
    z: { type: 'number', tooltip: 'Layer order. Higher values appear on top. Use negative values for backgrounds below other elements.', defaultValue: 0 },

    // Scaling
    scale: { type: 'number', tooltip: 'Uniform scale factor for the asset. 1.0 = original size, 2.0 = double size, 0.5 = half size.', defaultValue: 1, step: 0.1 },
    xscale: { type: 'number', tooltip: 'Horizontal scale factor. Negative values flip horizontally. Overrides uniform scale for X axis.', step: 0.1 },
    yscale: { type: 'number', tooltip: 'Vertical scale factor. Negative values flip vertically. Overrides uniform scale for Y axis.', step: 0.1 },

    // Spine-specific properties start
    animation: {
        type: 'string',
        tooltip: 'Name of the Spine animation to play.',
        show: { type: ['spine'] }
    },
    skins: {
        type: 'string[]',
        tooltip: 'Array of skin names to combine. Skins are layered in order (e.g., ["mc/skin_color1", "hair/length2"]).',
        show: { type: ['spine'] }
    },
    loop: {
        type: 'boolean',
        tooltip: 'Whether to loop the Spine animation.',
        defaultValue: true,
        show: { type: ['spine'] }
    },
    timescale: {
        type: 'number',
        tooltip: 'Speed multiplier for Spine animation. 1.0 = normal speed, 2.0 = double speed, 0.5 = half speed.',
        defaultValue: 1.0,
        step: 0.1,
        show: { type: ['spine'] }
    },
    slot_colors: {
        type: 'schema[]',
        tooltip: 'Runtime slot tints (e.g. recolor red-based hair). RGB multipliers x brightness may exceed 1 to re-brighten dark base art. Re-applied after skin changes; scripts may inject these at add time (asset_render emitter).',
        show: { type: ['spine'] },
        objects: {
            slot: { type: 'string', tooltip: 'Slot name to tint (e.g. hair_front).' },
            r: { type: 'number', tooltip: 'Red multiplier.', defaultValue: 1, step: 0.05 },
            g: { type: 'number', tooltip: 'Green multiplier.', defaultValue: 1, step: 0.05 },
            b: { type: 'number', tooltip: 'Blue multiplier.', defaultValue: 1, step: 0.05 },
            alpha: { type: 'number', tooltip: 'Slot alpha (0-1).', defaultValue: 1, step: 0.05 },
            brightness: { type: 'number', tooltip: 'Brightness multiplier on all three channels.', defaultValue: 1, step: 0.05 },
        }
    },
    slot_remove: {
        type: 'string[]',
        tooltip: 'Slot names whose attachment is cleared (hidden), e.g. an fx overlay.',
        show: { type: ['spine'] }
    },
    viewport: {
        type: 'schema',
        tooltip: 'Viewport adjustments for the Spine animation. Offsets and zoom applied on top of auto-calculated bounds.',
        show: { type: ['spine'] },
        objects: {
            dx: { type: 'number', tooltip: 'Horizontal offset from auto-calculated center.', defaultValue: 0, step: 1 },
            dy: { type: 'number', tooltip: 'Vertical offset from auto-calculated center.', defaultValue: 0, step: 1 },
            zoom: { type: 'number', tooltip: 'Scale multiplier. 1 = auto-fit, >1 = zoom in, <1 = zoom out.', defaultValue: 1, step: 0.05 },
        }
    },
    // spine specific properties end

    // Rotation and effects
    rotation: { type: 'number', tooltip: 'Rotation angle in degrees. 0 = no rotation, 90 = 90° clockwise, -90 = 90° counter-clockwise.', defaultValue: 0, step: 1 },
    alpha: { type: 'number', tooltip: 'Opacity/transparency (0.0-1.0). 0 = fully transparent, 1 = fully opaque.', defaultValue: 1, step: 0.1 },
    blur: { type: 'number', tooltip: 'Blur amount in pixels. 0 = no blur. Higher values create depth-of-field effects.', defaultValue: 0, step: 1, show: { type: ['image', 'video'] } },


    // Property tween — how an already-visible asset moves to new values
    tween: {
        type: 'number',
        tooltip: 'Seconds taken to glide to new values when this asset is re-staged with changes, e.g. {asset: "bg_mountain(scale = 2)"}. Applies to position, scale, rotation, opacity and blur; z and fit mode always snap. 0 = snap. Has no effect the first time an asset is staged — the enter transition owns that.',
        defaultValue: 0.5,
        step: 0.1,
        show: { type: ['image', 'video'] }
    },
    tween_ease: {
        type: 'chooseOne',
        tooltip: 'Easing used for the property glide.',
        defaultValue: 'power2.out',
        options: [
            'none', 'power1.out', 'power2.out', 'power3.out', 'power4.out',
            'back.out', 'elastic.out', 'bounce.out', 'circ.out', 'expo.out', 'sine.out',
            'power1.inOut', 'power2.inOut', 'power3.inOut', 'sine.inOut'
        ],
        show: { type: ['image', 'video'] }
    },

    // Enter Transition Properties
    enter: {
        type: 'chooseOne',
        tooltip: 'Enter transition effect when the asset appears.',
        defaultValue: 'none',
        options: [
            'none', 'blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut',
            'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp',
            'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop',
            'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom',
            'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp',
            'sweep', 'zoomIn', 'zoomOut',
            'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex',
            'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'
        ],
        show: { type: ['image', 'video', 'spine'] }
    },
    enter_duration: {
        type: 'number',
        tooltip: 'Enter transition duration in seconds.',
        defaultValue: 0.5,
        step: 0.1,
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video', 'spine'] }
    },
    enter_delay: {
        type: 'number',
        tooltip: 'Delay before enter transition starts in seconds.',
        defaultValue: 0,
        step: 0.1,
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video', 'spine'] }
    },
    enter_ease: {
        type: 'chooseOne',
        tooltip: 'Enter transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video', 'spine'] }
    },

    // Exit Transition Properties
    exit: {
        type: 'chooseOne',
        tooltip: 'Exit transition effect when the asset disappears.',
        defaultValue: 'none',
        options: [
            'none', 'blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown',
            'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow',
            'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom',
            'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut',
            'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex',
            'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'
        ],
        show: { type: ['image', 'video', 'spine'] }
    },
    exit_duration: {
        type: 'number',
        tooltip: 'Exit transition duration in seconds.',
        defaultValue: 0.5,
        step: 0.1,
        show: { exit: ['blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video', 'spine'] }
    },
    exit_ease: {
        type: 'chooseOne',
        tooltip: 'Exit transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { exit: ['blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video', 'spine'] }
    },

    // Idle Animations
    idle: {
        type: 'chooseOne',
        tooltip: 'Continuous looping animation effect.',
        options: [
            'none', 'blink', 'bounce', 'breathe', 'float', 'glitch', 'glow', 'hop', 'jitter', 'lean',
            'nod', 'pan', 'pulse', 'rock', 'rotate', 'shake', 'shimmy', 'sway', 'wave', 'wiggle'
        ],
        defaultValue: 'none',
        show: { type: ['image', 'video', 'spine'] }
    },
    idle_duration: {
        type: 'number',
        tooltip: 'Duration of one idle cycle in seconds.',
        defaultValue: 3,
        step: 0.1,
        show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'], type: ['image', 'video', 'spine'] }
    },
    idle_intensity: {
        type: 'number',
        tooltip: 'Intensity of the idle animation (0-1). Higher = more movement.',
        defaultValue: 0.5,
        step: 0.1,
        show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'], type: ['image', 'video', 'spine'] }
    },


} satisfies Schema;

export type AssetObject = SchemaToType<typeof AssetSchema>;

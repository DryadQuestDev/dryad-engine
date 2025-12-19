import { Schema, SchemaToType } from '../utility/schema';

export const AssetSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true },
    type: { type: 'chooseOne', options: ['image', 'video', 'spine'], defaultValue: 'image', tooltip: 'Type of asset to display.' },

    // File fields (conditional based on type)
    file_image: { type: 'file', fileType: 'image', tooltip: 'Path to an image file.', show: { type: ['image'] } },
    file_video: { type: 'file', fileType: 'video', tooltip: 'Path to a video file.', show: { type: ['video'] } },
    file_spine_atlas: { type: 'file', fileType: 'atlas', tooltip: 'Path to Spine atlas file (.atlas).', show: { type: ['spine'] } },
    file_spine_skeleton: { type: 'file', fileType: 'spine_skeleton', tooltip: 'Path to Spine skeleton file (.json or .skel binary).', show: { type: ['spine'] } },
    gallery: {
        type: 'schema', objects: {
            gallery_id: { type: 'chooseOne', fromFile: 'galleries', fromFileTypeAnd: { type: 'assets' }, tooltip: 'Gallery ID to display the asset in.' },
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
    viewport: {
        type: 'schema',
        tooltip: 'Viewport configuration for clipping the Spine animation to specific bounds.',
        show: { type: ['spine'] },
        objects: {
            x: { type: 'number', tooltip: 'X position of viewport.', defaultValue: 500, step: 1 },
            y: { type: 'number', tooltip: 'Y position of viewport.', defaultValue: 0, step: 1 },
            width: { type: 'number', tooltip: 'Width of viewport.', defaultValue: 1050, step: 1 },
            height: { type: 'number', tooltip: 'Height of viewport.', defaultValue: 1050, step: 1 },
            pad_left: { type: 'number', tooltip: 'Left padding for clipping.', defaultValue: 90, step: 1 },
            pad_right: { type: 'number', tooltip: 'Right padding for clipping.', defaultValue: 0, step: 1 },
            pad_top: { type: 'number', tooltip: 'Top padding for clipping.', defaultValue: 0, step: 1 },
            pad_bottom: { type: 'number', tooltip: 'Bottom padding for clipping.', defaultValue: 0, step: 1 },
        }
    },
    // spine specific properties end

    // Rotation and effects
    rotation: { type: 'number', tooltip: 'Rotation angle in degrees. 0 = no rotation, 90 = 90° clockwise, -90 = 90° counter-clockwise.', defaultValue: 0, step: 1 },
    alpha: { type: 'number', tooltip: 'Opacity/transparency (0.0-1.0). 0 = fully transparent, 1 = fully opaque.', defaultValue: 1, step: 0.1 },
    blur: { type: 'number', tooltip: 'Blur amount in pixels. 0 = no blur. Higher values create depth-of-field effects.', defaultValue: 0, step: 1, show: { type: ['image', 'video'] } },


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
        show: { type: ['image', 'video'] }
    },
    enter_duration: {
        type: 'number',
        tooltip: 'Enter transition duration in seconds.',
        defaultValue: 0.5,
        step: 0.1,
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video'] }
    },
    enter_delay: {
        type: 'number',
        tooltip: 'Delay before enter transition starts in seconds.',
        defaultValue: 0,
        step: 0.1,
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video'] }
    },
    enter_ease: {
        type: 'chooseOne',
        tooltip: 'Enter transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { enter: ['blurIn', 'bounce', 'dissolve', 'ease', 'easeIn', 'easeInOut', 'easeOut', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'moveInBottom', 'moveInLeft', 'moveInRight', 'moveInTop', 'pop', 'rotate', 'rotateIn', 'rotateOut', 'shrink', 'slideDown', 'slideInBottom', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideLeft', 'slideRight', 'slideUp', 'sweep', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video'] }
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
        show: { type: ['image', 'video'] }
    },
    exit_duration: {
        type: 'number',
        tooltip: 'Exit transition duration in seconds.',
        defaultValue: 0.5,
        step: 0.1,
        show: { exit: ['blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video'] }
    },
    exit_ease: {
        type: 'chooseOne',
        tooltip: 'Exit transition easing function.',
        defaultValue: 'power2',
        options: ['linear', 'power1', 'power2', 'power3', 'power4', 'back', 'elastic', 'bounce', 'circ', 'expo', 'sine'],
        show: { exit: ['blurOut', 'bounce', 'dissolve', 'elastic', 'fade', 'fadeSlideDown', 'fadeSlideLeft', 'fadeSlideRight', 'fadeSlideUp', 'flip', 'flipVertical', 'grow', 'rotate', 'rotateOut', 'shrink', 'slideDown', 'slideLeft', 'slideOutBottom', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideRight', 'slideUp', 'zoomIn', 'zoomOut', 'pixelate', 'glitch', 'scanlines', 'static', 'shatter', 'vortex', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown', 'blinds'], type: ['image', 'video'] }
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
        show: { type: ['image', 'video'] }
    },
    idle_duration: {
        type: 'number',
        tooltip: 'Duration of one idle cycle in seconds.',
        defaultValue: 3,
        step: 0.1,
        show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'], type: ['image', 'video'] }
    },
    idle_intensity: {
        type: 'number',
        tooltip: 'Intensity of the idle animation (0-1). Higher = more movement.',
        defaultValue: 0.5,
        step: 0.1,
        show: { idle: ['float', 'sway', 'pulse', 'rotate', 'breathe', 'shake', 'pan', 'bounce', 'hop', 'rock', 'nod', 'lean', 'shimmy', 'wave', 'jitter', 'blink', 'glow', 'wiggle', 'glitch'], type: ['image', 'video'] }
    },


} satisfies Schema;

export type AssetObject = SchemaToType<typeof AssetSchema>;

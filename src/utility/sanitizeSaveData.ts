import DOMPurify from 'dompurify';

const SAVE_PURIFY_CONFIG = {
    ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'span', 'br',
        'p', 'div', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img',
    ],
    ALLOWED_ATTR: ['class', 'style', 'href', 'src', 'alt', 'title'],
};

export function sanitizeSaveData<T>(value: T): T {
    if (typeof value === 'string') {
        return DOMPurify.sanitize(value, SAVE_PURIFY_CONFIG) as unknown as T;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            value[i] = sanitizeSaveData(value[i]);
        }
        return value;
    }
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        for (const k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                obj[k] = sanitizeSaveData(obj[k]);
            }
        }
        return value;
    }
    return value;
}

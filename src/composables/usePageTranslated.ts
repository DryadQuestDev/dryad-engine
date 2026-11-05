import { readonly, ref, type Ref } from 'vue';

const TRANSLATED_CLASSES = ['translated-ltr', 'translated-rtl'];

const translated = ref(false);
let observer: MutationObserver | null = null;

function read() {
  const classes = document.documentElement.classList;
  translated.value = TRANSLATED_CLASSES.some((c) => classes.contains(c));
}

/**
 * True while the browser's page translator (Chrome's "Translate to…", Google's page widget) has the page translated.
 * Both mark it with a `translated-ltr` / `translated-rtl` class on <html>, added and removed as the player switches
 * it on and off. One observer serves every caller.
 */
export function usePageTranslated(): Readonly<Ref<boolean>> {
  if (!observer && typeof document !== 'undefined') {
    read();
    observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return readonly(translated);
}

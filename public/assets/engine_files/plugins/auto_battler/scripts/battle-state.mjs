/// <reference path="./dtypes.d.ts" />

const { vue: { ref } } = window.engine;

/** @type {import('vue').Ref<Battle | null>} */
export const currentBattle = ref(null);

<script setup lang="ts">
import DPopover from './DPopover.vue';
import {
  popoverOpen,
  popoverAnchor,
  popoverHtml,
  popoverComponent,
  popoverProps,
  popoverWidth,
  popoverPlacement,
  cancelPopoverClose,
  schedulePopoverClose,
} from '../directives/popoverDirective';
</script>

<template>
  <DPopover
    :anchor="popoverAnchor"
    :html="popoverHtml"
    :component="popoverComponent"
    :componentProps="popoverProps"
    :width="popoverWidth"
    :placement="popoverPlacement"
    :open="popoverOpen"
    @enter="cancelPopoverClose"
    @leave="schedulePopoverClose"
  />
</template>

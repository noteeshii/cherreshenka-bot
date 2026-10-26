<script setup lang="ts">
import type { HalloweenStickerEffect } from '../types';

defineProps<{
  effect: HalloweenStickerEffect;
}>();

const ghostSides = ['left', 'right'] as const;
</script>

<template>
  <span :class="['halloween-decoration', `halloween-decoration--${effect}`]" aria-hidden="true">
    <svg v-if="effect === 'spider'" class="halloween-spider" viewBox="0 0 64 64">
      <g class="spider-legs">
        <path class="spider-leg spider-leg--1" d="M27 27C20 21 15 17 8 17" />
        <path class="spider-leg spider-leg--2" d="M25 31C17 29 12 29 5 32" />
        <path class="spider-leg spider-leg--3" d="M25 36C17 39 13 43 8 49" />
        <path class="spider-leg spider-leg--4" d="M28 39C22 46 21 51 20 57" />
        <path class="spider-leg spider-leg--5" d="M37 27C44 21 49 17 56 17" />
        <path class="spider-leg spider-leg--6" d="M39 31C47 29 52 29 59 32" />
        <path class="spider-leg spider-leg--7" d="M39 36C47 39 51 43 56 49" />
        <path class="spider-leg spider-leg--8" d="M36 39C42 46 43 51 44 57" />
      </g>
      <ellipse class="spider-body" cx="32" cy="36" rx="10" ry="14" />
      <circle class="spider-head" cx="32" cy="22" r="8" />
      <circle class="spider-eye" cx="29" cy="20" r="1.5" />
      <circle class="spider-eye" cx="35" cy="20" r="1.5" />
    </svg>

    <template v-else-if="effect === 'ghosts'">
      <svg
        v-for="side in ghostSides"
        :key="side"
        :class="['halloween-ghost', `halloween-ghost--${side}`]"
        viewBox="0 0 64 80"
      >
        <g class="ghost-silhouette">
          <path
            d="M12 69V34C12 18 20.5 8 32 8S52 18 52 34V69L45 62L39 70L32 62L25 70L19 62L12 69Z"
          />
          <ellipse class="ghost-eye" cx="25" cy="32" rx="3" ry="4.5" />
          <ellipse class="ghost-eye" cx="39" cy="32" rx="3" ry="4.5" />
          <ellipse class="ghost-mouth" cx="32" cy="44" rx="4" ry="5.5" />
        </g>
      </svg>
    </template>

    <svg v-else-if="effect === 'pumpkin'" class="halloween-pumpkin" viewBox="0 0 96 82">
      <path class="pumpkin-stem" d="M48 20C47 11 51 5 62 3C56 9 57 14 59 20Z" />
      <path
        class="pumpkin-body"
        d="M48 18C70 10 89 25 88 48C87 69 70 78 48 75C26 78 9 69 8 48C7 25 26 10 48 18Z"
      />
      <path class="pumpkin-groove" d="M34 18C23 31 23 62 36 75" />
      <path class="pumpkin-groove" d="M62 18C73 31 73 62 60 75" />
      <path class="pumpkin-groove" d="M48 17C42 31 42 62 48 76" />
      <g class="pumpkin-light">
        <path d="M21 39L39 34L35 48Z" />
        <path d="M75 39L57 34L61 48Z" />
        <path d="M24 56L34 61L42 56L49 62L57 56L65 61L74 55C68 69 31 70 24 56Z" />
      </g>
    </svg>
  </span>
</template>

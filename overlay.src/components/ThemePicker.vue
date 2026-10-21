<script setup lang="ts">
import type { OverlayTheme } from '../types';

const theme = defineModel<OverlayTheme>({ required: true });

const themes = [
  {
    value: 'default',
    label: 'Стандартная',
    description: 'Базовое оформление стикеров',
    disabled: false,
  },
  {
    value: 'halloween',
    label: 'Хэллоуин',
    description: 'Тёмное оформление с оранжевыми акцентами',
    disabled: false,
  },
  { value: 'new_year', label: 'Новый год', description: 'Будет добавлено позднее', disabled: true },
] as const satisfies ReadonlyArray<{
  value: OverlayTheme;
  label: string;
  description: string;
  disabled: boolean;
}>;
</script>

<template>
  <fieldset class="theme-picker">
    <legend>Тема оформления</legend>
    <p>Выберите оформление стикеров в OBS</p>
    <div class="theme-options">
      <label
        v-for="option in themes"
        :key="option.value"
        :class="['theme-option', { disabled: option.disabled }]"
      >
        <input
          v-model="theme"
          type="radio"
          name="overlay-theme"
          :value="option.value"
          :disabled="option.disabled"
        />
        <span class="theme-option-indicator" aria-hidden="true" />
        <span class="theme-option-copy"
          ><b>{{ option.label }}</b
          ><small>{{ option.description }}</small></span
        >
        <em v-if="option.disabled">Скоро</em>
      </label>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
defineProps<{ overlayUrl: string }>();
defineEmits<{ copy: [] }>();
</script>
<template>
  <section class="obs-card">
    <div class="step">02</div>
    <div>
      <h2>Добавить в OBS</h2>
      <p>
        Создайте источник «Браузер» и установите размер 1920 × 1080 или 2560 × 1440 под разрешение
        сцены. Масштаб стикеров подстроится автоматически.
      </p>
    </div>
    <div class="url-box">
      <code>{{ overlayUrl }}</code
      ><button @click="$emit('copy')">КОПИРОВАТЬ</button>
    </div>
  </section>
</template>

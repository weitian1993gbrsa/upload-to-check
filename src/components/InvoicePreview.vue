<script setup lang="ts">
import InvoicePrintLayout from './InvoicePrintLayout.vue'
import type { Receipt } from '../stores/receiptStore'

// Props: accepts a receipt object and optional branch override for previewing settings
defineProps<{
  receipt: Receipt | null
  branchOverride?: any // Allows previewing settings before saving
}>()
</script>

<template>
  <div class="invoice-preview-wrapper bg-gray-100 p-8 min-h-screen flex justify-center overflow-auto">
    <div class="scale-container">
      <InvoicePrintLayout :receipt="receipt" :branchOverride="branchOverride" />
    </div>
  </div>
</template>

<style scoped>
.invoice-preview-wrapper {
  /* This container helps with the gray background around the "page" */
  width: 100%;
}

.scale-container {
  /* Apply screen-only scaling to fit the A4 Landscape (297mm) on screen */
  transform: scale(0.65);
  transform-origin: top center;
  /* Ensure the container takes up the scaled space */
  width: 297mm;
  height: calc(210mm * 0.65);
  margin-bottom: 2rem;
}

@media print {
  .invoice-preview-wrapper {
    padding: 0 !important;
    background: transparent !important;
    min-height: auto !important;
  }
  
  .scale-container {
    transform: none !important;
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
  }
}

/* Adjust scaling for smaller screens if needed */
@media (max-width: 1200px) {
  .scale-container {
    transform: scale(0.5);
    height: calc(210mm * 0.5);
  }
}
</style>

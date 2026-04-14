import { ref } from 'vue'

export type AssetPreviewPayload = {
  src: string
  alt: string
  title: string
  previewSrc: string | null
}

export type AssetPreviewDialogState = AssetPreviewPayload & {
  visible: boolean
}

export function useAssetPreviewDialog() {
  const assetPreviewDialog = ref<AssetPreviewDialogState>({
    visible: false,
    src: '',
    alt: '',
    title: '',
    previewSrc: null
  })

  function closeAssetPreview() {
    assetPreviewDialog.value = {
      visible: false,
      src: '',
      alt: '',
      title: '',
      previewSrc: null
    }
  }

  function openAssetPreview(payload: AssetPreviewPayload) {
    assetPreviewDialog.value = {
      visible: true,
      src: payload.src,
      alt: payload.alt,
      title: payload.title,
      previewSrc: payload.previewSrc
    }
  }

  return {
    assetPreviewDialog,
    openAssetPreview,
    closeAssetPreview
  }
}

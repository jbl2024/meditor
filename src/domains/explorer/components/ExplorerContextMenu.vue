<script setup lang="ts">
import type { Component } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowTopRightOnSquareIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  TrashIcon
} from '@heroicons/vue/24/outline'
import UiMenu from '../../../shared/components/ui/UiMenu.vue'
import UiMenuList from '../../../shared/components/ui/UiMenuList.vue'

export type MenuAction =
  | 'open'
  | 'open-external'
  | 'reveal'
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'new-file'
  | 'new-folder'
  | 'cut'
  | 'copy'
  | 'paste'

const props = defineProps<{
  x: number
  y: number
  canOpen: boolean
  canPaste: boolean
  canRename: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{
  action: [action: MenuAction]
}>()

const menuRef = ref<InstanceType<typeof UiMenu> | null>(null)
const clampedX = ref(0)
const clampedY = ref(0)

const items: Array<{ id: MenuAction; label: string; icon: Component | null; enabled?: boolean }> = [
  { id: 'open', label: 'Open', icon: null },
  { id: 'open-external', label: 'Open externally', icon: ArrowTopRightOnSquareIcon },
  { id: 'reveal', label: 'Reveal in file manager', icon: null },
  { id: 'rename', label: 'Rename', icon: null },
  { id: 'duplicate', label: 'Duplicate', icon: null },
  { id: 'delete', label: 'Delete', icon: TrashIcon },
  { id: 'new-file', label: 'New note', icon: DocumentPlusIcon },
  { id: 'new-folder', label: 'New folder', icon: FolderPlusIcon },
  { id: 'cut', label: 'Cut', icon: null },
  { id: 'copy', label: 'Copy', icon: null },
  { id: 'paste', label: 'Paste', icon: null }
]

function isDisabled(id: MenuAction): boolean {
  if (id === 'open' || id === 'open-external' || id === 'reveal') return !props.canOpen
  if (id === 'rename') return !props.canRename
  if (id === 'delete') return !props.canDelete
  if (id === 'paste') return !props.canPaste
  return false
}

function onAction(id: MenuAction) {
  if (isDisabled(id)) return
  emit('action', id)
}

function recomputePosition() {
  const margin = 8
  const menuEl = menuRef.value?.getRootEl() ?? null
  const width = menuEl?.offsetWidth ?? 230
  const height = menuEl?.offsetHeight ?? 320

  let x = props.x
  let y = props.y

  if (x + width > window.innerWidth - margin) {
    x = Math.max(margin, window.innerWidth - width - margin)
  }
  if (y + height > window.innerHeight - margin) {
    y = Math.max(margin, window.innerHeight - height - margin)
  }

  clampedX.value = x
  clampedY.value = y
}

watch(
  () => [props.x, props.y],
  async () => {
    await nextTick()
    recomputePosition()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('resize', recomputePosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recomputePosition)
})
</script>

<template>
  <Teleport to="body">
    <UiMenu
      ref="menuRef"
      class-name="explorer-context-menu fixed z-[120] w-60 max-w-[calc(100vw-16px)]"
      :style="{ left: `${clampedX}px`, top: `${clampedY}px` }"
      @click.stop
    >
      <UiMenuList>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="ui-menu-item explorer-context-menu-item"
        :data-tone="item.id === 'delete' ? 'danger' : undefined"
        :disabled="isDisabled(item.id)"
        @click="onAction(item.id)"
      >
        <span v-if="item.icon" class="ui-menu-item-icon" aria-hidden="true">
          <component :is="item.icon" />
        </span>
        <span v-else class="ui-menu-item-icon-spacer" aria-hidden="true"></span>
        {{ item.label }}
      </button>
      </UiMenuList>
    </UiMenu>
  </Teleport>
</template>

<style scoped>
.explorer-context-menu-item {
  justify-content: flex-start;
}
</style>

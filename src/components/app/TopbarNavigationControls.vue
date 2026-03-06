<script setup lang="ts">
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CommandLineIcon,
  HomeIcon,
  ShareIcon,
  SparklesIcon
} from '@heroicons/vue/24/outline'
import { ref, type CSSProperties } from 'vue'
import MultiPaneToolbarMenu from '../panes/MultiPaneToolbarMenu.vue'
import WorkspaceOverflowMenu from './WorkspaceOverflowMenu.vue'
import type { ThemePreference } from '../../composables/useAppTheme'

/**
 * Module: TopbarNavigationControls
 *
 * Purpose:
 * - Render the app-shell top bar with grouped navigation, a command trigger,
 *   pane actions, and the workspace overflow menu.
 */

/** Normalized row shape rendered inside back/forward history menus. */
export type HistoryMenuItem = {
  index: number
  key: string
  label: string
}

/** Props required to render topbar controls while keeping state in the parent shell. */
const props = defineProps<{
  canGoBack: boolean
  canGoForward: boolean
  backShortcutLabel: string
  forwardShortcutLabel: string
  homeShortcutLabel: string
  commandPaletteShortcutLabel: string
  hasWorkspace: boolean
  sidebarVisible: boolean
  rightPaneVisible: boolean
  historyMenuOpen: 'back' | 'forward' | null
  historyMenuStyle: CSSProperties | Record<string, string>
  backItems: HistoryMenuItem[]
  forwardItems: HistoryMenuItem[]
  paneCount: number
  overflowMenuOpen: boolean
  indexingState: 'idle' | 'indexing' | 'indexed' | 'out_of_sync'
  zoomPercentLabel: string
  themePreference: ThemePreference
}>()

/** Events emitted for every interaction so the parent remains the single state owner. */
const emit = defineEmits<{
  historyButtonClick: [side: 'back' | 'forward']
  historyButtonContextMenu: [side: 'back' | 'forward', event: MouseEvent]
  historyButtonPointerDown: [side: 'back' | 'forward', event: PointerEvent]
  historyLongPressCancel: []
  historyTargetClick: [targetIndex: number]
  openToday: []
  openCosmos: []
  openSecondBrain: []
  splitRight: []
  splitDown: []
  focusPane: [index: number]
  focusNext: []
  moveTabNext: []
  closePane: []
  joinPanes: []
  resetLayout: []
  toggleSidebar: []
  toggleRightPane: []
  toggleOverflow: []
  openCommandPalette: []
  openShortcuts: []
  openSettings: []
  rebuildIndex: []
  closeWorkspace: []
  zoomIn: []
  zoomOut: []
  resetZoom: []
  setTheme: [value: ThemePreference]
}>()

const backHistoryMenuRef = ref<HTMLElement | null>(null)
const forwardHistoryMenuRef = ref<HTMLElement | null>(null)
const backHistoryButtonRef = ref<HTMLElement | null>(null)
const forwardHistoryButtonRef = ref<HTMLElement | null>(null)
const overflowRef = ref<InstanceType<typeof WorkspaceOverflowMenu> | null>(null)

/** Returns the history button element used as anchor for menu positioning. */
function getHistoryButtonEl(side: 'back' | 'forward'): HTMLElement | null {
  return side === 'back' ? backHistoryButtonRef.value : forwardHistoryButtonRef.value
}

/** Returns true when the DOM target belongs to the requested history menu wrapper. */
function containsHistoryMenuTarget(side: 'back' | 'forward', target: Node | null): boolean {
  const wrap = side === 'back' ? backHistoryMenuRef.value : forwardHistoryMenuRef.value
  return Boolean(target && wrap?.contains(target))
}

/** Returns true when the DOM target belongs to the overflow trigger or menu. */
function containsOverflowTarget(target: Node | null): boolean {
  return overflowRef.value?.containsTarget(target) ?? false
}

defineExpose({
  getHistoryButtonEl,
  containsHistoryMenuTarget,
  containsOverflowTarget
})
</script>

<template>
  <header class="topbar">
    <div class="topbar-content">
      <div class="topbar-side topbar-side-left">
        <div class="toolbar-group toolbar-group-window">
          <button
            type="button"
            class="toolbar-icon-btn"
            :class="{ active: sidebarVisible }"
            :title="sidebarVisible ? 'Hide sidebar' : 'Show sidebar'"
            :aria-label="sidebarVisible ? 'Hide sidebar' : 'Show sidebar'"
            @click="emit('toggleSidebar')"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" ry="1.5" />
              <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
            </svg>
          </button>
        </div>

        <div class="toolbar-group">
          <div ref="backHistoryMenuRef" class="history-nav-wrap">
            <button
              ref="backHistoryButtonRef"
              type="button"
              class="toolbar-icon-btn"
              :disabled="!canGoBack"
              :title="`Back (${backShortcutLabel})`"
              :aria-label="`Back (${backShortcutLabel})`"
              @click="emit('historyButtonClick', 'back')"
              @contextmenu.prevent="emit('historyButtonContextMenu', 'back', $event)"
              @pointerdown="emit('historyButtonPointerDown', 'back', $event)"
              @pointerup="emit('historyLongPressCancel')"
              @pointerleave="emit('historyLongPressCancel')"
              @pointercancel="emit('historyLongPressCancel')"
            >
              <ArrowLeftIcon />
            </button>
            <div v-if="historyMenuOpen === 'back'" class="history-menu" :style="historyMenuStyle">
              <button
                v-for="target in backItems"
                :key="target.key"
                type="button"
                class="history-menu-item"
                @click="emit('historyTargetClick', target.index)"
              >
                {{ target.label }}
              </button>
              <div v-if="!backItems.length" class="history-menu-empty">No back history</div>
            </div>
          </div>

          <div ref="forwardHistoryMenuRef" class="history-nav-wrap">
            <button
              ref="forwardHistoryButtonRef"
              type="button"
              class="toolbar-icon-btn"
              :disabled="!canGoForward"
              :title="`Forward (${forwardShortcutLabel})`"
              :aria-label="`Forward (${forwardShortcutLabel})`"
              @click="emit('historyButtonClick', 'forward')"
              @contextmenu.prevent="emit('historyButtonContextMenu', 'forward', $event)"
              @pointerdown="emit('historyButtonPointerDown', 'forward', $event)"
              @pointerup="emit('historyLongPressCancel')"
              @pointerleave="emit('historyLongPressCancel')"
              @pointercancel="emit('historyLongPressCancel')"
            >
              <ArrowRightIcon />
            </button>
            <div
              v-if="historyMenuOpen === 'forward'"
              class="history-menu history-menu-forward"
              :style="historyMenuStyle"
            >
              <button
                v-for="target in forwardItems"
                :key="target.key"
                type="button"
                class="history-menu-item"
                @click="emit('historyTargetClick', target.index)"
              >
                {{ target.label }}
              </button>
              <div v-if="!forwardItems.length" class="history-menu-empty">No forward history</div>
            </div>
          </div>
        </div>

        <div class="toolbar-group toolbar-group-nav-tail">
          <button
            type="button"
            class="toolbar-icon-btn"
            :disabled="!hasWorkspace"
            :title="`Home: today note (${homeShortcutLabel})`"
            :aria-label="`Home: today note (${homeShortcutLabel})`"
            @click="emit('openToday')"
          >
            <HomeIcon />
          </button>
        </div>
      </div>

      <button
        type="button"
        class="command-trigger"
        :disabled="!hasWorkspace"
        :title="`Search or type a command (${commandPaletteShortcutLabel})`"
        :aria-label="`Search or type a command (${commandPaletteShortcutLabel})`"
        @click="emit('openCommandPalette')"
      >
        <span class="command-trigger-copy">
          <CommandLineIcon class="command-trigger-icon" />
          <span class="command-trigger-label">Search or type a command...</span>
        </span>
        <span class="command-trigger-shortcut">{{ commandPaletteShortcutLabel }}</span>
      </button>

      <div class="topbar-side topbar-side-right">
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-icon-btn"
            :disabled="!hasWorkspace"
            title="Cosmos view"
            aria-label="Cosmos view"
            @click="emit('openCosmos')"
          >
            <ShareIcon />
          </button>
          <button
            type="button"
            class="toolbar-icon-btn"
            :disabled="!hasWorkspace"
            title="Second Brain"
            aria-label="Second Brain"
            @click="emit('openSecondBrain')"
          >
            <SparklesIcon />
          </button>
        </div>

        <div class="toolbar-group">
          <MultiPaneToolbarMenu
            :can-split="paneCount < 4"
            :pane-count="paneCount"
            @split-right="emit('splitRight')"
            @split-down="emit('splitDown')"
            @focus-pane="emit('focusPane', $event.index)"
            @focus-next="emit('focusNext')"
            @move-tab-next="emit('moveTabNext')"
            @close-pane="emit('closePane')"
            @join-panes="emit('joinPanes')"
            @reset-layout="emit('resetLayout')"
          />
          <button
            type="button"
            class="toolbar-icon-btn"
            :class="{ active: rightPaneVisible }"
            :title="rightPaneVisible ? 'Hide right pane' : 'Show right pane'"
            :aria-label="rightPaneVisible ? 'Hide right pane' : 'Show right pane'"
            @click="emit('toggleRightPane')"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" ry="1.5" />
              <line x1="10" y1="2.5" x2="10" y2="13.5" />
            </svg>
          </button>
        </div>

        <div class="toolbar-group toolbar-group-overflow">
          <WorkspaceOverflowMenu
            ref="overflowRef"
            :open="overflowMenuOpen"
            :has-workspace="hasWorkspace"
            :indexing-state="indexingState"
            :zoom-percent-label="zoomPercentLabel"
            :theme-preference="themePreference"
            @toggle="emit('toggleOverflow')"
            @open-command-palette="emit('openCommandPalette')"
            @open-shortcuts="emit('openShortcuts')"
            @open-settings="emit('openSettings')"
            @rebuild-index="emit('rebuildIndex')"
            @close-workspace="emit('closeWorkspace')"
            @zoom-in="emit('zoomIn')"
            @zoom-out="emit('zoomOut')"
            @reset-zoom="emit('resetZoom')"
            @set-theme="emit('setTheme', $event)"
          />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 42px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  background: #f2f4f8;
  flex: 0 0 auto;
}

:global(.ide-root.dark) .topbar {
  border-bottom-color: #3e4451;
  background: #21252b;
}

:global(.ide-root.macos-overlay .topbar) {
  box-sizing: border-box;
  min-height: 52px;
}

.topbar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 0 12px;
}

.topbar-side {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.topbar-side-left {
  flex: 1 1 0;
}

.topbar-side-right {
  flex: 1 1 0;
  justify-content: flex-end;
}

.toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  border-right: 1px solid #e5e7eb;
}

.toolbar-group:last-child {
  padding-right: 0;
  border-right: 0;
}

:global(.ide-root.dark) .toolbar-group {
  border-right-color: #3e4451;
}

.history-nav-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 28px;
}

.command-trigger {
  flex: 0 1 440px;
  min-width: 220px;
  max-width: 520px;
  height: 30px;
  border: 1px solid #d7dce5;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  color: #5b6472;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(10px);
}

.command-trigger:hover:not(:disabled) {
  border-color: #cbd5e1;
  background: rgba(255, 255, 255, 0.96);
  color: #1f2937;
}

.command-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.command-trigger-copy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.command-trigger-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.command-trigger-label {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-trigger-shortcut {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: #8b93a3;
}

.history-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 90;
  min-width: 220px;
  max-width: 320px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

:global(.ide-root.dark) .history-menu {
  border-color: #3e4451;
  background: #21252b;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3);
}

.history-menu-item {
  border: 0;
  background: transparent;
  color: #5b6472;
  border-radius: 8px;
  text-align: left;
  padding: 7px 8px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-menu-item:hover {
  background: #f1f2f6;
  color: #2d313a;
}

:global(.ide-root.dark) .history-menu-item {
  color: #c8d0dc;
}

:global(.ide-root.dark) .history-menu-item:hover {
  background: #2c313a;
}

.history-menu-empty {
  padding: 7px 8px;
  font-size: 12px;
  color: #5b6472;
}

:global(.ide-root.dark) .history-menu-empty {
  color: #8b93a3;
}

:global(.ide-root.dark) .command-trigger {
  border-color: #3e4451;
  background: rgba(40, 44, 52, 0.8);
  color: #c8d0dc;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

:global(.ide-root.dark) .command-trigger:hover:not(:disabled) {
  border-color: #4b5563;
  background: rgba(44, 49, 58, 0.96);
  color: #e5e7eb;
}

:global(.ide-root.dark) .command-trigger-shortcut {
  color: #8b93a3;
}

@media (min-width: 981px) {
  :global(.ide-root.macos-overlay .topbar-content) {
    padding-left: 84px;
  }
}

@media (max-width: 980px) {
  .topbar-content {
    gap: 4px;
    padding: 0 8px;
  }

  .command-trigger {
    flex-basis: 280px;
  }
}

@media (max-width: 760px) {
  .command-trigger {
    min-width: 0;
    flex: 1 1 auto;
  }

  .command-trigger-shortcut,
  .toolbar-group-window,
  .toolbar-group-nav-tail {
    display: none;
  }
}
</style>

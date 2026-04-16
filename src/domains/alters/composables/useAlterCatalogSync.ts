/**
 * Shared invalidation signal for workspace Alter lists.
 *
 * The Alters manager mutates the underlying files, while Second Brain and
 * Alter Exploration keep their own in-memory lists. This tiny shared revision
 * counter lets those surfaces re-fetch without introducing a heavier catalog
 * store.
 */
import { ref, type Ref } from 'vue'

export type AlterCatalogSync = {
  revision: Ref<number>
  bump: () => void
}

const revision = ref(0)

/**
 * Returns the shared Alter catalog invalidation handle.
 */
export function useAlterCatalogSync(): AlterCatalogSync {
  return {
    revision,
    bump: () => {
      revision.value += 1
    }
  }
}

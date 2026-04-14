import { describe, expect, it } from 'vitest'
import { buildAssetBrowserItems } from './assetBrowser'

describe('buildAssetBrowserItems', () => {
  it('filters workspace files down to unique image and svg media items', () => {
    const items = buildAssetBrowserItems({
      workspaceRoot: '/vault',
      allWorkspaceFiles: [
        '/vault/assets/alpha.png',
        '/vault/assets/alpha.png',
        '/vault/assets/bravo.svg',
        '/vault/assets/charlie%20space.jpeg',
        '/vault/assets/document.md',
        '/vault/assets/archive.zip'
      ]
    })

    expect(items).toEqual([
      {
        id: 'asset-media:/vault/assets/alpha.png',
        label: 'alpha.png',
        meta: 'assets/alpha.png',
        path: '/vault/assets/alpha.png'
      },
      {
        id: 'asset-media:/vault/assets/bravo.svg',
        label: 'bravo.svg',
        meta: 'assets/bravo.svg',
        path: '/vault/assets/bravo.svg'
      },
      {
        id: 'asset-media:/vault/assets/charlie space.jpeg',
        label: 'charlie space.jpeg',
        meta: 'assets/charlie space.jpeg',
        path: '/vault/assets/charlie space.jpeg'
      }
    ])
  })

  it('returns an empty catalog when the workspace root is missing', () => {
    expect(buildAssetBrowserItems({ workspaceRoot: '', allWorkspaceFiles: ['/vault/assets/alpha.png'] })).toEqual([])
  })

  it('normalizes encoded path segments before exposing media paths', () => {
    const items = buildAssetBrowserItems({
      workspaceRoot: '/vault',
      allWorkspaceFiles: ['/vault/assets/diagram%20final%201.svg']
    })

    expect(items).toEqual([
      {
        id: 'asset-media:/vault/assets/diagram final 1.svg',
        label: 'diagram final 1.svg',
        meta: 'assets/diagram final 1.svg',
        path: '/vault/assets/diagram final 1.svg'
      }
    ])
  })
})

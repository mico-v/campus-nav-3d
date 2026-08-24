import * as THREE from 'three'

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

export type PickedEntity = { kind: 'building'; index: number } | { kind: 'poi'; id: string }

export function pickEntity(
  event: MouseEvent,
  dom: HTMLCanvasElement,
  camera: THREE.Camera,
  clickable: THREE.Object3D[],
): PickedEntity | null {
  const rect = dom.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(clickable, true).find((c) => {
    const d = c.object.userData as { kind?: string; index?: number; id?: string }
    return (d.kind === 'building' && typeof d.index === 'number') || (d.kind === 'poi' && typeof d.id === 'string')
  })
  if (!hit) return null
  const data = hit.object.userData as { kind: 'building' | 'poi'; index?: number; id?: string }
  return data.kind === 'building' ? { kind: 'building', index: data.index! } : { kind: 'poi', id: data.id! }
}

export function pickBuilding(
  event: MouseEvent,
  dom: HTMLCanvasElement,
  camera: THREE.Camera,
  clickable: THREE.Object3D[],
): number | null {
  const entity = pickEntity(event, dom, camera, clickable)
  return entity?.kind === 'building' ? entity.index : null
}

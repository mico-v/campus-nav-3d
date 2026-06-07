import * as THREE from 'three'

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// 返回点击命中的建筑 index，未命中返回 null。
export function pickBuilding(
  event: MouseEvent,
  dom: HTMLCanvasElement,
  camera: THREE.Camera,
  clickable: THREE.Object3D[],
): number | null {
  const rect = dom.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(clickable, true).find((c) => {
    const d = c.object.userData as { kind?: string; index?: number }
    return d.kind === 'building' && typeof d.index === 'number'
  })
  if (!hit) return null
  return (hit.object.userData as { index: number }).index
}

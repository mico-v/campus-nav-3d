import type { RoadNetwork } from '../data/roadNetwork'

export type NavigationMode = 'pedestrian' | 'bicycle' | 'vehicle'

export interface NavigationPoint {
  /** Map coordinates in the same X/Z plane used by the campus dataset. */
  position: [number, number]
  /** Optional maximum distance allowed when attaching this point to a road. */
  maxSnapDistance?: number
}

export interface NodeNavigationRequest {
  originNodeId: string
  destinationNodeId: string
  mode?: NavigationMode
}

export interface PointNavigationRequest {
  origin: NavigationPoint
  destination: NavigationPoint
  mode?: NavigationMode
}

export type NavigationRequest = NodeNavigationRequest | PointNavigationRequest

export interface NavigationResult {
  originNodeId: string
  destinationNodeId: string
  mode: NavigationMode
  nodePath: string[]
  segmentPath: string[]
  geometry: [number, number][]
  distance: number
  duration: number
  instructions: string[]
  /** Actual requested positions, which can be off the road centerline. */
  originPosition?: [number, number]
  destinationPosition?: [number, number]
  /** Centerline positions used by the graph and their access distances. */
  snappedOrigin?: [number, number]
  snappedDestination?: [number, number]
  originSnapDistance?: number
  destinationSnapDistance?: number
}

export interface NavigationOptions {
  mode?: NavigationMode
  speedMetersPerSecond?: number
}

export type RoutableNetwork = Pick<RoadNetwork, 'nodes' | 'segments'>

import { Eye, Landmark, MapPin, Mountain, Shell, type LucideIcon } from 'lucide-react'
import type { HotspotCategory } from '../data/hotspots'

const ICONS: Record<HotspotCategory, LucideIcon> = {
  beach: MapPin,
  rock: Mountain,
  cove: Shell,
  landmark: Landmark,
  aerial: Eye,
}

export const categoryIcon = (c: HotspotCategory): LucideIcon => ICONS[c]

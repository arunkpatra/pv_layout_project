/** Named motion primitives — see docs/DESIGN_FOUNDATIONS.md §6.3.
 *
 * Two durations and one easing per the motion system. No bouncy easing,
 * no spring physics. Consumers use these Variants directly with
 * framer-motion's <motion.*> primitives:
 *
 *   <motion.div variants={dialogOpen} initial="initial" animate="enter" exit="exit" />
 */
import type { Transition, Variants } from "framer-motion"

export const durations = {
  fast: 0.12,
  base: 0.18,
  slow: 0.26,
} as const

export const easings = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const

const standard = (d: number): Transition => ({
  duration: d,
  ease: easings.standard as unknown as number[],
})
const exit = (d: number): Transition => ({
  duration: d,
  ease: easings.exit as unknown as number[],
})

export const dialogOpen: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  enter: { opacity: 1, scale: 1, transition: standard(durations.base) },
  exit: { opacity: 0, scale: 0.98, transition: exit(durations.fast) },
}

export const toastEnter: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: standard(durations.base) },
  exit: { opacity: 0, y: 4, transition: exit(durations.fast) },
}

export const popoverEnter: Variants = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: standard(durations.fast) },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: exit(durations.fast) },
}

export const inspectorSlide: Variants = {
  initial: { x: 20, opacity: 0 },
  enter: { x: 0, opacity: 1, transition: standard(durations.slow) },
  exit: { x: 20, opacity: 0, transition: exit(durations.base) },
}

export const layerToggle: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: standard(durations.base) },
  exit: { opacity: 0, transition: exit(durations.base) },
}

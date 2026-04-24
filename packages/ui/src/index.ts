// ─────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────
export { cn } from "./lib/cn"
export * as motion from "./lib/motion"
export {
  durations as motionDurations,
  easings as motionEasings,
  dialogOpen,
  toastEnter,
  popoverEnter,
  inspectorSlide,
  layerToggle,
} from "./lib/motion"

// ─────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────
export { Button, type ButtonProps } from "./components/Button"
export { IconButton, type IconButtonProps } from "./components/IconButton"
export { Kbd } from "./components/Kbd"
export { Chip, type ChipProps } from "./components/Chip"
export { Badge, type BadgeProps } from "./components/Badge"
export { SunMark } from "./components/Icon"
export {
  ModuleIcon,
  TableIcon,
  TrackerIcon,
  IcrIcon,
  StringInverterIcon,
  LightningArresterIcon,
  CableDcIcon,
  CableAcIcon,
} from "./components/SolarIcons"
export { Separator } from "./components/Separator"
export { Card, CardHeader, CardBody, CardFooter } from "./components/Card"
export { Input, type InputProps } from "./components/Input"
export { NumberInput, type NumberInputProps } from "./components/NumberInput"
export { Label } from "./components/Label"
export { Select, SelectItem, type SelectProps, type SelectItemProps } from "./components/Select"
export { Segmented, SegmentedItem } from "./components/Segmented"
export { Switch } from "./components/Switch"
export { Slider } from "./components/Slider"
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/Tabs"
export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "./components/Tooltip"
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
} from "./components/Dialog"
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./components/Sheet"
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./components/Popover"
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/DropdownMenu"
export {
  CommandPalette,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  type CommandPaletteProps,
} from "./components/CommandPalette"
export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./components/Toast"

// ─────────────────────────────────────────────────────────────────────
// Compositions
// ─────────────────────────────────────────────────────────────────────
export { AppShell } from "./compositions/AppShell"
export { TopBar, type TopBarProps } from "./compositions/TopBar"
export { ToolRail, type ToolId } from "./compositions/ToolRail"
export {
  InspectorRoot,
  InspectorSection,
  PropertyRow,
  SummaryStat,
  StatGrid,
} from "./compositions/Inspector"
export { StatusBar, type StatusBarProps } from "./compositions/StatusBar"
export { MapCanvas, CommandBarHint, type IcrLabel } from "./compositions/MapCanvas"
export { Splash } from "./compositions/Splash"
export { EmptyStateCard } from "./compositions/EmptyState"
export { LockedSectionCard } from "./compositions/LockedSectionCard"
export {
  ThemeProvider,
  useTheme,
  type ThemeChoice,
  type ResolvedTheme,
} from "./compositions/ThemeProvider"

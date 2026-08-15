/**
 * UI Kit กลาง (Phase 1.5) — **ทุกหน้าใหม่ต้องประกอบจาก component ในนี้เท่านั้น**
 * คลาสทั้งหมดยึด `04` §8.1 + mockup ใน `reference/` — จะเพิ่ม component ใหม่ต้องเพิ่มลง `docs/REUSE_INDEX.md` ด้วย
 */

export { cn } from '@/components/ui/cn'
export { Button, Spinner, type ButtonProps, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
export { Badge, RefText, StatusBadge } from '@/components/ui/badge'
export { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/card'
export { FilterGroup } from '@/components/ui/filter-group'
export { Field, Input, Label, Select, Textarea, type InputProps, type SelectProps, type TextareaProps } from '@/components/ui/input'
export { ConfirmModal, Modal, type ModalSize } from '@/components/ui/modal'
export { EmptyState, ErrorState, InlineAlert, LoadingState, Skeleton } from '@/components/ui/states'
export { TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui/table'
export { ToastProvider, useToast, type Toast, type ToastInput, type ToastTone } from '@/components/ui/toast'

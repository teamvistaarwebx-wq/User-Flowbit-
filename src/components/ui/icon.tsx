import {
  Activity, Banknote, BookOpen, Briefcase, Building2, CalendarCheck, CalendarClock, CalendarDays, ChartColumn, ChartLine,
  ChartPie, ClipboardList, Clock, Contact, CreditCard, FileMinus, FileSignature, FileText, Fingerprint, FolderKanban, Gift,
  Globe, Handshake, House, Inbox, IndianRupee, Kanban, KeyRound, Landmark, Layers, LayoutGrid, Mail, Megaphone, Orbit,
  Palette, PenTool, PhoneCall, Plug, Puzzle, Receipt, ReceiptIndianRupee, Repeat, Scale, ScrollText, Settings, Shield, ShieldCheck,
  Sparkles, SquareCheckBig, Target, Timer, Upload, UserCheck, UserCog, UserPlus, UserRound, Users, UsersRound, Wallet, Zap,
  Bell, Download, type LucideIcon, type LucideProps,
} from 'lucide-react'
import type { IconName } from '@/lib/catalog'

const ICONS: Record<IconName, LucideIcon> = {
  House, Sparkles, SquareCheckBig, LayoutGrid, UsersRound, FolderKanban, Building2, CalendarDays, ChartColumn, UserRound,
  Orbit, ReceiptIndianRupee, UserPlus, Settings, Bell, PenTool, Megaphone, Timer, FileText, Wallet, CalendarCheck,
  CalendarClock, Fingerprint, ClipboardList, FileSignature, Handshake, Contact, PhoneCall, Target, Repeat, FileMinus,
  BookOpen, Shield, KeyRound, Palette, Puzzle, ScrollText, Mail, CreditCard, Plug, Upload, Landmark, Banknote, Receipt,
  Users, Briefcase, Layers, Kanban, ChartLine, ChartPie, Activity, Globe, UserCheck, UserCog, IndianRupee, Zap, Inbox,
  Gift, ShieldCheck, Clock, Scale, Download,
}

/** Renders a catalog icon by name: <Icon name="House" size={18} />. */
export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const Cmp = ICONS[name] ?? LayoutGrid
  return <Cmp aria-hidden {...props} />
}

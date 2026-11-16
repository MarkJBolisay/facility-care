export type Role = 'admin' | 'maintenance' | 'student' | 'faculty' | 'staff';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  department?: string | null;
  id_number?: string | null;
  specialization?: string | null;
  is_active: boolean;
  is_available: boolean;
  active_count?: number;
  completed_count?: number;
  overdue_count?: number;
  completed_month_count?: number;
  in_progress_count?: number;
  /** Smart assignment (from GET personnel) */
  match_score?: number;
  match_reasons?: string[];
  is_recommended?: boolean;
  created_at?: string;
}

export interface Equipment {
  id: number;
  code: string;
  name: string;
  category: string;
  model: string | null;
  serial_number: string | null;
  department: string | null;
  facility_id: number | null;
  facility?: Facility | null;
  acquisition_date: string | null;
  condition: string;
  importance: string;
  maintenance_interval_days: number | null;
  last_maintained_at: string | null;
  next_maintenance_due: string | null;
  maintenance_state: 'none' | 'scheduled' | 'due_soon' | 'overdue';
  notes: string | null;
  open_requests_count?: number;
  /** newest unfixed request about this item (reference and status only) */
  open_report?: { id: number; reference: string; status: string; created_at: string } | null;
  open_work_order?: WorkOrder | null;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  action: string;
  description: string;
  from_value: string | null;
  to_value: string | null;
  user?: { id: number; name: string; role: string } | null;
  report_id: number | null;
  work_order_id: number | null;
  equipment_id: number | null;
  report?: { id: number; reference: string; title: string } | null;
  work_order?: { id: number; reference: string; title: string } | null;
  equipment?: { id: number; code: string; name: string } | null;
  created_at: string;
}

export interface PriorityAssessment {
  score: number;
  recommended: string;
  factors: { label: string; value: string; points: number; max: number }[];
}

export interface Facility {
  id: number;
  code: string | null;
  name: string;
  type: string;
  parent_id: number | null;
  parent?: Facility | null;
  children?: Facility[];
  floor: string | null;
  capacity: number | null;
  description: string | null;
  status: string;
  full_name: string;
  open_reports_count?: number;
  total_work_orders_count?: number;
}

export interface Report {
  id: number;
  reference: string;
  user_id: number;
  facility_id: number | null;
  facility?: Facility | null;
  equipment_id: number | null;
  equipment?: Equipment | null;
  severity: string | null;
  priority_score?: number;
  priority_assessment?: PriorityAssessment;
  /** admin only: other unfixed requests about the same item or room + category */
  possible_duplicates?: { id: number; reference: string; title: string; status: string; created_at: string; reporter?: { id: number; name: string } | null }[];
  activities?: ActivityLog[];
  location_details: string | null;
  title: string;
  description: string;
  category: string | null;
  /** what the reporter typed when the category is "Others" */
  category_other?: string | null;
  priority: string | null;
  status: string;
  photo_url: string | null;
  admin_remarks: string | null;
  reporter?: User;
  reviewer?: User | null;
  reviewed_at: string | null;
  confirmed_at?: string | null;
  reopen_count?: number;
  work_orders?: WorkOrder[];
  active_work_order?: WorkOrder | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderPhoto {
  id: number;
  type: 'before' | 'after';
  url: string;
  created_at: string;
}

export interface WorkOrderMaterial {
  id: number;
  name: string;
  type: 'material' | 'equipment';
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
}

export interface WorkOrder {
  id: number;
  reference: string;
  report_id: number | null;
  report?: (Report & { photo_url: string | null }) | null;
  facility_id: number | null;
  facility?: Facility | null;
  equipment_id: number | null;
  equipment?: Equipment | null;
  type: 'corrective' | 'preventive';
  condition_after: string | null;
  activities?: ActivityLog[];
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  assigned_to: number | null;
  assignee?: User | null;
  creator?: User | null;
  assigned_at: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  actions_taken: string | null;
  remarks: string | null;
  photos?: WorkOrderPhoto[];
  materials?: WorkOrderMaterial[];
  materials_cost: number;
  created_at: string;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  report_id: number | null;
  work_order_id: number | null;
  sender?: { id: number; name: string } | null;
  read_at: string | null;
  created_at: string;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Option lists and labels

export interface Option {
  value: string;
  label: string;
}

export const CATEGORIES: Option[] = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'aircon', label: 'Air-conditioning' },
  { value: 'it_equipment', label: 'IT / Equipment' },
  { value: 'structural', label: 'Structural' },
  { value: 'cleaning', label: 'Cleaning / Pest' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'safety', label: 'Safety' },
  { value: 'others', label: 'Others' },
];

export const PRIORITIES: Option[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const REPORT_STATUSES: Option[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

export const WORK_ORDER_STATUSES: Option[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ROLES: Option[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'maintenance', label: 'Technician' },
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'staff', label: 'Staff' },
];

export const FACILITY_TYPES: Option[] = [
  { value: 'building', label: 'Building' },
  { value: 'room', label: 'Room' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'office', label: 'Office' },
  { value: 'restroom', label: 'Restroom' },
  { value: 'outdoor', label: 'Outdoor area' },
  { value: 'other', label: 'Other' },
];

export const FACILITY_STATUSES: Option[] = [
  { value: 'operational', label: 'Operational' },
  { value: 'under_maintenance', label: 'Under Maintenance' },
  { value: 'closed', label: 'Closed' },
];

export const EQUIPMENT_CATEGORIES: Option[] = [
  { value: 'computer', label: 'Computer' },
  { value: 'printer', label: 'Printer' },
  { value: 'network', label: 'Network device' },
  { value: 'projector', label: 'Projector / AV' },
  { value: 'aircon', label: 'Air-conditioner' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing fixture' },
  { value: 'lab_equipment', label: 'Laboratory equipment' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'safety', label: 'Safety equipment' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'other', label: 'Other' },
];

export const EQUIPMENT_CONDITIONS: Option[] = [
  { value: 'operational', label: 'Operational' },
  { value: 'needs_repair', label: 'Needs Repair' },
  { value: 'under_maintenance', label: 'Under Maintenance' },
  { value: 'out_of_service', label: 'Out of Service' },
];

export const IMPORTANCE: Option[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** How bad the problem is, chosen by the requester. */
export const SEVERITIES: (Option & { hint: string })[] = [
  { value: 'minor', label: 'Minor', hint: 'Still usable' },
  { value: 'moderate', label: 'Moderate', hint: 'Hard to use' },
  { value: 'severe', label: 'Severe', hint: 'Unusable or unsafe' },
];

export const WORK_ORDER_TYPES: Option[] = [
  { value: 'corrective', label: 'Repair' },
  { value: 'preventive', label: 'Preventive' },
];

export const MAINTENANCE_STATES: Option[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'none', label: 'No schedule' },
];

const LISTS: Record<string, Option[]> = {
  equipmentCategory: EQUIPMENT_CATEGORIES,
  condition: EQUIPMENT_CONDITIONS,
  importance: IMPORTANCE,
  severity: SEVERITIES,
  woType: WORK_ORDER_TYPES,
  maintenance: MAINTENANCE_STATES,
  category: CATEGORIES,
  priority: PRIORITIES,
  status: [...REPORT_STATUSES, ...WORK_ORDER_STATUSES, ...FACILITY_STATUSES],
  role: ROLES,
  facilityType: FACILITY_TYPES,
};

export function labelOf(kind: string, value: string | null | undefined): string {
  if (!value) return kind === 'priority' ? 'Not set' : kind === 'category' ? 'Uncategorized' : '—';
  const found = (LISTS[kind] ?? []).find((o) => o.value === value);
  return found ? found.label : value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ionic color names for status / priority chips. */
const TONES: Record<string, Record<string, string>> = {
  status: {
    pending: 'warning',
    approved: 'tertiary',
    in_progress: 'primary',
    completed: 'success',
    rejected: 'danger',
    cancelled: 'medium',
    operational: 'success',
    under_maintenance: 'warning',
    closed: 'danger',
  },
  priority: { low: 'medium', medium: 'primary', high: 'warning', critical: 'danger' },
  condition: { operational: 'success', needs_repair: 'warning', under_maintenance: 'primary', out_of_service: 'danger' },
  maintenance: { overdue: 'danger', due_soon: 'warning', scheduled: 'success', none: 'medium' },
  severity: { minor: 'medium', moderate: 'warning', severe: 'danger' },
};

export function toneOf(kind: string, value: string | null | undefined): string {
  return (value && TONES[kind]?.[value]) || 'medium';
}

export const REPORTER_ROLES: Role[] = ['student', 'faculty', 'staff'];

/** Icon for each equipment category. */
export const EQUIPMENT_ICONS: Record<string, string> = {
  computer: 'desktop-outline',
  printer: 'print-outline',
  network: 'wifi-outline',
  projector: 'easel-outline',
  aircon: 'snow-outline',
  electrical: 'flash-outline',
  plumbing: 'water-outline',
  lab_equipment: 'flask-outline',
  furniture: 'cube-outline',
  safety: 'flame-outline',
  appliance: 'hardware-chip-outline',
  other: 'construct-outline',
};

export function equipmentIcon(category: string | null | undefined): string {
  return EQUIPMENT_ICONS[category ?? ''] ?? 'construct-outline';
}

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
  created_at?: string;
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
  location_details: string | null;
  title: string;
  description: string;
  category: string | null;
  priority: string | null;
  status: string;
  photo_url: string | null;
  admin_remarks: string | null;
  reporter?: User;
  reviewer?: User | null;
  reviewed_at: string | null;
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
  { value: 'maintenance', label: 'Maintenance' },
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

const LISTS: Record<string, Option[]> = {
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
};

export function toneOf(kind: string, value: string | null | undefined): string {
  return (value && TONES[kind]?.[value]) || 'medium';
}

export const REPORTER_ROLES: Role[] = ['student', 'faculty', 'staff'];

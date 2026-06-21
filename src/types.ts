export interface Vendor {
  id: string;
  name: string;
}

export interface CostComponent {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  components: CostComponent[];
}

export interface EvaluationCriteria {
  id: string;
  name: string;
  description: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string;
  uploadedAt: string;
  vendorId?: string;
}

export interface MonthlyCostTrackerRow {
  id: string;
  category: string;
  annualBudget: number;
  months: number[]; // Jan-Dec (12 values)
  description: string;
  excluded?: boolean;
}

export interface QualitativeRow {
  id: string;
  name: string;
  description: string;
  values: Record<string, string>; // vendorId -> value
}

export interface QuoteProject {
  id: string;
  name: string;
  date: string;
  version: string;
  currency: string; // e.g. USD, EUR, etc.
  vendors: Vendor[];
  categories: Category[];
  criteria?: EvaluationCriteria[]; // Optional for backwards compatibility
  // costValues[categoryId][componentId][vendorId] = number
  costValues: Record<string, Record<string, Record<string, number>>>;
  // comments[categoryId] = string, notes per category
  comments: Record<string, string>;
  // vendorNotes[vendorId] = string, qualitative notes per vendor
  vendorNotes: Record<string, string>;
  generalNotes: string;
  uploadedFiles?: UploadedFile[];
  tcoYears?: 1 | 2 | 3;
  transposeMatrix?: boolean;
  vendorPlans?: Record<string, string>;
  paymentMilestones?: Record<string, string>;
  onboardingTimelines?: Record<string, string>;
  recommendedVendorId?: string;
  excludedCostComponents?: Record<string, boolean>;
  monthlyCostTrackers?: Record<string, Record<string, Record<string, MonthlyCostTrackerRow[]>>>; // [catId][compId][vendorId]
  qualitativeRows?: QualitativeRow[];
  categoryQualitativeRows?: Record<string, QualitativeRow[]>;
  deletedCategoryQualitativeSections?: Record<string, boolean>;
  deletedProjectQualitativeSection?: boolean;
}

export interface ExpenseDetail {
  id: number;
  date: string;
  description: string;
  amount: number;
  tripName: string;
}

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

export interface RegionStat {
  name: string;
  tripCount: number;
}

export interface CountryStat {
  country: string;
  country_code: string;
  tripCount: number;
  regions: RegionStat[];
}

export interface StatsData {
  categoryStats: CategoryStat[];
  countries: CountryStat[];
  totalAmount: number;
  totalExpenses: number;
}

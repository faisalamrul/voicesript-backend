import { pool } from '../config/database';

const REPORTER_RATE = 2000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ReporterEarningsFilters {
  search?: string;
  period?: 'month' | 'last';
  page?: number;
  limit?: number;
}

export interface EarningsSummary {
  total_earned: number;
  total_minutes: number;
  period_earned: number | null;
  pending: number;
}

export interface WorkStats {
  total_jobs: number;
  jobs_this_month: number;
  avg_duration_minutes: number;
}

export interface TurnaroundStats {
  avg_hours: number;
  trend: 'improving' | 'stable' | 'declining';
  recent_avg_hours: number;
  baseline_avg_hours: number;
  submitted_jobs_count: number;
}

export interface MonthlyBreakdown {
  month: string;
  month_label: string;
  earned: number;
  minutes: number;
  jobs: number;
}

export interface EarningsJob {
  id: string;
  case_name: string;
  location: string;
  duration: number;
  status: string;
  reporter_payment: number | null;
  assigned_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
}

export interface EarningsResult {
  summary: EarningsSummary;
  work_stats: WorkStats;
  turnaround_stats: TurnaroundStats;
  monthly_breakdown: MonthlyBreakdown[];
  jobs: EarningsJob[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

function getPeriodRange(period: 'month' | 'last'): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

function calcTrend(recentAvg: number, baselineAvg: number): 'improving' | 'stable' | 'declining' {
  if (baselineAvg === 0 || recentAvg === 0) return 'stable';
  if (recentAvg < baselineAvg * 0.9) return 'improving';
  if (recentAvg > baselineAvg * 1.1) return 'declining';
  return 'stable';
}

export async function getEarnings(
  reporterId: string,
  filters: ReporterEarningsFilters
): Promise<EarningsResult> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const periodRange = filters.period ? getPeriodRange(filters.period) : null;

  // Query A — aggregate stats + work stats
  const statsQuery = pool.query<{
    total_earned: string;
    total_minutes: string;
    pending: string;
    period_earned: string;
    total_jobs: string;
    jobs_this_month: string;
    avg_duration_minutes: string;
  }>(
    `SELECT
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN reporter_payment END), 0)           AS total_earned,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN FLOOR(duration / 60.0) END), 0)     AS total_minutes,
      COALESCE(SUM(CASE WHEN status = 'REVIEWED'  THEN FLOOR(duration / 60.0) * ${REPORTER_RATE} END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED'
                        AND completed_at >= $2 AND completed_at < $3
                   THEN reporter_payment END), 0)                                           AS period_earned,
      COUNT(*)                                                                               AS total_jobs,
      COUNT(CASE WHEN status = 'COMPLETED'
                 AND completed_at >= $4 AND completed_at < $5 THEN 1 END)                  AS jobs_this_month,
      COALESCE(FLOOR(AVG(CASE WHEN status = 'COMPLETED' THEN duration END) / 60.0), 0)     AS avg_duration_minutes
     FROM jobs
     WHERE reporter_id = $1`,
    [
      reporterId,
      periodRange?.start ?? null,
      periodRange?.end ?? null,
      currentMonthStart,
      currentMonthEnd,
    ]
  );

  // Query B — turnaround stats (assigned_at → submitted_at, recent 3mo vs older baseline)
  const turnaroundQuery = pool.query<{
    avg_hours: string;
    recent_avg_hours: string;
    baseline_avg_hours: string;
    submitted_jobs_count: string;
  }>(
    `SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (submitted_at - reporter_assigned_at)) / 3600), 0)   AS avg_hours,
      COALESCE(AVG(CASE WHEN submitted_at >= $2
                   THEN EXTRACT(EPOCH FROM (submitted_at - reporter_assigned_at)) / 3600 END), 0) AS recent_avg_hours,
      COALESCE(AVG(CASE WHEN submitted_at < $2
                   THEN EXTRACT(EPOCH FROM (submitted_at - reporter_assigned_at)) / 3600 END), 0) AS baseline_avg_hours,
      COUNT(*)                                                                               AS submitted_jobs_count
     FROM jobs
     WHERE reporter_id = $1
       AND reporter_assigned_at IS NOT NULL
       AND submitted_at IS NOT NULL`,
    [reporterId, threeMonthsAgo]
  );

  // Query C — monthly breakdown (always 6 months, not affected by period filter)
  const chartQuery = pool.query<{ month: string; earned: string; minutes: string; jobs: string }>(
    `SELECT
      TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') AS month,
      COALESCE(SUM(reporter_payment), 0)                    AS earned,
      COALESCE(SUM(FLOOR(duration / 60.0)), 0)              AS minutes,
      COUNT(*)                                               AS jobs
     FROM jobs
     WHERE reporter_id = $1
       AND status = 'COMPLETED'
       AND completed_at >= $2
     GROUP BY DATE_TRUNC('month', completed_at)
     ORDER BY 1`,
    [reporterId, sixMonthsAgo]
  );

  // Query D — jobs list (period-filtered, paginated)
  const jobValues: unknown[] = [reporterId];
  const jobConditions: string[] = ['j.reporter_id = $1'];

  if (periodRange) {
    jobValues.push(periodRange.start);
    const startIdx = jobValues.length;
    jobValues.push(periodRange.end);
    const endIdx = jobValues.length;
    jobConditions.push(`(
      (j.status = 'COMPLETED' AND j.completed_at >= $${startIdx} AND j.completed_at < $${endIdx})
      OR
      (j.status != 'COMPLETED' AND j.created_at >= $${startIdx} AND j.created_at < $${endIdx})
    )`);
  }

  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    jobValues.push(`%${escaped}%`);
    jobConditions.push(`j.case_name ILIKE $${jobValues.length}`);
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const offset = (page - 1) * limit;

  jobValues.push(limit);
  const limitIdx = jobValues.length;
  jobValues.push(offset);
  const offsetIdx = jobValues.length;

  const jobsQuery = pool.query<{
    id: string;
    case_name: string;
    location: string;
    duration: string;
    status: string;
    reporter_payment: string | null;
    assigned_at: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    completed_at: string | null;
    _total: string;
  }>(
    `SELECT
      j.id, j.case_name, j.location, j.duration, j.status, j.reporter_payment,
      j.reporter_assigned_at AS assigned_at,
      j.submitted_at, j.reviewed_at, j.completed_at,
      COUNT(*) OVER() AS _total
     FROM jobs j
     WHERE ${jobConditions.join(' AND ')}
     ORDER BY COALESCE(j.completed_at, j.reporter_assigned_at, j.created_at) DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    jobValues
  );

  const [statsRes, turnaroundRes, chartRes, jobsRes] = await Promise.all([
    statsQuery,
    turnaroundQuery,
    chartQuery,
    jobsQuery,
  ]);

  const raw = statsRes.rows[0]!;
  const summary: EarningsSummary = {
    total_earned: parseInt(raw.total_earned, 10),
    total_minutes: parseInt(raw.total_minutes, 10),
    period_earned: filters.period ? parseInt(raw.period_earned, 10) : null,
    pending: parseInt(raw.pending, 10),
  };

  const work_stats: WorkStats = {
    total_jobs: parseInt(raw.total_jobs, 10),
    jobs_this_month: parseInt(raw.jobs_this_month, 10),
    avg_duration_minutes: parseInt(raw.avg_duration_minutes, 10),
  };

  const tRaw = turnaroundRes.rows[0]!;
  const recentAvg = parseFloat(tRaw.recent_avg_hours);
  const baselineAvg = parseFloat(tRaw.baseline_avg_hours);
  const turnaround_stats: TurnaroundStats = {
    avg_hours: Math.round(parseFloat(tRaw.avg_hours) * 10) / 10,
    recent_avg_hours: Math.round(recentAvg * 10) / 10,
    baseline_avg_hours: Math.round(baselineAvg * 10) / 10,
    submitted_jobs_count: parseInt(tRaw.submitted_jobs_count, 10),
    trend: calcTrend(recentAvg, baselineAvg),
  };

  // Build 6-month array, fill missing months with 0
  const chartMap = new Map(
    chartRes.rows.map((r) => [
      r.month,
      {
        earned: parseInt(r.earned, 10),
        minutes: parseInt(r.minutes, 10),
        jobs: parseInt(r.jobs, 10),
      },
    ])
  );
  const monthly_breakdown: MonthlyBreakdown[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const data = chartMap.get(key);
    return {
      month: key,
      month_label: label,
      earned: data?.earned ?? 0,
      minutes: data?.minutes ?? 0,
      jobs: data?.jobs ?? 0,
    };
  });

  const total = jobsRes.rows.length > 0 ? parseInt(jobsRes.rows[0]!._total, 10) : 0;
  const jobs: EarningsJob[] = jobsRes.rows.map(({ _total: _t, ...row }) => ({
    id: row.id,
    case_name: row.case_name,
    location: row.location,
    duration: parseInt(row.duration, 10),
    status: row.status,
    reporter_payment: row.reporter_payment !== null ? parseInt(row.reporter_payment, 10) : null,
    assigned_at: row.assigned_at,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    completed_at: row.completed_at,
  }));

  return {
    summary,
    work_stats,
    turnaround_stats,
    monthly_breakdown,
    jobs,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}

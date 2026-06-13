import { pool } from '../config/database';

const REPORTER_RATE = 2000;
const EDITOR_FLAT_FEE = 50000;

export interface PaymentFilters {
  search?: string;
  status?: 'paid' | 'pending';
  period?: 'month' | 'last';
  page?: number;
  limit?: number;
}

export interface PaymentJob {
  id: string;
  case_name: string;
  duration: number;
  status: string;
  reporter_name: string | null;
  reporter_payment: number | null;
  editor_name: string | null;
  editor_payment: number | null;
  completed_at: string | null;
}

export interface PaymentSummary {
  total_payout: number;
  reporter_total: number;
  reporter_minutes: number;
  editor_total: number;
  editor_jobs: number;
  pending_total: number;
}

export interface PaymentResult {
  summary: PaymentSummary;
  jobs: PaymentJob[];
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

export async function getPayments(filters: PaymentFilters): Promise<PaymentResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.status === 'paid') {
    conditions.push(`j.status = 'COMPLETED'`);
  } else if (filters.status === 'pending') {
    conditions.push(`j.status != 'COMPLETED'`);
    conditions.push(`(j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`);
  } else {
    conditions.push(`(j.status = 'COMPLETED' OR j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`);
  }

  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    values.push(`%${escaped}%`);
    conditions.push(`(j.case_name ILIKE $${values.length} OR r.name ILIKE $${values.length} OR e.name ILIKE $${values.length})`);
  }

  if (filters.period) {
    const { start, end } = getPeriodRange(filters.period);
    values.push(start);
    const startIdx = values.length;
    values.push(end);
    const endIdx = values.length;

    if (filters.status === 'paid') {
      conditions.push(`j.completed_at >= $${startIdx} AND j.completed_at < $${endIdx}`);
    } else if (filters.status === 'pending') {
      conditions.push(`j.created_at >= $${startIdx} AND j.created_at < $${endIdx}`);
    } else {
      conditions.push(`(
        (j.status = 'COMPLETED' AND j.completed_at >= $${startIdx} AND j.completed_at < $${endIdx})
        OR
        (j.status != 'COMPLETED' AND j.created_at >= $${startIdx} AND j.created_at < $${endIdx})
      )`);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const offset = (page - 1) * limit;

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const [jobsRes, summaryRes] = await Promise.all([
    pool.query<{
      id: string;
      case_name: string;
      duration: string;
      status: string;
      reporter_name: string | null;
      reporter_payment: string | null;
      editor_name: string | null;
      editor_payment: string | null;
      completed_at: string | null;
      _total: string;
    }>(
      `SELECT
        j.id,
        j.case_name,
        j.duration,
        j.status,
        r.name AS reporter_name,
        CASE
          WHEN j.status = 'COMPLETED' THEN j.reporter_payment
          WHEN j.reporter_id IS NOT NULL THEN FLOOR(j.duration / 60.0) * ${REPORTER_RATE}
          ELSE NULL
        END AS reporter_payment,
        e.name AS editor_name,
        CASE
          WHEN j.status = 'COMPLETED' THEN j.editor_payment
          WHEN j.editor_id IS NOT NULL THEN ${EDITOR_FLAT_FEE}
          ELSE NULL
        END AS editor_payment,
        j.completed_at,
        COUNT(*) OVER() AS _total
       FROM jobs j
       LEFT JOIN users r ON r.id = j.reporter_id
       LEFT JOIN users e ON e.id = j.editor_id
       ${where}
       ORDER BY COALESCE(j.completed_at, j.created_at) DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    ),
    pool.query<{
      total_payout: string;
      reporter_total: string;
      reporter_minutes: string;
      editor_total: string;
      editor_jobs: string;
      pending_total: string;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN j.status = 'COMPLETED'
          THEN COALESCE(j.reporter_payment, 0) + COALESCE(j.editor_payment, 0) END), 0) AS total_payout,
        COALESCE(SUM(CASE WHEN j.status = 'COMPLETED'
          THEN j.reporter_payment END), 0) AS reporter_total,
        COALESCE(SUM(CASE WHEN j.status = 'COMPLETED' AND j.reporter_id IS NOT NULL
          THEN FLOOR(j.duration / 60.0) END), 0) AS reporter_minutes,
        COALESCE(SUM(CASE WHEN j.status = 'COMPLETED' AND j.editor_id IS NOT NULL
          THEN j.editor_payment END), 0) AS editor_total,
        COUNT(CASE WHEN j.status = 'COMPLETED' AND j.editor_id IS NOT NULL THEN 1 END) AS editor_jobs,
        COALESCE(SUM(CASE
          WHEN j.status != 'COMPLETED' AND (j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)
          THEN
            (CASE WHEN j.reporter_id IS NOT NULL THEN FLOOR(j.duration / 60.0) * ${REPORTER_RATE} ELSE 0 END) +
            (CASE WHEN j.editor_id IS NOT NULL THEN ${EDITOR_FLAT_FEE} ELSE 0 END)
        END), 0) AS pending_total
       FROM jobs j
       LEFT JOIN users r ON r.id = j.reporter_id
       LEFT JOIN users e ON e.id = j.editor_id
       ${where}`,
      values.slice(0, -2)
    ),
  ]);

  const raw = summaryRes.rows[0]!;
  const summary: PaymentSummary = {
    total_payout: parseInt(raw.total_payout, 10),
    reporter_total: parseInt(raw.reporter_total, 10),
    reporter_minutes: parseInt(raw.reporter_minutes, 10),
    editor_total: parseInt(raw.editor_total, 10),
    editor_jobs: parseInt(raw.editor_jobs, 10),
    pending_total: parseInt(raw.pending_total, 10),
  };

  const total = jobsRes.rows.length > 0 ? parseInt(jobsRes.rows[0]!._total, 10) : 0;
  const jobs: PaymentJob[] = jobsRes.rows.map(({ _total: _t, ...row }) => ({
    id: row.id,
    case_name: row.case_name,
    duration: parseInt(row.duration, 10),
    status: row.status,
    reporter_name: row.reporter_name,
    reporter_payment: row.reporter_payment !== null ? parseInt(row.reporter_payment, 10) : null,
    editor_name: row.editor_name,
    editor_payment: row.editor_payment !== null ? parseInt(row.editor_payment, 10) : null,
    completed_at: row.completed_at,
  }));

  return {
    summary,
    jobs,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}

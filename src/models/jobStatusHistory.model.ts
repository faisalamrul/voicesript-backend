export interface JobStatusHistory {
  id: string;
  job_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: Date;
}

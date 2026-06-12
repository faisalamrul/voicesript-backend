export type JobStatus = 'NEW' | 'ASSIGNED' | 'TRANSCRIBED' | 'REVIEWED' | 'COMPLETED';
export type JobLocation = 'physical' | 'remote';

export interface Job {
  id: string;
  case_name: string;
  duration: number;
  location: JobLocation;
  city: string;
  status: JobStatus;
  reporter_id: string | null;
  reporter_name: string | null;
  editor_id: string | null;
  editor_name: string | null;
  transcript_notes: string | null;
  review_notes: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  reporter_payment: number | null;
  editor_payment: number | null;
  created_at: Date;
}

export type JobPublic = Job;

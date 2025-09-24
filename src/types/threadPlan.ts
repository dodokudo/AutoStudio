export type PlanStatus = 'draft' | 'approved' | 'scheduled' | 'rejected';

export interface ThreadPlan {
  plan_id: string;
  generation_date: string;
  scheduled_time: string;
  template_id: string;
  theme: string;
  status: PlanStatus;
  main_text: string;
  comments: string;
  created_at: string;
  updated_at: string;
}

export interface ThreadPlanSummary {
  plan_id: string;
  scheduled_time: string;
  status: PlanStatus;
  template_id: string;
  theme: string;
  main_text: string;
  comments: string;
  job_status?: string;
  job_updated_at?: string;
  job_error_message?: string;
  log_status?: string;
  log_error_message?: string;
  log_posted_thread_id?: string;
  log_posted_at?: string;
}

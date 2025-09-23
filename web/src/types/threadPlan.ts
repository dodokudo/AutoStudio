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

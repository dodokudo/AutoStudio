export interface UserCoreRow {
  snapshot_date: string;
  user_id: string;
  display_name: string | null;
  friend_added_at: string | null;
  blocked: boolean | null;
  last_msg_at: string | null;
  scenario_name: string | null;
  scenario_days: number | null;
}

export interface UserTagRow {
  snapshot_date: string;
  user_id: string;
  tag_id: string;
  tag_name: string;
  tag_flag: number;
}

export interface UserSourceRow {
  snapshot_date: string;
  user_id: string;
  source_name: string;
  source_flag: number;
}

export interface UserSurveyRow {
  snapshot_date: string;
  user_id: string;
  question: string;
  answer_flag: number;
}

export interface NormalizedLstepData {
  userCore: UserCoreRow[];
  userTags: UserTagRow[];
  userSources: UserSourceRow[];
  userSurveys: UserSurveyRow[];
}

export type ColumnCategory = 'core' | 'tag' | 'source' | 'survey' | 'other';

export interface ColumnDescriptor {
  index: number;
  internalId: string | null;
  label: string | null;
  category: ColumnCategory;
  coreField?: keyof UserCoreRow;
}

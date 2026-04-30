import { RoleLevel, RoleName } from './auth.models';

export type FileStatus =
  | 'uploaded'
  | 'reviewed_by_coordinator'
  | 'reviewed_by_master'
  | 'finalized'
  | 'returned';

export type CommentAction = 'comment' | 'revision' | 'forward' | 'finalize';

export interface FileDoc {
  id: number;
  title: string;
  description: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  current_level: RoleLevel;
  current_role: RoleName;
  status: FileStatus;
  uploaded_by: { id: number; name: string; email: string };
  created_at: string;
  updated_at: string;
}

export interface FileComment {
  id: number;
  file_id: number;
  action: CommentAction;
  body: string;
  role_level: RoleLevel;
  role: RoleName;
  user: { id: number; name: string; email: string };
  created_at: string;
}

export interface FileWithComments {
  file: FileDoc;
  comments: FileComment[];
}

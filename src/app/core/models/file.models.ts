import { RoleLevel, RoleName } from './auth.models';

/** DLP: Coordinator → Master → Principal (finalize). Examination: Coordinator → Principal (finalize). */
export type DocumentType = 'dlp' | 'examination';

export type FileStatus =
  | 'uploaded'
  | 'reviewed_by_coordinator'
  | 'reviewed_by_master'
  | 'exam_principal'
  | 'exam_master'
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
  document_type: DocumentType;
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
  /**
   * Only meaningful for `action === 'revision'`. When non-null the
   * revision has been marked resolved; otherwise it's still pending
   * and will block forwarding to the next workflow level.
   */
  resolved_at: string | null;
  resolved_by: { id: number; name: string } | null;
  created_at: string;
}

export interface FileWithComments {
  file: FileDoc;
  comments: FileComment[];
}

export function documentTypeLabel(t: DocumentType | undefined): string {
  return t === 'examination' ? 'Examination' : 'DLP';
}

/** Human-readable routing stage for dashboards and lists. */
export function workflowStageLabel(f: Pick<FileDoc, 'status' | 'document_type'>): string {
  const dtype = f.document_type ?? 'dlp';
  if (dtype === 'examination') {
    switch (f.status) {
      case 'uploaded':
        return 'Awaiting Coordinator';
      case 'exam_principal':
        return 'With Principal';
      case 'exam_master':
        return 'With Master';
      case 'finalized':
        return 'Finalized';
      case 'returned':
        return 'Returned';
      default:
        return f.status;
    }
  }
  switch (f.status) {
    case 'uploaded':
      return 'Awaiting Coordinator';
    case 'reviewed_by_coordinator':
      return 'With Master';
    case 'reviewed_by_master':
      return 'With Principal';
    case 'finalized':
      return 'Finalized';
    case 'returned':
      return 'Returned';
    default:
      return f.status;
  }
}

/** Styling bucket for status chips (teacher home, file review, etc.). */
export function workflowStatusTone(
  f: Pick<FileDoc, 'status' | 'document_type'>
): 'pending' | 'in-review' | 'done' {
  if (f.status === 'finalized') return 'done';
  if (f.status === 'uploaded' || f.status === 'returned') return 'pending';
  return 'in-review';
}

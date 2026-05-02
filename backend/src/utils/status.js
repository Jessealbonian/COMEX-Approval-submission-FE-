'use strict';

const { ROLES } = require('./roles');

const DOCUMENT_TYPE = Object.freeze({
  DLP: 'dlp',
  EXAMINATION: 'examination',
});

const STATUS = Object.freeze({
  UPLOADED: 'uploaded',
  REVIEWED_BY_COORDINATOR: 'reviewed_by_coordinator',
  REVIEWED_BY_MASTER: 'reviewed_by_master',
  FINALIZED: 'finalized',
  RETURNED: 'returned',
  /** Examination: Coordinator cleared → with Principal (Principal then finalizes) */
  EXAM_PRINCIPAL: 'exam_principal',
  /** Legacy: old flow sent some examinations to Master; forward still completes them */
  EXAM_MASTER: 'exam_master',
});

/**
 * Given the reviewer role and document type, return the next
 * (status, current_level) after a successful forward.
 *
 * DLP: Coordinator → Master → Principal (finalize).
 * Examination: Coordinator → Principal (finalize). Master forward only for legacy exam_master rows.
 */
function nextWorkflowState(reviewerRole, documentType, fileStatus) {
  const dtype = documentType || DOCUMENT_TYPE.DLP;
  const role = Number(reviewerRole);

  if (dtype === DOCUMENT_TYPE.EXAMINATION) {
    switch (role) {
      case ROLES.COORDINATOR:
        return { status: STATUS.EXAM_PRINCIPAL, current_level: ROLES.ADMIN };
      case ROLES.MASTER:
        if (fileStatus !== STATUS.EXAM_MASTER) return null;
        return { status: STATUS.FINALIZED, current_level: ROLES.ADMIN };
      default:
        return null;
    }
  }

  switch (role) {
    case ROLES.COORDINATOR:
      return { status: STATUS.REVIEWED_BY_COORDINATOR, current_level: ROLES.MASTER };
    case ROLES.MASTER:
      return { status: STATUS.REVIEWED_BY_MASTER, current_level: ROLES.ADMIN };
    default:
      return null;
  }
}

module.exports = { STATUS, DOCUMENT_TYPE, nextWorkflowState };

'use strict';

const { ROLES } = require('./roles');

const STATUS = Object.freeze({
  UPLOADED: 'uploaded',
  REVIEWED_BY_COORDINATOR: 'reviewed_by_coordinator',
  REVIEWED_BY_MASTER: 'reviewed_by_master',
  FINALIZED: 'finalized',
  RETURNED: 'returned',
});

/**
 * Given the role of the reviewer who just acted, return the next
 * (status, current_level) pair the file should move into when forwarded.
 */
function nextWorkflowState(reviewerRole) {
  switch (Number(reviewerRole)) {
    case ROLES.COORDINATOR:
      return { status: STATUS.REVIEWED_BY_COORDINATOR, current_level: ROLES.MASTER };
    case ROLES.MASTER:
      return { status: STATUS.REVIEWED_BY_MASTER, current_level: ROLES.ADMIN };
    case ROLES.ADMIN:
      return { status: STATUS.FINALIZED, current_level: ROLES.ADMIN };
    default:
      return null;
  }
}

module.exports = { STATUS, nextWorkflowState };

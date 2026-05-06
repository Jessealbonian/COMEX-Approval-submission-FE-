-- =====================================================================
-- COMEX Approval / Document Workflow - MySQL schema
-- Roles:
--   1 = Teacher
--   2 = Coordinator
--   3 = Master
--   4 = Principal / Admin
--
-- File status values:
--   'uploaded'                 - Teacher submitted; document is with the workflow's first reviewer
--   'reviewed_by_coordinator'  - DLP: Coordinator forwarded to Master (legacy / Coordinator path)
--   'reviewed_by_master'       - DLP: Master forwarded to Principal
--   'exam_principal'           - Examination: with Principal (after Master review)
--   'exam_master'              - Examination: with Master (after Coordinator review)
--   'finalized'                - Completed
--   'returned'                 - sent back for revision (optional)
--
-- document_type:
--   'dlp'          - Teacher → Master → Principal (finalize); Coordinator is out of this path
--   'examination'  - Teacher → Coordinator → Master → Principal (Principal finalizes)
--   'custom'       - Teacher selects reviewers via custom_stops (JSON array of 2,3,4)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `comex_approval`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `comex_approval`;

-- ---------------------------------------------------------------------
-- users: every account in the system (teachers, coords, masters, admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(150) NOT NULL,
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_level`    TINYINT UNSIGNED NOT NULL,
  -- Rank 1–7 for Teacher / Coordinator / Master workflow ordering; NULL for Principal (4).
  `teacher_rank`  TINYINT UNSIGNED NULL,
  -- Optional HR / profile fields (self-editable via /users/me/profile for non‑Principal roles).
  `mobile_phone`  VARCHAR(40) NULL,
  `telephone`     VARCHAR(40) NULL,
  `address`       TEXT NULL,
  `department_subject` VARCHAR(255) NULL,
  `position_title` VARCHAR(255) NULL,
  `employee_id`   VARCHAR(100) NULL,
  `emergency_contact_name` VARCHAR(150) NULL,
  `emergency_contact_phone` VARCHAR(40) NULL,
  `office_room`   VARCHAR(120) NULL,
  `work_schedule` VARCHAR(500) NULL,
  `civil_status`  VARCHAR(50) NULL,
  `nationality`   VARCHAR(100) NULL,
  `notes_other`   TEXT NULL,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  -- token_version is the JWT-revocation counter. Every issued JWT carries
  -- the current value; on logout we increment it, which immediately
  -- invalidates all previously issued tokens for that user (server-side
  -- session termination on top of stateless JWT).
  `token_version` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `ix_users_role_level` (`role_level`),
  CONSTRAINT `chk_users_role_level` CHECK (`role_level` BETWEEN 1 AND 4),
  CONSTRAINT `chk_users_teacher_rank` CHECK (`teacher_rank` IS NULL OR `teacher_rank` BETWEEN 1 AND 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- files: PDF documents submitted by teachers and routed up the chain
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `files` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uploaded_by`    INT UNSIGNED NOT NULL,
  `title`          VARCHAR(255) NOT NULL,
  `description`    TEXT NULL,
  `more_details`   TEXT NULL,
  `custom_type_label` VARCHAR(255) NULL,
  `custom_route`   ENUM('master_only','principal_only','both') NULL,
  `custom_stops`   JSON NULL,
  `original_name`  VARCHAR(255) NOT NULL,
  `stored_name`    VARCHAR(255) NOT NULL,
  `mime_type`      VARCHAR(120) NOT NULL,
  `size_bytes`     BIGINT UNSIGNED NOT NULL,
  `current_level`  TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `status`         ENUM(
                     'uploaded',
                     'reviewed_by_coordinator',
                     'reviewed_by_master',
                     'finalized',
                     'returned',
                     'exam_principal',
                     'exam_master'
                   ) NOT NULL DEFAULT 'uploaded',
  `document_type`  ENUM('dlp', 'examination', 'custom') NOT NULL DEFAULT 'dlp',
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_files_uploaded_by` (`uploaded_by`),
  KEY `ix_files_current_level` (`current_level`),
  KEY `ix_files_status` (`status`),
  CONSTRAINT `fk_files_uploaded_by`
    FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `chk_files_current_level`
    CHECK (`current_level` BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- comments: structured comments / revisions linked to a file and user
--   action:
--     'comment'  - a free-form note
--     'revision' - a revision request (flagged for the uploader)
--     'forward'  - forwarded to the next level (auto-logged)
--     'finalize' - finalized by the Principal (auto-logged)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `comments` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `file_id`      INT UNSIGNED NOT NULL,
  `user_id`      INT UNSIGNED NOT NULL,
  `role_level`   TINYINT UNSIGNED NOT NULL,
  `action`       ENUM('comment','revision','forward','finalize')
                  NOT NULL DEFAULT 'comment',
  `body`         TEXT NOT NULL,
  -- For action='revision' only: when set, the revision request has been
  -- marked as resolved by `resolved_by` at `resolved_at`. Forwarding to
  -- the next workflow level is blocked while any revision at the
  -- current level remains unresolved.
  `resolved_at`  DATETIME NULL,
  `resolved_by`  INT UNSIGNED NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_comments_file_id` (`file_id`),
  KEY `ix_comments_user_id` (`user_id`),
  KEY `ix_comments_resolved_by` (`resolved_by`),
  CONSTRAINT `fk_comments_file_id`
    FOREIGN KEY (`file_id`) REFERENCES `files`(`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_comments_resolved_by`
    FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `chk_comments_role_level`
    CHECK (`role_level` BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

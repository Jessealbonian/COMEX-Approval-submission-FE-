-- =====================================================================
-- COMEX Approval / Document Workflow - MySQL schema
-- Roles:
--   1 = Teacher
--   2 = Coordinator
--   3 = Master
--   4 = Principal / Admin
--
-- File status values:
--   'uploaded'                 - just submitted by Teacher (awaiting Coordinator)
--   'reviewed_by_coordinator'  - Coordinator forwarded to Master
--   'reviewed_by_master'       - Master forwarded to Principal
--   'finalized'                - Principal finalized the document
--   'returned'                 - sent back for revision (optional)
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
  CONSTRAINT `chk_users_role_level` CHECK (`role_level` BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- files: PDF documents submitted by teachers and routed up the chain
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `files` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uploaded_by`    INT UNSIGNED NOT NULL,
  `title`          VARCHAR(255) NOT NULL,
  `description`    TEXT NULL,
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
                     'returned'
                   ) NOT NULL DEFAULT 'uploaded',
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
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_comments_file_id` (`file_id`),
  KEY `ix_comments_user_id` (`user_id`),
  CONSTRAINT `fk_comments_file_id`
    FOREIGN KEY (`file_id`) REFERENCES `files`(`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `chk_comments_role_level`
    CHECK (`role_level` BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

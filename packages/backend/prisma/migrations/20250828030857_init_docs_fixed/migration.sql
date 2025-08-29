-- CreateTable
CREATE TABLE `alerts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(100) NOT NULL,
    `alert_type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` TINYINT NOT NULL,
    `location` VARCHAR(255) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `raw_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `alerts_alert_type_idx`(`alert_type`),
    INDEX `alerts_severity_idx`(`severity`),
    INDEX `alerts_latitude_longitude_idx`(`latitude`, `longitude`),
    INDEX `alerts_is_active_created_at_idx`(`is_active`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `summary` TEXT NULL,
    `location` VARCHAR(255) NULL,
    `category` VARCHAR(100) NOT NULL,
    `source_url` VARCHAR(500) NULL,
    `media_url` VARCHAR(500) NULL,
    `language` VARCHAR(10) NOT NULL DEFAULT 'en',
    `embedding` LONGBLOB NULL,
    `image_embedding` LONGBLOB NULL,
    `word_count` INTEGER NULL,
    `reading_time` INTEGER NULL,
    `confidence` FLOAT NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `alert_id` BIGINT NULL,

    INDEX `documents_category_idx`(`category`),
    INDEX `documents_published_at_idx`(`published_at`),
    INDEX `documents_confidence_idx`(`confidence`),
    FULLTEXT INDEX `documents_content_idx`(`content`),
    FULLTEXT INDEX `documents_title_idx`(`title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resources` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `country` VARCHAR(50) NOT NULL DEFAULT 'US',
    `postal_code` VARCHAR(20) NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(255) NULL,
    `website` VARCHAR(500) NULL,
    `capacity` INTEGER NULL,
    `current_load` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_emergency` BOOLEAN NOT NULL DEFAULT false,
    `operating_hours` JSON NULL,
    `services` JSON NULL,
    `disaster_types` JSON NULL,
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `embedding` LONGBLOB NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `resources_type_idx`(`type`),
    INDEX `resources_latitude_longitude_idx`(`latitude`, `longitude`),
    INDEX `resources_is_active_is_emergency_idx`(`is_active`, `is_emergency`),
    INDEX `resources_city_state_idx`(`city`, `state`),
    FULLTEXT INDEX `resources_name_idx`(`name`),
    FULLTEXT INDEX `resources_description_idx`(`description`),
    FULLTEXT INDEX `resources_address_idx`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `action_audit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `alert_id` BIGINT NULL,
    `action` VARCHAR(100) NOT NULL,
    `payload` JSON NULL,
    `status` VARCHAR(50) NOT NULL,
    `error_msg` TEXT NULL,
    `duration` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `action_audit_alert_id_idx`(`alert_id`),
    INDEX `action_audit_action_status_idx`(`action`, `status`),
    INDEX `action_audit_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_queue` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `task_type` VARCHAR(50) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `max_retries` INTEGER NOT NULL DEFAULT 3,
    `priority` INTEGER NOT NULL DEFAULT 5,
    `scheduled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error_msg` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `work_queue_status_priority_idx`(`status`, `priority`),
    INDEX `work_queue_task_type_status_idx`(`task_type`, `status`),
    INDEX `work_queue_scheduled_at_idx`(`scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_alert_id_fkey` FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

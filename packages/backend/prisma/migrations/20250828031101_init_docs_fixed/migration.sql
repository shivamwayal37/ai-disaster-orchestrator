-- DropIndex
DROP INDEX `documents_content_idx` ON `documents`;

-- DropIndex
DROP INDEX `documents_title_idx` ON `documents`;

-- DropIndex
DROP INDEX `resources_address_idx` ON `resources`;

-- DropIndex
DROP INDEX `resources_description_idx` ON `resources`;

-- DropIndex
DROP INDEX `resources_name_idx` ON `resources`;

-- CreateIndex
CREATE FULLTEXT INDEX `documents_content_idx` ON `documents`(`content`);

-- CreateIndex
CREATE FULLTEXT INDEX `documents_title_idx` ON `documents`(`title`);

-- CreateIndex
CREATE FULLTEXT INDEX `resources_name_idx` ON `resources`(`name`);

-- CreateIndex
CREATE FULLTEXT INDEX `resources_description_idx` ON `resources`(`description`);

-- CreateIndex
CREATE FULLTEXT INDEX `resources_address_idx` ON `resources`(`address`);

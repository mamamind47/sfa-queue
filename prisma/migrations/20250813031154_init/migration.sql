-- CreateTable
CREATE TABLE `Service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isOpen` BOOLEAN NOT NULL DEFAULT true,
    `currentTicketId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Service_code_key`(`code`),
    UNIQUE INDEX `Service_currentTicketId_key`(`currentTicketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serviceId` INTEGER NOT NULL,
    `number` INTEGER NOT NULL,
    `displayNo` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `status` ENUM('WAITING', 'CALLED', 'SERVED', 'SKIPPED', 'CANCELED') NOT NULL DEFAULT 'WAITING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `calledAt` DATETIME(3) NULL,
    `servedAt` DATETIME(3) NULL,
    `skippedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,

    UNIQUE INDEX `Ticket_token_key`(`token`),
    INDEX `Ticket_serviceId_createdAt_idx`(`serviceId`, `createdAt`),
    INDEX `Ticket_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Service` ADD CONSTRAINT `Service_currentTicketId_fkey` FOREIGN KEY (`currentTicketId`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

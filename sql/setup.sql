CREATE TABLE `sgo_users` (
	`user_id` INT UNSIGNED NOT NULL,
	`class` VARCHAR(50) NOT NULL DEFAULT '',
	`school_id` VARCHAR(50) NULL DEFAULT '',
	`eMs` VARCHAR(50) NULL,
	`name` INT UNSIGNED NOT NULL,
	`roles` VARCHAR(50) NOT NULL DEFAULT '',
	`last_login` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
	PRIMARY KEY (`user_id`, `class`)
) COLLATE='utf8mb4_general_ci';

CREATE TABLE `sgo_marks` (
	`user_id` INT UNSIGNED NOT NULL,
	`subject` VARCHAR(50) NOT NULL DEFAULT '',
	`date` TIMESTAMP NOT NULL,
	`mark` VARCHAR(50) NOT NULL DEFAULT '',
	CONSTRAINT `FK_sgo_marks_user` FOREIGN KEY (`user_id`) REFERENCES `sgo_users` (`user_id`) ON UPDATE CASCADE ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci';
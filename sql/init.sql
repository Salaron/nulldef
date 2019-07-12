CREATE TABLE `chat_params` (
	`peer_id` INT(10) UNSIGNED NOT NULL,
	`param` VARCHAR(50) NOT NULL,
	`value` INT(10) UNSIGNED NOT NULL,
	PRIMARY KEY (`peer_id`, `param`)
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;

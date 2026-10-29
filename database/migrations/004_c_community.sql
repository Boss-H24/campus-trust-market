CREATE TABLE IF NOT EXISTS conversation (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  buyer_id BIGINT UNSIGNED NOT NULL,
  seller_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_conversation(product_id,buyer_id,seller_id),
  FOREIGN KEY(product_id) REFERENCES product(id),
  FOREIGN KEY(buyer_id) REFERENCES app_user(id),
  FOREIGN KEY(seller_id) REFERENCES app_user(id),
  INDEX idx_conversation_buyer(buyer_id,id), INDEX idx_conversation_seller(seller_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_message (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  client_message_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content VARCHAR(1000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_message(conversation_id,sender_id,client_message_id),
  FOREIGN KEY(conversation_id) REFERENCES conversation(id),
  FOREIGN KEY(sender_id) REFERENCES app_user(id),
  INDEX idx_message_cursor(conversation_id,id), INDEX idx_message_rate(sender_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS favorite (
  user_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(user_id,product_id),
  FOREIGN KEY(user_id) REFERENCES app_user(id), FOREIGN KEY(product_id) REFERENCES product(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS report (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT UNSIGNED NOT NULL,
  target_type ENUM('PRODUCT','USER') NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  target_user_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(100) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  status ENUM('PENDING','INVESTIGATING','UPHELD','REJECTED','CLOSED') NOT NULL DEFAULT 'PENDING',
  decision ENUM('UPHELD','REJECTED') NULL,
  action ENUM('NONE','TAKE_DOWN','FREEZE_PRODUCT','DISABLE_USER') NOT NULL DEFAULT 'NONE',
  resolution_reason VARCHAR(200) NOT NULL DEFAULT '',
  reviewed_by BIGINT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY(reporter_id) REFERENCES app_user(id),
  FOREIGN KEY(target_user_id) REFERENCES app_user(id), FOREIGN KEY(reviewed_by) REFERENCES app_user(id),
  INDEX idx_report_owner(reporter_id,id), INDEX idx_report_queue(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_rule (
  rule_key VARCHAR(60) CHARACTER SET ascii PRIMARY KEY,
  value JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY(updated_by) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO platform_rule(rule_key,value) VALUES
 ('blocked_keywords',JSON_ARRAY('枪支','毒品','假证','代考','管制刀具','站外交易','加微信','加QQ','私下转账','扫码付款')),
 ('publish_per_minute','5'), ('messages_per_minute','30'), ('reports_per_minute','5'), ('publish_min_credit','60');

ALTER TABLE product ADD COLUMN moderation_frozen BOOLEAN NOT NULL DEFAULT FALSE;

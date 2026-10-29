CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  buyer_id BIGINT UNSIGNED NOT NULL,
  seller_id BIGINT UNSIGNED NOT NULL,
  product_title VARCHAR(50) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  product_version INT UNSIGNED NOT NULL,
  status ENUM(
    'PENDING_PAYMENT','PAID','PENDING_DELIVERY','IN_PROGRESS',
    'PENDING_CONFIRMATION','COMPLETED','DISPUTED','REFUNDING','CANCELLED'
  ) NOT NULL DEFAULT 'PENDING_PAYMENT',
  version INT UNSIGNED NOT NULL DEFAULT 0,
  buyer_request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  active_product_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status IN (
      'PENDING_PAYMENT','PAID','PENDING_DELIVERY','IN_PROGRESS',
      'PENDING_CONFIRMATION','DISPUTED','REFUNDING'
    ) THEN product_id ELSE NULL END
  ) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_orders_no UNIQUE (order_no),
  CONSTRAINT uq_orders_buyer_request UNIQUE (buyer_id, buyer_request_id),
  CONSTRAINT uq_orders_active_product UNIQUE (active_product_id),
  INDEX idx_orders_buyer (buyer_id, status, created_at, id),
  INDEX idx_orders_seller (seller_id, status, created_at, id),
  INDEX idx_orders_expiry (status, created_at, id),
  FOREIGN KEY (product_id) REFERENCES product(id),
  FOREIGN KEY (buyer_id) REFERENCES app_user(id),
  FOREIGN KEY (seller_id) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_status_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM(
    'PENDING_PAYMENT','PAID','PENDING_DELIVERY','IN_PROGRESS',
    'PENDING_CONFIRMATION','COMPLETED','DISPUTED','REFUNDING','CANCELLED'
  ) NULL,
  to_status ENUM(
    'PENDING_PAYMENT','PAID','PENDING_DELIVERY','IN_PROGRESS',
    'PENDING_CONFIRMATION','COMPLETED','DISPUTED','REFUNDING','CANCELLED'
  ) NOT NULL,
  action VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  actor_role ENUM('BUYER','SELLER','ADMIN','SYSTEM') NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_order_status_request UNIQUE (order_id, request_id),
  INDEX idx_order_status_history (order_id, created_at, id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (actor_id) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluation (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  reviewee_id BIGINT UNSIGNED NOT NULL,
  stars TINYINT UNSIGNED NOT NULL,
  content VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_evaluation_stars CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT uq_evaluation_reviewer UNIQUE (order_id, reviewer_id),
  INDEX idx_evaluation_reviewee (reviewee_id, created_at, id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (reviewer_id) REFERENCES app_user(id),
  FOREIGN KEY (reviewee_id) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS credit_event (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  delta SMALLINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_credit_event UNIQUE (event_type, source_id, user_id),
  INDEX idx_credit_event_user (user_id, created_at, id),
  FOREIGN KEY (user_id) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

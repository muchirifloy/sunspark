CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(191) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'CUSTOMER',
  phone VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX users_role_idx (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(191) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX password_reset_user_idx (user_id),
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  description TEXT NULL,
  parent_id VARCHAR(64) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX categories_parent_idx (parent_id),
  INDEX categories_active_sort_idx (is_active, sort_order),
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS category_images (
  id VARCHAR(64) PRIMARY KEY,
  category_id VARCHAR(64) NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt VARCHAR(191) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX category_images_category_idx (category_id),
  CONSTRAINT category_images_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  brand VARCHAR(191) NULL,
  short_description VARCHAR(500) NULL,
  description TEXT NULL,
  price_cents INT NOT NULL,
  compare_at_cents INT NULL,
  cost_cents INT NOT NULL DEFAULT 0,
  selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT',
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_hot_deal BOOLEAN NOT NULL DEFAULT FALSE,
  seo_title VARCHAR(191) NULL,
  seo_description VARCHAR(300) NULL,
  seo_keywords VARCHAR(300) NULL,
  category_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT products_search_idx (name, brand, short_description, description, seo_title, seo_description, seo_keywords),
  INDEX products_category_idx (category_id),
  INDEX products_active_updated_idx (is_active, updated_at),
  CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt VARCHAR(191) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX product_images_product_idx (product_id),
  CONSTRAINT product_images_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_options (
  id VARCHAR(64) PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  label VARCHAR(64) NOT NULL,
  selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT',
  price_cents INT NOT NULL,
  compare_at_cents INT NULL,
  cost_cents INT NOT NULL DEFAULT 0,
  stock_multiplier DECIMAL(10,2) NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX product_options_product_idx (product_id),
  INDEX product_options_default_idx (product_id, is_default),
  CONSTRAINT product_options_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wishlist_items (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY wishlist_unique (user_id, product_id),
  CONSTRAINT wishlist_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT wishlist_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  order_number VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(64) NULL,
  customer_name VARCHAR(191) NOT NULL,
  customer_email VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(64) NULL,
  delivery_note TEXT NULL,
  delivery_location VARCHAR(500) NULL,
  delivery_map_url VARCHAR(500) NULL,
  delivery_latitude VARCHAR(64) NULL,
  delivery_longitude VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(32) NOT NULL DEFAULT 'WHATSAPP',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
  subtotal_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX orders_user_idx (user_id),
  INDEX orders_status_idx (status),
  INDEX orders_created_idx (created_at),
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NULL,
  product_option_id VARCHAR(64) NULL,
  product_name VARCHAR(191) NOT NULL,
  option_label VARCHAR(64) NULL,
  selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT',
  unit_cents INT NOT NULL,
  cost_cents INT NOT NULL DEFAULT 0,
  quantity INT NOT NULL,
  total_cents INT NOT NULL,
  stock_deducted DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT order_items_option_fk FOREIGN KEY (product_option_id) REFERENCES product_options(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT invoices_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  badge VARCHAR(64) NULL,
  offer_label VARCHAR(191) NULL,
  cta_label VARCHAR(64) NULL,
  cta_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX campaigns_active_idx (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS badge VARCHAR(64) NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS offer_label VARCHAR(191) NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cta_label VARCHAR(64) NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cta_url VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR(64) PRIMARY KEY,
  store_name VARCHAR(191) NOT NULL DEFAULT 'Sunspark Electricals & Solar',
  support_email VARCHAR(191) NOT NULL DEFAULT 'support@sunsparkelectricals.co.ke',
  report_email VARCHAR(191) NOT NULL DEFAULT 'sunsparkelectricalsandsolar@gmail.com',
  whatsapp_phone VARCHAR(64) NOT NULL DEFAULT '254703586562',
  currency VARCHAR(16) NOT NULL DEFAULT 'KSH',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draft_documents (
  id VARCHAR(64) PRIMARY KEY,
  reference VARCHAR(64) NOT NULL UNIQUE,
  kind VARCHAR(32) NOT NULL DEFAULT 'INVOICE',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  order_id VARCHAR(64) NULL,
  customer_name VARCHAR(191) NOT NULL,
  customer_email VARCHAR(191) NULL,
  customer_phone VARCHAR(64) NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'CASH',
  subtotal_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX draft_documents_kind_status_idx (kind, status),
  INDEX draft_documents_order_idx (order_id),
  CONSTRAINT draft_documents_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draft_document_items (
  id VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  product_option_id VARCHAR(64) NULL,
  product_name VARCHAR(191) NOT NULL,
  option_label VARCHAR(64) NULL,
  selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT',
  unit_cents INT NOT NULL,
  cost_cents INT NOT NULL DEFAULT 0,
  quantity INT NOT NULL,
  total_cents INT NOT NULL,
  stock_deducted DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT draft_document_items_document_fk FOREIGN KEY (document_id) REFERENCES draft_documents(id) ON DELETE CASCADE,
  CONSTRAINT draft_document_items_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT draft_document_items_option_fk FOREIGN KEY (product_option_id) REFERENCES product_options(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_option_id VARCHAR(64) NULL AFTER product_id;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS option_label VARCHAR(64) NULL AFTER product_name;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT' AFTER option_label;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stock_deducted DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_cents;
ALTER TABLE draft_document_items ADD COLUMN IF NOT EXISTS product_option_id VARCHAR(64) NULL AFTER product_id;
ALTER TABLE draft_document_items ADD COLUMN IF NOT EXISTS option_label VARCHAR(64) NULL AFTER product_name;
ALTER TABLE draft_document_items ADD COLUMN IF NOT EXISTS selling_unit VARCHAR(32) NOT NULL DEFAULT 'UNIT' AFTER option_label;
ALTER TABLE draft_document_items ADD COLUMN IF NOT EXISTS stock_deducted DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_cents;
ALTER TABLE product_options ADD COLUMN IF NOT EXISTS stock_multiplier DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER cost_cents;

-- Negotiated pricing. `unit_cents` is what the customer actually pays and is what
-- profit is calculated from. `list_price_cents` records the catalogue price at the
-- moment of sale, so a discount or a markup stays auditable even after the product
-- price itself changes later. NULL means the line was never overridden.
-- Note: no semicolons in this comment. The migration runner splits statements on
-- them, so one here would be executed as a statement of its own.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS list_price_cents INT NULL AFTER unit_cents;
ALTER TABLE draft_document_items ADD COLUMN IF NOT EXISTS list_price_cents INT NULL AFTER unit_cents;

-- Where an order came from. Counter sales used to be told apart from web orders only by
-- the synthetic walkin-...@ address they are recorded under, which is a marker that
-- breaks the moment a cashier types the customer's real email. Recording the origin
-- explicitly keeps the split exact, which the bulk-messaging audience filters rely on.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'ONLINE' AFTER payment_status;
UPDATE orders SET source = 'WALK_IN' WHERE source = 'ONLINE' AND customer_email LIKE 'walkin-%';

-- Every SMS the system has handed to Celcom, with what Celcom said about it.
-- `segments` is the billable unit: a message over 160 GSM-7 characters is charged more
-- than once, so credit spend is summed from this rather than from a row count.
CREATE TABLE IF NOT EXISTS sms_messages (
  id VARCHAR(64) PRIMARY KEY,
  recipient VARCHAR(20) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  sender_id VARCHAR(30) NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'TRANSACTIONAL',
  message TEXT NOT NULL,
  segments INT NOT NULL DEFAULT 1,
  provider_message_id VARCHAR(64) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  response_code VARCHAR(10) NULL,
  detail VARCHAR(255) NULL,
  order_id VARCHAR(64) NULL,
  campaign_id VARCHAR(64) NULL,
  delivered_at DATETIME NULL,
  last_checked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX sms_messages_created_idx (created_at),
  INDEX sms_messages_status_created_idx (status, created_at),
  INDEX sms_messages_provider_idx (provider_message_id),
  INDEX sms_messages_campaign_idx (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per bulk send. Written before the send starts and updated as it runs, so a
-- campaign that is still going is visible in the admin rather than only appearing once
-- the last message has left.
CREATE TABLE IF NOT EXISTS message_campaigns (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'SMS',
  subject VARCHAR(220) NULL,
  message TEXT NOT NULL,
  audience VARCHAR(191) NOT NULL DEFAULT 'ALL',
  recipient_count INT NOT NULL DEFAULT 0,
  sms_recipient_count INT NOT NULL DEFAULT 0,
  email_recipient_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  sms_success_count INT NOT NULL DEFAULT 0,
  email_success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  sms_failure_count INT NOT NULL DEFAULT 0,
  email_failure_count INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'SENDING',
  detail VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX message_campaigns_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS sms_recipient_count INT NOT NULL DEFAULT 0 AFTER recipient_count;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS email_recipient_count INT NOT NULL DEFAULT 0 AFTER sms_recipient_count;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS sms_success_count INT NOT NULL DEFAULT 0 AFTER success_count;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS email_success_count INT NOT NULL DEFAULT 0 AFTER sms_success_count;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS sms_failure_count INT NOT NULL DEFAULT 0 AFTER failure_count;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS email_failure_count INT NOT NULL DEFAULT 0 AFTER sms_failure_count;

UPDATE message_campaigns
SET sms_recipient_count = recipient_count,
    sms_success_count = success_count,
    sms_failure_count = failure_count
WHERE channel = 'SMS' AND recipient_count > 0 AND sms_recipient_count = 0;

UPDATE message_campaigns
SET email_recipient_count = recipient_count,
    email_success_count = success_count,
    email_failure_count = failure_count
WHERE channel = 'EMAIL' AND recipient_count > 0 AND email_recipient_count = 0;

CREATE TABLE IF NOT EXISTS tracked_items (
  id TEXT PRIMARY KEY,
  price_text TEXT NOT NULL,
  product_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  css_selector TEXT NOT NULL,
  xpath TEXT NOT NULL,
  page_url TEXT NOT NULL,
  outer_html_snippet TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL,
  user_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_items_created_at ON tracked_items (created_at DESC);

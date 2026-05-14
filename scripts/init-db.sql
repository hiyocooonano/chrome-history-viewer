-- chrome-history-viewer: PostgreSQL initialization
-- Loaded once by the postgres container on first start.

CREATE SCHEMA IF NOT EXISTS chrome_history;

CREATE TABLE IF NOT EXISTS chrome_history.urls (
  id              BIGINT PRIMARY KEY,
  url             TEXT NOT NULL,
  title           TEXT,
  visit_count     INT DEFAULT 0,
  typed_count     INT DEFAULT 0,
  last_visit_time BIGINT NOT NULL,
  hidden          INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chrome_history.visits (
  id             BIGINT PRIMARY KEY,
  url            BIGINT NOT NULL REFERENCES chrome_history.urls(id),
  visit_time     BIGINT NOT NULL,
  from_visit     BIGINT DEFAULT 0,
  transition     INT DEFAULT 0,
  visit_duration BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chrome_history.search_terms (
  keyword_id      BIGINT NOT NULL,
  url_id          BIGINT NOT NULL REFERENCES chrome_history.urls(id),
  term            TEXT NOT NULL,
  normalized_term TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chrome_history.bookmark_folders (
  folder_id        TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  parent_folder_id TEXT,
  depth            INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chrome_history.bookmarks (
  folder_id      TEXT NOT NULL,
  url            TEXT NOT NULL,
  name           TEXT NOT NULL,
  date_added     BIGINT,
  date_last_used BIGINT
);

CREATE INDEX IF NOT EXISTS idx_visits_from ON chrome_history.visits(from_visit);
CREATE INDEX IF NOT EXISTS idx_visits_url ON chrome_history.visits(url);
CREATE INDEX IF NOT EXISTS idx_search_term ON chrome_history.search_terms(term);
CREATE UNIQUE INDEX IF NOT EXISTS uq_search_terms_url_term
  ON chrome_history.search_terms(url_id, term);
CREATE INDEX IF NOT EXISTS idx_bookmarks_folder ON chrome_history.bookmarks(folder_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON chrome_history.bookmarks(url);

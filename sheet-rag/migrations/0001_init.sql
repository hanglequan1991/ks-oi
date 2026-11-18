-- migrations/0001_init.sql
-- Core website tables (technical-design.html section 5).
-- Every statement is re-runnable: IF NOT EXISTS everywhere. No seed data (see 0002).

CREATE TABLE IF NOT EXISTS cities (
  slug TEXT PRIMARY KEY,
  name_vi TEXT NOT NULL, name_en TEXT
);

CREATE TABLE IF NOT EXISTS hotels (
  id TEXT PRIMARY KEY,                     -- sha256(fileId + ':' + gid), first 16 hex
  slug TEXT NOT NULL UNIQUE,
  city_slug TEXT NOT NULL REFERENCES cities(slug),
  name TEXT NOT NULL,
  name_search TEXT NOT NULL,
  stars INTEGER CHECK (stars BETWEEN 1 AND 5),
  address TEXT, area TEXT, lat REAL, lng REAL,
  description_vi TEXT, description_en TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','hidden')),
  source_file_id TEXT NOT NULL, source_gid TEXT NOT NULL, source_hash TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  rooms_synced_at TEXT, facilities_synced_at TEXT,
  UNIQUE (source_file_id, source_gid)
);
CREATE INDEX IF NOT EXISTS idx_hotels_city_status ON hotels (city_slug, status);
CREATE INDEX IF NOT EXISTS idx_hotels_status_name ON hotels (status, name_search);

CREATE TABLE IF NOT EXISTS facility_catalog (            -- canonical vocabulary
  code TEXT PRIMARY KEY,                   -- e.g. pool, parking, elevator
  category TEXT NOT NULL CHECK (category IN ('facility','service','building','furniture')),
  label_vi TEXT NOT NULL, label_en TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '[]'      -- JSON array of folded strings, used for mapping
);

CREATE TABLE IF NOT EXISTS hotel_facilities (
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code TEXT NOT NULL REFERENCES facility_catalog(code),
  source TEXT NOT NULL CHECK (source IN ('sheet','mytour','hotel_site','override')),
  confirmed INTEGER NOT NULL DEFAULT 1,    -- 0 = only the sheet lists it, Mytour does not
  PRIMARY KEY (hotel_id, code)
);

CREATE TABLE IF NOT EXISTS hotel_images (
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, alt_vi TEXT,
  PRIMARY KEY (hotel_id, url)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL, name_search TEXT NOT NULL,
  bed_type TEXT, size_m2 REAL, view TEXT, max_guests INTEGER,
  description TEXT,                        -- from the sheet only
  base_price INTEGER                       -- VND per night, from the sheet only, NULL = unknown
    CHECK (base_price IS NULL OR (typeof(base_price) = 'integer' AND base_price >= 0)),
  source TEXT NOT NULL CHECK (source IN ('sheet','mytour')),
  sheet_room_id TEXT,                      -- for a Mytour room: the sheet room it maps to
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rooms_hotel ON rooms (hotel_id);

CREATE TABLE IF NOT EXISTS booking_rules (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,   -- NULL = hotel-level rule
  raw_text TEXT NOT NULL,                  -- verbatim from the sheet, never rewritten
  checkin_time TEXT, checkout_time TEXT, cancellation TEXT, deposit TEXT,
  children_policy TEXT, pets TEXT, smoking TEXT, id_required TEXT,
  payment_methods TEXT, min_stay TEXT, surcharges TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','confirmed')),
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_hotel ON booking_rules (hotel_id, room_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS overrides (
  hotel_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL, value TEXT NOT NULL, set_by TEXT, set_at TEXT NOT NULL,
  PRIMARY KEY (hotel_id, entity, entity_id, field)
);

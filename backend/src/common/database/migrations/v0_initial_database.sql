-- AUTHORS
CREATE TABLE IF NOT EXISTS authors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    amazon_asin TEXT,
    provider TEXT
);

-- PUBLISHERS
CREATE TABLE IF NOT EXISTS publishers (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    name TEXT NOT NULL
);

-- SERIES
CREATE TABLE IF NOT EXISTS series (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT,
    avatar_url TEXT,
    billing_address JSONB,
    payment_method JSONB,
    username TEXT UNIQUE,
    email TEXT UNIQUE
);

-- LIBRARY
CREATE TABLE IF NOT EXISTS library (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    name TEXT NOT NULL,
    is_cron_watch BOOL DEFAULT FALSE,
    is_public BOOL DEFAULT FALSE
);

-- LIBRARY PATH
CREATE TABLE IF NOT EXISTS library_path (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    library_id BIGINT REFERENCES library(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    is_enabled BOOL DEFAULT TRUE
);

-- BOOKS
CREATE TABLE IF NOT EXISTS books (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    filename TEXT NOT NULL,
    last_modified TIMESTAMPTZ,
    filesize_kb INT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    library_id BIGINT REFERENCES library(id) ON DELETE SET NULL,
    library_path_id BIGINT REFERENCES library_path(id) ON DELETE SET NULL
);

-- BOOK METADATA
CREATE TABLE IF NOT EXISTS book_metadata (
    book_id BIGINT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    description TEXT,
    published_date DATE,
    language_code VARCHAR(8),
    page_count INT,
    isbn_10 VARCHAR(32),
    isbn_13 VARCHAR(32),
    asin VARCHAR(32),
    cover VARCHAR(255),
    amount_chars INT,
    publisher_id BIGINT REFERENCES publishers(id),
    series_id BIGINT REFERENCES series(id)
);

-- BOOK AUTHORS (many-to-many, with role)
CREATE TABLE IF NOT EXISTS book_authors (
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    author_id BIGINT REFERENCES authors(id) ON DELETE CASCADE,
    role TEXT,
    PRIMARY KEY (book_id, author_id)
);

-- BOOK SERIES (many-to-many, with position)
CREATE TABLE IF NOT EXISTS book_series (
    series_id BIGINT REFERENCES series(id) ON DELETE CASCADE,
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    position INT,
    PRIMARY KEY (series_id, book_id)
);

-- BOOK METADATA LOCKS
CREATE TABLE IF NOT EXISTS book_metadata_locks (
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    locked BOOL DEFAULT FALSE,
    PRIMARY KEY (book_id, field_name)
);

-- BOOK METADATA ORIGINAL
CREATE TABLE IF NOT EXISTS book_metadata_original (
    book_id BIGINT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    import_date TIMESTAMP,
    metadata JSONB
);

-- EXTERNAL BOOK RATINGS
CREATE TABLE IF NOT EXISTS external_book_ratings (
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    provider TEXT,
    rating FLOAT,
    review_count INT,
    last_updated TIMESTAMP,
    PRIMARY KEY (book_id, provider)
);

-- COLLECTIONS
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- COLLECTION BOOKS (many-to-many)
CREATE TABLE IF NOT EXISTS collection_books (
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (collection_id, book_id)
);

-- LIKED BOOKS
CREATE TABLE IF NOT EXISTS liked_books (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
);

-- USER BOOK PROGRESS
CREATE TABLE IF NOT EXISTS user_book_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    last_read TIMESTAMPTZ,
    percentage NUMERIC
);

-- BOOK RATINGS (internal)
CREATE TABLE IF NOT EXISTS book_ratings (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
    rating INT,
    review TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, book_id)
);

-- USER LIBRARY
CREATE TABLE IF NOT EXISTS user_library (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    library_id BIGINT REFERENCES library(id) ON DELETE CASCADE
);

-- USER SETTINGS
CREATE TABLE IF NOT EXISTS user_settings (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value TEXT
);

-- APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT
);
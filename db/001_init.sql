CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','user')),
 enabled boolean NOT NULL DEFAULT true, totp_secret text,
 last_totp_step bigint NOT NULL DEFAULT -1,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(role <> 'admin' OR totp_secret IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS cameras (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 location text NOT NULL, latitude double precision, longitude double precision,
 stream_path text UNIQUE NOT NULL CHECK(stream_path ~ '^[a-zA-Z0-9_-]+$'),
 enabled boolean NOT NULL DEFAULT true, public_approved boolean NOT NULL DEFAULT false,
 health text NOT NULL DEFAULT 'unknown' CHECK(health IN ('unknown','online','offline')),
 health_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
 CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS camera_grants (
 camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(camera_id,user_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, action text NOT NULL,
 target text, ip text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ip text NOT NULL,
 email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_ip ON login_attempts(ip,created_at);
CREATE INDEX IF NOT EXISTS attempts_email ON login_attempts(email,created_at);

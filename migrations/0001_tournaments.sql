PRAGMA foreign_keys = ON;

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY CHECK(length(id) = 32),
  organizer_token_hash TEXT NOT NULL CHECK(length(organizer_token_hash) = 64),
  creator_session_id TEXT NOT NULL CHECK(length(creator_session_id) = 36),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  game_label TEXT NOT NULL CHECK(length(game_label) BETWEEN 1 AND 40),
  venue TEXT NOT NULL CHECK(length(venue) BETWEEN 1 AND 80),
  public_note TEXT NOT NULL DEFAULT '' CHECK(length(public_note) <= 400),
  starts_at INTEGER NOT NULL,
  max_players INTEGER NOT NULL CHECK(max_players BETWEEN 4 AND 64),
  planned_rounds INTEGER NOT NULL CHECK(planned_rounds BETWEEN 2 AND 7),
  status TEXT NOT NULL DEFAULT 'registration'
    CHECK(status IN ('registration', 'active', 'completed', 'cancelled', 'hidden')),
  current_round INTEGER NOT NULL DEFAULT 0 CHECK(current_round BETWEEN 0 AND 7),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX tournaments_expiry_idx ON tournaments(expires_at);
CREATE INDEX tournaments_creator_idx ON tournaments(creator_session_id, created_at);

CREATE TABLE players (
  id TEXT PRIMARY KEY CHECK(length(id) = 32),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  token_hash TEXT NOT NULL CHECK(length(token_hash) = 64),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 32),
  display_name_key TEXT NOT NULL CHECK(length(display_name_key) BETWEEN 1 AND 64),
  checked_in INTEGER NOT NULL DEFAULT 0 CHECK(checked_in IN (0, 1)),
  dropped INTEGER NOT NULL DEFAULT 0 CHECK(dropped IN (0, 1)),
  bye_count INTEGER NOT NULL DEFAULT 0 CHECK(bye_count BETWEEN 0 AND 7),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tournament_id, session_id),
  UNIQUE(tournament_id, display_name_key)
);

CREATE INDEX players_tournament_idx ON players(tournament_id, created_at);

CREATE TABLE matches (
  id TEXT PRIMARY KEY CHECK(length(id) = 32),
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 7),
  table_number INTEGER NOT NULL CHECK(table_number BETWEEN 1 AND 32),
  player1_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player2_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  player1_report TEXT NOT NULL DEFAULT ''
    CHECK(player1_report IN ('', 'p1', 'p2', 'draw')),
  player2_report TEXT NOT NULL DEFAULT ''
    CHECK(player2_report IN ('', 'p1', 'p2', 'draw')),
  confirmed_result TEXT NOT NULL DEFAULT ''
    CHECK(confirmed_result IN ('', 'p1', 'p2', 'draw')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'disputed', 'confirmed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tournament_id, round_number, table_number)
);

CREATE INDEX matches_round_idx ON matches(tournament_id, round_number);

CREATE TABLE content_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  reason TEXT NOT NULL CHECK(reason IN ('spam', 'unsafe', 'other')),
  created_at INTEGER NOT NULL,
  UNIQUE(tournament_id, session_id)
);

CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  tournament_id TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL CHECK(length(day) = 10),
  created_at INTEGER NOT NULL,
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK(is_qa IN (0, 1))
);

CREATE INDEX product_events_day_idx ON product_events(day, name, is_qa);


CREATE TABLE etsy_request_pacing (
 id INTEGER PRIMARY KEY CHECK (id=1),
 next_at_ms INTEGER NOT NULL DEFAULT 0,
 qps_limit INTEGER NOT NULL DEFAULT 5,
 updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO etsy_request_pacing (id) VALUES (1);

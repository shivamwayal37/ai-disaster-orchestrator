-- sql/create_tables.sql
-- AI Disaster Response Orchestrator - TiDB Schema
CREATE DATABASE IF NOT EXISTS disaster_db;
USE disaster_db;

-- Historical disaster reports & manuals
CREATE TABLE IF NOT EXISTS disaster_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255),
  type VARCHAR(100),           -- flood, earthquake, wildfire...
  date DATETIME,
  location VARCHAR(255),
  latitude DOUBLE,
  longitude DOUBLE,
  source_url VARCHAR(500),
  -- retrieval fields
  full_text LONGTEXT,
  vector_embedding VARBINARY(3072) -- placeholder; replace with VECTOR(768) in TiDB Cloud
);

-- Streaming incidents (ingested from APIs)
CREATE TABLE IF NOT EXISTS live_incidents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source VARCHAR(100),         -- weather, twitter, nasa
  raw_data JSON,
  processed_text TEXT,         -- normalized summary
  media_url VARCHAR(500),      -- optional img for satellite/tweet
  image_embedding VARBINARY(2048), -- image encoder (e.g., CLIP-ViT)
  text_embedding VARBINARY(3072),
  incident_type VARCHAR(100),  -- predicted type tag (optional)
  latitude DOUBLE,
  longitude DOUBLE,
  severity TINYINT,            -- coarse score from heuristics
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Protocols / playbooks (PDF chunks)
CREATE TABLE IF NOT EXISTS response_protocols (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_doc VARCHAR(255),
  section VARCHAR(255),
  chunk_index INT,
  text LONGTEXT,
  text_embedding VARBINARY(3072),
  full_text LONGTEXT
);

-- Audit trail of actions taken
CREATE TABLE IF NOT EXISTS action_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  incident_id BIGINT,
  action VARCHAR(100),         -- "ROUTE_GENERATED", "SMS_SENT", ...
  payload JSON,
  status VARCHAR(50),          -- SUCCESS/ERROR
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task queue (lightweight) for workers
CREATE TABLE IF NOT EXISTS work_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_type VARCHAR(50),       -- INGEST, EMBED, PLAN, ROUTE, NOTIFY
  payload JSON,
  status VARCHAR(20),          -- PENDING, RUNNING, DONE, ERROR
  retry_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Indexes for performance
-- Note: Replace VARBINARY with VECTOR(768) etc. when using TiDB Cloud
-- CREATE INDEX idx_disaster_reports_location ON disaster_reports(latitude, longitude);
-- CREATE INDEX idx_live_incidents_location ON live_incidents(latitude, longitude);
-- CREATE INDEX idx_live_incidents_type ON live_incidents(incident_type);
-- CREATE INDEX idx_work_queue_status ON work_queue(status, task_type);

-- Full-text search indexes (TiDB supports MySQL-style FULLTEXT)
-- CREATE FULLTEXT INDEX idx_disaster_reports_fulltext ON disaster_reports(full_text);
-- CREATE FULLTEXT INDEX idx_protocols_fulltext ON response_protocols(full_text);

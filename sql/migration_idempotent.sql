-- Idempotent Migration Script for TiDB Serverless
-- Day 2: Can be run multiple times without conflicts

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS disaster_db;
USE disaster_db;

-- Drop tables if they exist (for clean re-runs)
-- Uncomment these lines if you need to reset the schema
-- DROP TABLE IF EXISTS action_audit;
-- DROP TABLE IF EXISTS work_queue;
-- DROP TABLE IF EXISTS documents;
-- DROP TABLE IF EXISTS resources;
-- DROP TABLE IF EXISTS alerts;

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source VARCHAR(100) NOT NULL COMMENT 'weather, twitter, nasa, manual',
  alert_type VARCHAR(100) NOT NULL COMMENT 'flood, earthquake, wildfire, hurricane',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity TINYINT NOT NULL COMMENT '1-5 scale',
  location VARCHAR(255),
  latitude DOUBLE,
  longitude DOUBLE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  raw_data JSON COMMENT 'Original API response',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create documents table with vector support
CREATE TABLE IF NOT EXISTS documents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  summary TEXT COMMENT 'AI-generated summary',
  location VARCHAR(255),
  category VARCHAR(100) NOT NULL COMMENT 'protocol, report, news, social_media',
  source_url VARCHAR(500),
  media_url VARCHAR(500),
  language VARCHAR(10) DEFAULT 'en',
  
  -- Vector embeddings (TiDB VECTOR type)
  embedding VECTOR(768) COMMENT 'Text embedding for semantic search',
  image_embedding VECTOR(512) COMMENT 'Image embedding using CLIP',
  
  -- Metadata
  word_count INT,
  reading_time INT COMMENT 'Estimated reading time in minutes',
  confidence FLOAT COMMENT 'AI confidence score 0-1',
  
  -- Timestamps
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Relations
  alert_id BIGINT,
  
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL
);

-- Create resources table
CREATE TABLE IF NOT EXISTS resources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL COMMENT 'shelter, hospital, ngo, fire_station, police',
  description TEXT,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  country VARCHAR(50) DEFAULT 'US',
  postal_code VARCHAR(20),
  
  -- Geographic coordinates
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  
  -- Contact information
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(500),
  
  -- Capacity and availability
  capacity INT COMMENT 'Maximum people/beds',
  current_load INT COMMENT 'Current occupancy',
  is_active BOOLEAN DEFAULT TRUE,
  is_emergency BOOLEAN DEFAULT FALSE COMMENT '24/7 emergency services',
  
  -- Operating hours and services (JSON format)
  operating_hours JSON,
  services JSON COMMENT 'Array of services offered',
  disaster_types JSON COMMENT 'Array of disaster types supported',
  
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Vector embedding for semantic matching
  embedding VECTOR(768) COMMENT 'Resource description embedding',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create audit and queue tables
CREATE TABLE IF NOT EXISTS action_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  alert_id BIGINT,
  action VARCHAR(100) NOT NULL COMMENT 'ROUTE_GENERATED, SMS_SENT, PLAN_CREATED',
  payload JSON,
  status VARCHAR(50) NOT NULL COMMENT 'SUCCESS, ERROR, PENDING',
  error_msg TEXT,
  duration INT COMMENT 'Execution time in milliseconds',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_type VARCHAR(50) NOT NULL COMMENT 'INGEST, EMBED, PLAN, ROUTE, NOTIFY',
  payload JSON NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING, RUNNING, DONE, ERROR',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  priority INT DEFAULT 5 COMMENT '1=highest, 10=lowest',
  scheduled_at TIMESTAMP NULL COMMENT 'For delayed tasks',
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  error_msg TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create indexes (idempotent - will not fail if they exist)
-- Full-text indexes
CREATE FULLTEXT INDEX IF NOT EXISTS idx_documents_content ON documents(content);
CREATE FULLTEXT INDEX IF NOT EXISTS idx_documents_title_content ON documents(title, content);
CREATE FULLTEXT INDEX IF NOT EXISTS idx_resources_search ON resources(name, description, address);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_location ON alerts(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active, created_at);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_published ON documents(published_at);
CREATE INDEX IF NOT EXISTS idx_documents_confidence ON documents(confidence);
CREATE INDEX IF NOT EXISTS idx_documents_alert ON documents(alert_id);

CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_location ON resources(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_resources_active ON resources(is_active, is_emergency);
CREATE INDEX IF NOT EXISTS idx_resources_city_state ON resources(city, state);

CREATE INDEX IF NOT EXISTS idx_audit_alert ON action_audit(alert_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_status ON action_audit(action, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON action_audit(created_at);

CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON work_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_queue_task_status ON work_queue(task_type, status);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON work_queue(scheduled_at);

-- Vector indexes (TiDB specific syntax)
-- Note: These may need to be created manually in TiDB Cloud UI if syntax varies
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents(embedding) USING HNSW;
CREATE INDEX IF NOT EXISTS idx_resources_embedding ON resources(embedding) USING HNSW;

-- Insert sample data (idempotent using INSERT IGNORE)
INSERT IGNORE INTO alerts (id, source, alert_type, title, description, severity, location, latitude, longitude, start_time) VALUES
(1, 'openweather', 'flood', 'Severe Flood Warning - Riverdale District', 'Heavy rainfall causing river overflow with potential for significant flooding', 4, 'Riverdale District', 12.34, 56.78, NOW()),
(2, 'twitter', 'wildfire', 'Wildfire Smoke Reports - Pine Valley', 'Multiple social media reports of wildfire smoke and evacuation warnings', 3, 'Pine Valley', 34.56, 78.90, NOW()),
(3, 'nasa', 'earthquake', 'Seismic Activity Detected - Coastal Region', 'Satellite data shows ground displacement consistent with seismic activity', 2, 'Coastal Region', 25.67, 89.12, NOW());

INSERT IGNORE INTO documents (id, title, content, category, alert_id, confidence) VALUES
(1, 'Flood Response Protocol', 'Emergency flood response procedures: 1. Assess water levels 2. Deploy sandbags 3. Evacuate if necessary 4. Coordinate with emergency services', 'protocol', 1, 1.0),
(2, 'Wildfire Evacuation Guidelines', 'When wildfire threatens your area: 1. Monitor official channels 2. Prepare go-bag 3. Know evacuation routes 4. Leave early if advised', 'protocol', 2, 1.0),
(3, 'Earthquake Safety Manual', 'During earthquake: Drop, Cover, Hold On. After earthquake: Check for injuries, hazards, and damage. Be prepared for aftershocks.', 'protocol', 3, 1.0);

INSERT IGNORE INTO resources (id, name, type, address, city, state, latitude, longitude, capacity, is_emergency) VALUES
(1, 'Central Community Shelter', 'shelter', '123 Main St', 'Riverdale', 'CA', 12.35, 56.77, 200, TRUE),
(2, 'Memorial Hospital', 'hospital', '456 Health Ave', 'Pine Valley', 'CA', 34.57, 78.91, 150, TRUE),
(3, 'Fire Station 12', 'fire_station', '789 Emergency Blvd', 'Coastal City', 'CA', 25.68, 89.13, 50, TRUE);

-- Verify the migration
SELECT 'Migration completed successfully' as status;
SELECT 
  TABLE_NAME, 
  TABLE_ROWS 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'disaster_db' 
  AND TABLE_NAME IN ('alerts', 'documents', 'resources', 'action_audit', 'work_queue');

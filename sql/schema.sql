-- AI Disaster Response Orchestrator - Enhanced TiDB Schema
-- Day 2: Database Migrations + Index Setup

CREATE DATABASE IF NOT EXISTS disaster_db;
USE disaster_db;

-- Incoming disaster alerts from various sources
CREATE TABLE alerts (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_alert_type (alert_type),
  INDEX idx_severity (severity),
  INDEX idx_location (latitude, longitude),
  INDEX idx_active_created (is_active, created_at)
);

-- Documents with AI summaries and vector embeddings
CREATE TABLE documents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  summary TEXT COMMENT 'AI-generated summary',
  location VARCHAR(255),
  category VARCHAR(100) NOT NULL COMMENT 'protocol, report, news, social_media',
  source_url VARCHAR(500),
  media_url VARCHAR(500),
  language VARCHAR(10) DEFAULT 'en',
  
  -- Vector embeddings for semantic search (TiDB VECTOR type)
  embedding VECTOR(1536) COMMENT 'Text embedding for semantic search',
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
  
  INDEX idx_category (category),
  INDEX idx_published (published_at),
  INDEX idx_confidence (confidence),
  INDEX idx_alert (alert_id),
  
  -- Full-text search indexes
  FULLTEXT INDEX idx_content_ft (content),
  FULLTEXT INDEX idx_title_content_ft (title, content),
  
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL
);

-- Relief resources (shelters, hospitals, NGOs, etc.)
CREATE TABLE resources (
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
  embedding VECTOR(1536) COMMENT 'Resource description embedding',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_location (latitude, longitude),
  INDEX idx_active_emergency (is_active, is_emergency),
  INDEX idx_city_state (city, state),
  
  -- Full-text search for resource discovery
  FULLTEXT INDEX idx_resource_ft (name, description, address)
);

-- Action audit trail
CREATE TABLE action_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  alert_id BIGINT,
  action VARCHAR(100) NOT NULL COMMENT 'ROUTE_GENERATED, SMS_SENT, PLAN_CREATED',
  payload JSON,
  status VARCHAR(50) NOT NULL COMMENT 'SUCCESS, ERROR, PENDING',
  error_msg TEXT,
  duration INT COMMENT 'Execution time in milliseconds',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_alert (alert_id),
  INDEX idx_action_status (action, status),
  INDEX idx_created (created_at)
);

-- Work queue for background tasks
CREATE TABLE work_queue (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_status_priority (status, priority),
  INDEX idx_task_status (task_type, status),
  INDEX idx_scheduled (scheduled_at)
);

-- Create vector indexes for semantic search
-- Note: Syntax may vary based on TiDB version
CREATE INDEX idx_documents_embedding ON documents(embedding) USING HNSW;
CREATE INDEX idx_resources_embedding ON resources(embedding) USING HNSW;

-- Sample data for testing
INSERT INTO alerts (source, alert_type, title, description, severity, location, latitude, longitude, start_time) VALUES
('openweather', 'flood', 'Severe Flood Warning - Riverdale District', 'Heavy rainfall causing river overflow with potential for significant flooding', 4, 'Riverdale District', 12.34, 56.78, NOW()),
('twitter', 'wildfire', 'Wildfire Smoke Reports - Pine Valley', 'Multiple social media reports of wildfire smoke and evacuation warnings', 3, 'Pine Valley', 34.56, 78.90, NOW()),
('nasa', 'earthquake', 'Seismic Activity Detected - Coastal Region', 'Satellite data shows ground displacement consistent with seismic activity', 2, 'Coastal Region', 25.67, 89.12, NOW());

INSERT INTO documents (title, content, category, alert_id) VALUES
('Flood Response Protocol', 'Emergency flood response procedures: 1. Assess water levels 2. Deploy sandbags 3. Evacuate if necessary 4. Coordinate with emergency services', 'protocol', 1),
('Wildfire Evacuation Guidelines', 'When wildfire threatens your area: 1. Monitor official channels 2. Prepare go-bag 3. Know evacuation routes 4. Leave early if advised', 'protocol', 2),
('Earthquake Safety Manual', 'During earthquake: Drop, Cover, Hold On. After earthquake: Check for injuries, hazards, and damage. Be prepared for aftershocks.', 'protocol', 3);

INSERT INTO resources (name, type, address, city, state, latitude, longitude, capacity, is_emergency) VALUES
('Central Community Shelter', 'shelter', '123 Main St', 'Riverdale', 'CA', 12.35, 56.77, 200, TRUE),
('Memorial Hospital', 'hospital', '456 Health Ave', 'Pine Valley', 'CA', 34.57, 78.91, 150, TRUE),
('Fire Station 12', 'fire_station', '789 Emergency Blvd', 'Coastal City', 'CA', 25.68, 89.13, 50, TRUE);

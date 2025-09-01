-- Initial schema setup for AI Disaster Response Orchestrator
-- This migration creates all necessary tables with proper types and indexes

-- Enable new collation for better Unicode support
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS disaster_db;
USE disaster_db;

-- Historical disaster reports & manuals
CREATE TABLE IF NOT EXISTS disaster_reports (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,           -- flood, earthquake, wildfire...
  date DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  source_url VARCHAR(500),
  full_text LONGTEXT NOT NULL,
  text_embedding VECTOR(1536),          -- Text embedding vector
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add spatial index for location-based queries
  SPATIAL INDEX idx_location (latitude, longitude),
  -- Add full-text search index
  FULLTEXT INDEX idx_ft_search (title, full_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Live incident alerts from various sources
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  source VARCHAR(100) NOT NULL,         -- weather, twitter, nasa, etc.
  title VARCHAR(255) NOT NULL,
  description TEXT,
  incident_type VARCHAR(100) NOT NULL,
  severity TINYINT NOT NULL,            -- 1-5 scale
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  effective DATETIME NOT NULL,          -- When the alert is effective from
  expires DATETIME,                     -- When the alert expires
  raw_data JSON,                        -- Original data from source
  media_url VARCHAR(500),               -- Optional media URL
  image_embedding VECTOR(512),          -- Image embedding vector
  text_embedding VECTOR(1536),          -- Text embedding vector
  status VARCHAR(50) DEFAULT 'active',  -- active, expired, resolved
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add indexes for common queries
  INDEX idx_incident_type (incident_type),
  INDEX idx_severity_effective (severity, effective),
  SPATIAL INDEX idx_location (latitude, longitude),
  FULLTEXT INDEX idx_ft_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Response protocols and procedures
CREATE TABLE IF NOT EXISTS response_protocols (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,       -- medical, evacuation, safety, etc.
  content LONGTEXT NOT NULL,
  source_doc VARCHAR(255),              -- Original document name
  section VARCHAR(255),                 -- Section in original document
  page_number INT,
  text_embedding VECTOR(1536),          -- Text embedding vector
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add full-text search index
  FULLTEXT INDEX idx_ft_search (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Emergency resources (shelters, hospitals, etc.)
CREATE TABLE IF NOT EXISTS resources (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,           -- shelter, hospital, supply_center, etc.
  category VARCHAR(100),                -- medical, food, shelter, etc.
  description TEXT,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  capacity INT,
  current_occupancy INT,
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available', -- available, full, closed, etc.
  text_embedding VECTOR(1536),          -- Text embedding vector
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add indexes for common queries
  INDEX idx_type_status (type, status),
  SPATIAL INDEX idx_location (latitude, longitude),
  FULLTEXT INDEX idx_ft_search (name, description, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Action audit log
CREATE TABLE IF NOT EXISTS action_audit (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  action_type VARCHAR(100) NOT NULL,    -- alert_processed, route_generated, etc.
  entity_type VARCHAR(50),              -- alert, resource, protocol, etc.
  entity_id BIGINT,                     -- ID of the affected entity
  status VARCHAR(50) NOT NULL,          -- success, error, pending
  details JSON,                         -- Additional context/error details
  performed_by VARCHAR(100),            -- System component or user who performed the action
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Add indexes for common queries
  INDEX idx_action_type (action_type),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task queue for background jobs
CREATE TABLE IF NOT EXISTS work_queue (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  task_type VARCHAR(100) NOT NULL,      -- alert_processing, embedding_generation, etc.
  priority TINYINT DEFAULT 5,           -- 1-10, 1 being highest priority
  status VARCHAR(50) NOT NULL,          -- pending, processing, completed, failed
  payload JSON,                         -- Task parameters
  error_message TEXT,                   -- Error details if task failed
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add indexes for queue processing
  INDEX idx_status_priority (status, priority, scheduled_at),
  INDEX idx_task_type (task_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

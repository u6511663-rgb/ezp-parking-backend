CREATE DATABASE ezp_parking;
USE ezp_parking;
CREATE TABLE buildings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE floors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT,
  code VARCHAR(20),
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (building_id) REFERENCES buildings(id)
);
CREATE TABLE slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  floor_id INT,
  code VARCHAR(10),
  status ENUM('free','occupied') DEFAULT 'free',
  last_update DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (floor_id) REFERENCES floors(id)
);
CREATE TABLE slot_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT,
  status ENUM('free','occupied'),
  changed_at DATETIME,
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);
CREATE TABLE alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE DATABASE IF NOT EXISTS aquacare_db;
USE aquacare_db;

CREATE TABLE IF NOT EXISTS Residents (
    resident_id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(15) NOT NULL UNIQUE,
    email VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS Areas (
    area_id VARCHAR(40) PRIMARY KEY,
    area_name VARCHAR(120) NOT NULL,
    city VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL
);

CREATE TABLE IF NOT EXISTS Maintenance_Teams (
    team_id VARCHAR(40) PRIMARY KEY,
    team_name VARCHAR(120) NOT NULL,
    team_leader VARCHAR(120) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    availability ENUM('Available', 'Unavailable') DEFAULT 'Available'
);

CREATE TABLE IF NOT EXISTS Complaints (
    complaint_id VARCHAR(40) PRIMARY KEY,
    area_id VARCHAR(40) NOT NULL,
    complaint_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    location_details VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    image_path LONGTEXT NULL,
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    complaint_date VARCHAR(60) NOT NULL,
    status ENUM('Pending', 'Assigned', 'In Progress', 'Resolved') DEFAULT 'Pending',
    FOREIGN KEY (area_id) REFERENCES Areas(area_id)
);

CREATE TABLE IF NOT EXISTS Complaint_Reports (
    report_id VARCHAR(40) PRIMARY KEY,
    complaint_id VARCHAR(40) NOT NULL,
    resident_id VARCHAR(40) NOT NULL,
    report_date VARCHAR(60) NOT NULL,
    description TEXT NOT NULL,
    image_path LONGTEXT NULL,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id),
    FOREIGN KEY (resident_id) REFERENCES Residents(resident_id)
);

CREATE TABLE IF NOT EXISTS Assignments (
    assignment_id VARCHAR(40) PRIMARY KEY,
    complaint_id VARCHAR(40) NOT NULL,
    team_id VARCHAR(40) NOT NULL,
    admin_id VARCHAR(40) NOT NULL,
    assigned_date VARCHAR(60) NOT NULL,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id),
    FOREIGN KEY (team_id) REFERENCES Maintenance_Teams(team_id)
);

CREATE TABLE IF NOT EXISTS Complaint_Status_History (
    history_id VARCHAR(40) PRIMARY KEY,
    complaint_id VARCHAR(40) NOT NULL,
    old_status VARCHAR(40) NULL,
    new_status VARCHAR(40) NOT NULL,
    updated_by VARCHAR(80) NOT NULL,
    remarks TEXT,
    updated_at VARCHAR(60) NOT NULL,
    FOREIGN KEY (complaint_id) REFERENCES Complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS Contact_Messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    created_at VARCHAR(60) NOT NULL
);

INSERT IGNORE INTO Maintenance_Teams (team_id, team_name, team_leader, phone, availability)
VALUES
    ('TEAM-101', 'Pipeline Repair Team', 'Demo Leader 1', '9000000001', 'Available'),
    ('TEAM-102', 'Water Supply Team', 'Demo Leader 2', '9000000002', 'Available');
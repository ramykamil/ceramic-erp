CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    Action VARCHAR(100) NOT NULL,
    TableName VARCHAR(100),
    RecordID INT,
    OldValues JSONB,
    NewValues JSONB,
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active Sessions table (if missed in previous updates)
CREATE TABLE IF NOT EXISTS ActiveSessions (
    SessionID SERIAL PRIMARY KEY,
    UserID INT REFERENCES Users(UserID),
    IPAddress VARCHAR(50),
    UserAgent TEXT,
    LoginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

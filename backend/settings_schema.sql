-- Global Settings Schema
-- Run this SQL to create the settings storage table

-- 1. Create Settings Table (Singleton pattern - one row for all settings)
CREATE TABLE IF NOT EXISTS AppSettings (
    SettingID SERIAL PRIMARY KEY,
    
    -- Company Info (Société)
    CompanyName VARCHAR(100) DEFAULT 'ALLAOUA CERAM',
    Activity VARCHAR(100) DEFAULT 'MATERIAUX DE CONSTRUCTION',
    Address TEXT DEFAULT 'ZONE D''ACTIVITE -OEB-',
    Phone1 VARCHAR(20) DEFAULT '0660468894',
    Phone2 VARCHAR(20) DEFAULT '0772611126',
    Email VARCHAR(100),
    RC VARCHAR(50) DEFAULT '04/00-0406435822',
    NIF VARCHAR(50) DEFAULT '002204040643550',
    AI VARCHAR(50) DEFAULT '04010492431',
    NIS VARCHAR(50) DEFAULT '0024040406435',
    RIB VARCHAR(50),
    Capital VARCHAR(50),
    
    -- Printing Settings (Impression)
    DefaultPrintFormat VARCHAR(20) DEFAULT 'TICKET', -- 'A4', 'TICKET'
    TicketWidth VARCHAR(10) DEFAULT '80mm', -- '80mm', '58mm'
    TicketHeader TEXT DEFAULT 'Bienvenue chez ALLAOUA CERAM',
    TicketFooter TEXT DEFAULT 'Merci pour votre confiance!',
    ShowBalanceOnTicket BOOLEAN DEFAULT TRUE,
    
    -- General Settings (Paramétrage)
    EnablePalletManagement BOOLEAN DEFAULT TRUE,
    UpdatePurchasePrice BOOLEAN DEFAULT TRUE,
    BarcodePrefix VARCHAR(10) DEFAULT '20',
    DefaultTaxRate DECIMAL(5,2) DEFAULT 19.00,
    DefaultTimbre DECIMAL(10,2) DEFAULT 0.00,
    
    -- Metadata
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedBy INT REFERENCES Users(UserID)
);

-- 2. Initialize Default Settings (Only if table is empty)
INSERT INTO AppSettings (CompanyName, Activity, DefaultPrintFormat) 
SELECT 'ALLAOUA CERAM', 'MATERIAUX DE CONSTRUCTION', 'TICKET'
WHERE NOT EXISTS (SELECT 1 FROM AppSettings);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_appsettings_id ON AppSettings(SettingID);

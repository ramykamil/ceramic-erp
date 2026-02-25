; ============================================================
; Ceramic ERP - Inno Setup Installer Script
; ============================================================
; This creates a professional Windows installer (.exe)
; 
; Prerequisites:
;   1. Install Inno Setup: https://jrsoftware.org/isinfo.php
;   2. Install Node.js LTS on the build machine
;   3. Run 'npm install' in both backend and frontend
;   4. Run 'npm run build' in frontend
;   5. Compile this script with Inno Setup Compiler
;
; ============================================================

#define MyAppName "Ceramic ERP"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Ceramic ERP"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "START-ERP.bat"

[Setup]
; Application info
AppId={{A1B2C3D4-E5F6-4789-ABCD-EF0123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Installation settings
DefaultDirName=C:\CeramicERP
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.\Output
OutputBaseFilename=CeramicERP-Setup-{#MyAppVersion}
SetupIconFile=..\assets\icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Privileges
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

; Languages
[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
french.WelcomeLabel1=Bienvenue dans l'assistant d'installation de Ceramic ERP
french.WelcomeLabel2=Ce programme va installer Ceramic ERP sur votre ordinateur.%n%nCe système de gestion vous permettra de gérer votre inventaire, vos ventes et vos clients.
english.WelcomeLabel1=Welcome to the Ceramic ERP Setup Wizard
english.WelcomeLabel2=This will install Ceramic ERP on your computer.%n%nThis management system will allow you to manage your inventory, sales and customers.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checked
Name: "autostart"; Description: "Démarrer automatiquement avec Windows"; GroupDescription: "Options:"; Flags: unchecked

[Files]
; Backend
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs; Excludes: "node_modules,.env"
Source: "..\..\backend\node_modules\*"; DestDir: "{app}\backend\node_modules"; Flags: ignoreversion recursesubdirs

; Frontend (built)
Source: "..\..\frontend\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs; Excludes: "node_modules,.next"
Source: "..\..\frontend\node_modules\*"; DestDir: "{app}\frontend\node_modules"; Flags: ignoreversion recursesubdirs
Source: "..\..\frontend\.next\*"; DestDir: "{app}\frontend\.next"; Flags: ignoreversion recursesubdirs

; Scripts
Source: "..\scripts\START-ERP.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\STOP-ERP.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\install-service.js"; DestDir: "{app}\scripts"; Flags: ignoreversion

; Config
Source: "..\config\.env.production"; DestDir: "{app}\backend"; DestName: ".env"; Flags: ignoreversion

; Assets
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Desktop shortcut
Name: "{autodesktop}\Ceramic ERP"; Filename: "{app}\START-ERP.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Tasks: desktopicon

; Start Menu shortcuts
Name: "{group}\Ceramic ERP"; Filename: "{app}\START-ERP.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\Arrêter Ceramic ERP"; Filename: "{app}\STOP-ERP.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Startup (optional)
Name: "{userstartup}\Ceramic ERP"; Filename: "{app}\START-ERP.bat"; WorkingDir: "{app}"; Tasks: autostart

[Run]
; Run after installation
Filename: "{app}\START-ERP.bat"; Description: "Démarrer Ceramic ERP maintenant"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; Stop services before uninstall
Filename: "{app}\STOP-ERP.bat"; Flags: runhidden waituntilterminated

[Code]
// Check for Node.js installation
function IsNodeInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd', '/c node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := Result and (ResultCode = 0);
end;

// Check prerequisites
function InitializeSetup(): Boolean;
begin
  Result := True;
  
  // Check for Node.js
  if not IsNodeInstalled() then
  begin
    if MsgBox('Node.js n''est pas installé sur cet ordinateur.' + #13#10 + #13#10 +
              'Node.js est requis pour exécuter Ceramic ERP.' + #13#10 + #13#10 +
              'Voulez-vous ouvrir la page de téléchargement de Node.js?',
              mbError, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://nodejs.org/', '', '', SW_SHOW, ewNoWait, ResultCode);
    end;
    Result := False;
  end;
end;

// Show completion message
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox('Ceramic ERP a été installé avec succès!' + #13#10 + #13#10 +
           'Un raccourci a été créé sur votre bureau.' + #13#10 + #13#10 +
           'Double-cliquez sur "Ceramic ERP" pour démarrer l''application.',
           mbInformation, MB_OK);
  end;
end;

var
  ResultCode: Integer;

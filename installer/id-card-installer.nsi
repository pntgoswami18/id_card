; ID Card App — Windows installer (NSIS, Modern UI 2)
;
; id_card has no backend of its own (all state lives in the browser's
; IndexedDB), so unlike a typical "bundle Node.js as a Windows Service"
; installer this one is deliberately simpler:
;   - no Windows Service, no auto-start, no firewall rules — the app only
;     ever listens on 127.0.0.1, started on demand from a shortcut
;   - installs per-user to $LOCALAPPDATA, so no admin elevation is required
;   - ships one Node.js runtime per architecture (see scripts/download-node-runtimes.js)
;     purely to run scripts/static-server.js, a zero-dependency static file
;     server for the production build — no node_modules are bundled at all
;
; ${ARCH} below is substituted with the literal text "x64" or "x86" by
; scripts/build-installer.js *before* makensis ever sees this file, so the
; !if/!else blocks are a compile-time choice, not a runtime one: an
; x86 build never has the x64 runtime compiled in, and vice versa.

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"

Name "ID Card App"
OutFile "ID-Card-App-Setup-${ARCH}.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\id-card-app"
InstallDirRegKey HKCU "Software\IDCardApp" "Install_Dir"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuFolder
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\node.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS '"$INSTDIR\scripts\static-server.js"'
!define MUI_FINISHPAGE_RUN_TEXT "Launch ID Card App now"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Var StartMenuFolder

Function .onInit
  !if "${ARCH}" == "x64"
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "This is the 64-bit installer, but Windows here is 32-bit. Use the x86 installer instead."
    Abort
  ${EndIf}
  !endif

  ReadRegStr $0 HKCU "Software\IDCardApp" "Install_Dir"
  ${If} $0 != ""
    MessageBox MB_YESNO "ID Card App is already installed. Reinstall / update?" IDYES ContinueInstall IDNO AbortInstall
    ContinueInstall:
      Goto EndInit
    AbortInstall:
      Abort
  ${EndIf}
  EndInit:
FunctionEnd

Section "ID Card App" SecCore
  SectionIn RO
  SetOutPath "$INSTDIR"

  File /r "..\dist\*"
  File /r "scripts"

  !if "${ARCH}" == "x64"
  SetOutPath "$INSTDIR"
  File "..\vendor\node-win-x64\node.exe"
  !else
  SetOutPath "$INSTDIR"
  File "..\vendor\node-win-ia32\node.exe"
  !endif

  WriteRegStr HKCU "Software\IDCardApp" "Install_Dir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "DisplayName" "ID Card App"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "DisplayIcon" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp" "NoRepair" 1

  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\ID Card App.lnk" "$INSTDIR\node.exe" '"$INSTDIR\scripts\static-server.js"' "$INSTDIR\node.exe"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  !insertmacro MUI_STARTMENU_WRITE_END

  CreateShortcut "$DESKTOP\ID Card App.lnk" "$INSTDIR\node.exe" '"$INSTDIR\scripts\static-server.js"' "$INSTDIR\node.exe"
SectionEnd

Section "Uninstall"
  !insertmacro MUI_STARTMENU_GETFOLDER Application $StartMenuFolder
  Delete "$SMPROGRAMS\$StartMenuFolder\ID Card App.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk"
  RMDir "$SMPROGRAMS\$StartMenuFolder"
  Delete "$DESKTOP\ID Card App.lnk"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IDCardApp"
  DeleteRegKey HKCU "Software\IDCardApp"
SectionEnd

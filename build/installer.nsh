; Keep electron-builder's installation and updater logic; customize presentation only.
!define MUI_BGCOLOR F4F8FC
!define MUI_TEXTCOLOR 08172C
!define MUI_INSTFILESPAGE_COLORS "08172C F4F8FC"
!define MUI_WELCOMEPAGE_TITLE "Welcome to your local harbor."
!define MUI_WELCOMEPAGE_TEXT "CodeHarborX brings your projects, local AI and private tools together.$\r$\n$\r$\nBuild. Create. Keep control.$\r$\n$\r$\nUpdating an existing installation keeps your projects, settings and encrypted tunnel credential."
!define MUI_FINISHPAGE_TITLE "Your harbor is ready."
!define MUI_FINISHPAGE_TEXT "CodeHarborX is installed and ready to open.$\r$\n$\r$\nYour projects and settings stay on this computer. Future updates are available inside CodeHarborX."
!macro customHeader
  SetFont "Segoe UI" 10
!macroend
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Close the running app before install/uninstall and clean up autostart + ask about user data.
!macro customInit
  nsExec::Exec 'taskkill /F /IM "Windows Customization Hub.exe"'
!macroend
!macro customUnInstall
  nsExec::Exec 'taskkill /F /IM "Windows Customization Hub.exe"'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.windowscustomizationhub.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Windows Customization Hub"
  MessageBox MB_YESNO|MB_ICONQUESTION "Удалить также настройки, профили и расширения Windows Customization Hub?$\n$\nЕсли вы планируете переустановку, выберите «Нет»." IDNO keepdata
    RMDir /r "$APPDATA\Windows Customization Hub"
    RMDir /r "$APPDATA\windows-customization-hub"
  keepdata:
!macroend

@echo off
powershell.exe -NoProfile -Command "[Console]::Out.Write($env:PROXYOS_SSH_PASSWORD)"

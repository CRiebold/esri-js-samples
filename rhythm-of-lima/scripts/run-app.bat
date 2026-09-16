@echo off
setlocal

rem This script lives in scripts\, so go up one level to the repo root.
cd /d "%~dp0.."

echo Atualizando o codigo (git pull)...
git pull
if errorlevel 1 (
    echo.
    echo Aviso: "git pull" falhou. Confira a mensagem acima.
    echo O app vai iniciar mesmo assim, com o codigo que ja esta neste computador.
    echo.
)

echo Iniciando o servidor de desenvolvimento (npm run dev)...
start "El Ritmo de Lima - servidor" cmd /k "npm run dev"

echo Aguardando o servidor subir...
timeout /t 4 /nobreak >nul

start chrome "http://localhost:5173/"

endlocal

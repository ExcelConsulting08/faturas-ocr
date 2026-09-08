@echo off
chcp 65001 >nul
title Gestao de Faturas - servidor local

rem %~dp0 = pasta onde este ficheiro esta, para funcionar seja de onde for lancado
cd /d "%~dp0"

echo.
echo  ===============================================
echo    Gestao de Faturas - a arrancar o servidor
echo  ===============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  ERRO: o Node.js nao foi encontrado.
    echo  Instale a versao LTS em https://nodejs.org e volte a tentar.
    echo.
    pause
    exit /b 1
)

if not exist ".env.local" (
    echo  AVISO: falta o ficheiro .env.local com as chaves de acesso.
    echo  A aplicacao vai abrir na pagina de configuracao.
    echo.
)

echo  Endereco: http://localhost:3000
echo  Para parar o servidor: feche esta janela ou prima Ctrl+C
echo.

rem npm.cmd em vez de npm: evita o bloqueio de scripts PowerShell nao assinados
call npm.cmd run dev

echo.
echo  O servidor terminou.
pause

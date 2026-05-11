@echo off
setlocal EnableExtensions

set "DIR=%~dp0"
set "LOG_FILE=%TEMP%\ClaudefmHost.log"

if "%CLAUDE_BIN%"=="" (
  for %%I in (claude.exe claude.cmd claude.bat claude) do (
    where %%I >nul 2>nul && for /f "delims=" %%P in ('where %%I 2^>nul') do (
      set "CLAUDE_BIN=%%P"
      goto :claude_found
    )
  )
)
:claude_found

if "%PY_BIN%"=="" (
  where python3 >nul 2>nul && for /f "delims=" %%P in ('where python3 2^>nul') do (
    set "PY_BIN=%%P"
    goto :py_found
  )
  where python >nul 2>nul && for /f "delims=" %%P in ('where python 2^>nul') do (
    set "PY_BIN=%%P"
    goto :py_found
  )
)
:py_found

if not "%PY_BIN%"=="" (
  if exist "%DIR%host.py" (
    "%PY_BIN%" "%DIR%host.py" 2>>"%LOG_FILE%"
    exit /b %errorlevel%
  )
)

if "%NODE_BIN%"=="" (
  where node >nul 2>nul && for /f "delims=" %%N in ('where node 2^>nul') do (
    set "NODE_BIN=%%N"
    goto :node_found
  )
)
:node_found

if "%NODE_BIN%"=="" (
  echo ClaudefmHost: node not found. Please install Node.js (>=18) and retry. 1>&2
  exit /b 127
)

"%NODE_BIN%" "%DIR%host.cjs" 2>>"%LOG_FILE%"
exit /b %errorlevel%


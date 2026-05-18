@echo off
:: Self-elevating batch script - moves Claude AppData from C: to D:\Claude
:: and creates a symbolic link so Claude continues to work transparently.

:: --- Auto-elevate to admin ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Demande des droits administrateur...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   Deplacement de Claude AppData vers D:\Claude
echo ============================================================
echo.
echo IMPORTANT : Claude Desktop doit etre completement ferme.
echo Verifie dans le Gestionnaire des taches qu'aucun processus
echo Claude.exe ne tourne, puis appuie sur une touche.
echo.
pause

:: --- Tuer Claude au cas ou ---
echo.
echo Arret des processus Claude eventuellement actifs...
taskkill /F /IM Claude.exe       >nul 2>&1
taskkill /F /IM "Claude Helper.exe" >nul 2>&1

set "SRC=C:\Users\ehrha\AppData\Roaming\Claude"
set "DST=D:\Claude"

:: --- Verifier que la source existe ---
if not exist "%SRC%" (
    echo ERREUR : "%SRC%" est introuvable.
    pause
    exit /b 1
)

:: --- Verifier que la source n'est pas deja un lien symbolique ---
dir "%SRC%" /AL >nul 2>&1
fsutil reparsepoint query "%SRC%" >nul 2>&1
if %errorLevel% equ 0 (
    echo "%SRC%" est deja un lien symbolique. Rien a faire.
    pause
    exit /b 0
)

:: --- Creer le dossier destination ---
if not exist "%DST%" (
    echo Creation de "%DST%"...
    mkdir "%DST%"
)

:: --- Copier avec robocopy (plus fiable que move pour gros volumes) ---
echo.
echo Copie des fichiers de "%SRC%" vers "%DST%" ...
echo (cela peut prendre quelques minutes)
robocopy "%SRC%" "%DST%" /E /COPYALL /R:1 /W:1 /MT:8 /NFL /NDL /NP
set RC=%errorLevel%

:: robocopy : codes < 8 = succes
if %RC% geq 8 (
    echo.
    echo ERREUR robocopy (code %RC%). Abandon, rien n'est supprime.
    pause
    exit /b 1
)

:: --- Supprimer la source ---
echo.
echo Suppression du dossier d'origine "%SRC%"...
rmdir /S /Q "%SRC%"
if exist "%SRC%" (
    echo ERREUR : impossible de supprimer "%SRC%".
    echo Probablement un fichier verrouille - ferme Claude completement et reessaie.
    pause
    exit /b 1
)

:: --- Creer le lien symbolique ---
echo.
echo Creation du lien symbolique "%SRC%" -^> "%DST%"...
mklink /D "%SRC%" "%DST%"
if %errorLevel% neq 0 (
    echo ERREUR : creation du lien symbolique echouee.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Termine ! Tu peux relancer Claude Desktop.
echo   Les donnees sont maintenant sur D:\Claude
echo   et C: pointe vers D: de maniere transparente.
echo ============================================================
echo.
pause

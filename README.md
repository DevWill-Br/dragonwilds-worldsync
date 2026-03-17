# Dragonwilds WorldSync

**Dragonwilds WorldSync** is a desktop utility created to help groups share a local RuneScape: Dragonwilds world more safely through a synchronized folder workflow.

Created by **Will**.

## What it does
- guided first-time setup
- create a shared world folder structure automatically
- join an existing shared world
- host handoff with lock control
- backup creation during transitions
- world status overview
- PT-BR / English interface
- admin-only force unlock

## How it works
The tool uses a **synchronized folder** shared between players.  
That folder can be inside:
- OneDrive
- Dropbox
- Google Drive for desktop
- Syncthing
- or any equivalent synced directory

The app manages:
- `current`
- `backups`
- `lock`
- `logs`
- `world.meta.json`

## Recommended use flow
1. The owner creates the shared world through the wizard.
2. Friends join the existing shared world through the wizard.
3. The current host clicks **Host World** before opening the game.
4. After playing, the host closes the game and clicks **End Host**.
5. The next host waits for sync to finish and then repeats the process.

## Important notes
- only one person should host at a time
- always wait for folder synchronization to finish
- the tool is a **community utility**
- this is **not** an official Jagex product

## Files
Inside `src/`:
- `DragonwildsWorldSync.ps1`
- `Abrir Dragonwilds WorldSync.bat`
- `Open Dragonwilds WorldSync.bat`
- `Compilar EXE.ps1`
- `Compilar EXE.bat`
- `DragonwildsWorldSync.ico`
- `DragonwildsHeaderBanner.png`

## Build the EXE
On Windows:
1. open `src/Compilar EXE.bat`
2. wait for the script to install/update `ps2exe` if needed
3. the app will generate the executable in the same folder

## Credits
**Dragonwilds WorldSync v1.4.2 | Created by Will**
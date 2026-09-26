# WorldSync 2.0: safe core preview

Entry point: `src/WorldSync2.ps1` (Windows PowerShell 5.1 or newer).
The existing graphical launcher is still the v1 local-world workflow. Do not use
it for a Dedicated Server or point it at a v2 store. The new command entry point
deliberately does not import saves, launch/stop a server, or migrate v1 data.

## Read-only inspection and configuration

```powershell
.\src\WorldSync2.ps1 -Action Inspect
.\src\WorldSync2.ps1 -Action Configure -InstallPath 'D:\SteamLibrary\steamapps\common\RuneScape Dragonwilds Dedicated Server'
```

Inspection defaults to the standard Steam installation. Alternate libraries use
an explicit installation path. Configuration records the installation/save path
and heartbeat defaults in `%LOCALAPPDATA%\DragonwildsWorldSync2\server.local.json`.
An existing configuration is never silently overwritten. `-ConfigPath` selects
another local config file. No server INI, password or OwnerId is read or copied.
Fingerprints contain filename, byte length, UTC timestamp and SHA-256.

## Protocol and limits

This is a **single-machine, single-filesystem prototype**, not a distributed lock.
Use an isolated local NTFS store outside OneDrive/Dropbox and outside the server's
save directory. Every client must use this module and the same filesystem authority.
The machine field rejects ordinary use of a replicated store on a different PC,
but is not authentication. Cloud folder copies cannot establish distributed
ownership; a remote coordinator with compare-and-swap/fencing is required before
multi-PC handoff can be enabled safely. Filesystems must support exclusive opens
and atomic same-volume replacement. Unsupported filesystems fail closed.

1. `Initialize` requires a new directory; it never migrates an existing store.
2. `StartSession` takes an OS-exclusive guard, verifies the latest immutable save,
   and creates a UUID session bound to the current revision/hash (zero if empty).
3. `Heartbeat -SessionId <id>` updates that session every 15 seconds until Ctrl+C.
   `Status` reports staleness after 120 seconds. Staleness never grants ownership
   or triggers automatic takeover; a paused heartbeat does not release a session.
4. `Publish -SessionId <id>` requires all Dragonwilds processes stopped, an owned
   session, and an unchanged base revision. It holds a read handle denying writers,
   copies to staging, flushes, checks size/SHA-256, then renames to a unique immutable
   save in `revisions/`. Only an atomic replacement of `latest.json` commits it.
5. The old pointer is backed up; all previous saves remain. After verifying the
   committed revision, the active session is archived. Source saves are never
   opened for writing, moved, or deleted. No automatic backup pruning is provided.

Example commands for **synthetic fixtures only** (choose an unused store path):

```powershell
.\src\WorldSync2.ps1 -Action Initialize -StorePath C:\WorldSyncLab\store
.\src\WorldSync2.ps1 -Action StartSession -StorePath C:\WorldSyncLab\store
# Use the returned sessionId for Heartbeat, Status and Publish.
```

Publication is not a two-file overwrite: readers must resolve `latest.json` and
validate its referenced immutable save before use. An interrupted pointer commit
leaves the old pointer intact and may leave an orphan snapshot. A failure after
pointer commit but before session archival leaves a committed revision and active
session; subsequent publication is blocked by the base revision check. Preserve
all files for explicit recovery. No automatic rollback/unlock is implemented.
OS crash durability beyond file flushing/atomic rename is not guaranteed.

Process detection is conservative by name, not a process lifecycle lock. A server
started externally during publication cannot be prevented by this prototype;
save writes are denied while copying, and full lifecycle integration remains needed.
SHA-256 verifies transfer integrity, not semantic validity of a Dragonwilds save.

## Validation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\Core.Tests.ps1
```

Dependency-free tests create synthetic fixtures under ignored `tests/.scratch/`
and retain them for inspection. They cover path validation, competing processes,
session ownership, heartbeat/stale behavior, source writer exclusion, revision
conflicts, immutable backups, corruption and pointer-commit failure. No real save
is used. Executable packaging and the full two-PC workflow are not validated.

Next work: authority/coordinator selection; dedicated server lifecycle control;
backup-before-import with explicit real-save migration approval; then UI wiring.

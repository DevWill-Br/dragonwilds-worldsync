# Troubleshooting

## The app says the game is open when it is closed
This was fixed in recent versions by tightening process detection.
Use the newest build and regenerate the EXE.

## The shared world does not appear
Check:
- synchronized folder path
- local save folder path
- selected world `.sav`
- whether `world.meta.json` exists

## The next player cannot host yet
Wait for folder sync to complete before the next host starts.

## End Host is blocked
Make sure:
- the game is fully closed
- the same person who created the active lock is the one ending the host

## Force Unlock
Force Unlock should only be used by the admin when a lock was abandoned improperly.
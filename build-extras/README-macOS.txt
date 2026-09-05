Playing on macOS
================

This is the Linux download, and it runs on macOS too. Everything here except
the launcher is plain JavaScript, so a small script fetches the macOS versions
of Electron and the sharp image library for you.

Works on both Apple Silicon and Intel Macs.


What you need
-------------
Node.js 20 or newer, which includes npm. Get the LTS version from
https://nodejs.org


How to play
-----------
1. Unzip this download somewhere permanent, such as your Documents folder.
   Your saves and installed games live inside it.

2. Double-click "start-macos.command" in this folder.

The first run installs Electron and image support, which downloads a few
hundred megabytes and takes a few minutes. Every run after that starts the
game straight away. Your Mac keeps the download, so this is a one-time wait.

Keep the Terminal window open while you play – closing it closes the game.


If double-clicking is blocked
-----------------------------
macOS flags files that came from a download. Two ways around it:

  * Right-click "start-macos.command", choose Open, then confirm with Open
    in the dialog. macOS remembers this and normal double-clicks work after.

  * Or open Terminal, drag "start-macos.command" onto the Terminal window,
    and press Return. This works regardless of the flag.

If macOS says the file is damaged, open Terminal, drag the folder you
unzipped onto the window, and run:

    cd <the path that appeared>
    xattr -dr com.apple.quarantine .


Installing games and mods
-------------------------
Put game or mod .zip archives in the "assets/install" folder, then use the
Install button in the top left of the engine.


Updating
--------
Download the new version, unzip it, and run "start-macos.command" again. The
new folder sets itself up from the copy already on your Mac, so this takes
seconds rather than the wait you had the first time.

Your saves live in macOS Application Support rather than in this folder, so
they carry over on their own. Games and mods you installed yourself live in
"assets/games_files" and "assets/games_assets" – copy those across to keep
them.


Doing it by hand
----------------
The script runs these three commands. Run them yourself if you prefer:

    cd "/path/to/this/folder/resources/app"
    npm install --save-dev electron@__ELECTRON_VERSION__
    npm install sharp
    npx electron .

Tip: type "cd " – with the space – then drag the "app" folder from Finder
onto the Terminal window and press Return.


If something goes wrong
-----------------------
"command not found: npm"
    Node.js is missing, or it was installed through nvm and is invisible to
    the script. Install the LTS version from https://nodejs.org, or run the
    commands under "Doing it by hand" from your own Terminal.

"Cannot find module 'sharp'" or "Cannot find module 'electron'"
    The install ran in the wrong place. Confirm you are in the
    "resources/app" folder – it contains a package.json file.

A blank white window
    Run "npx electron ." from "resources/app", rather than from the folder
    you unzipped.


This build ships Electron __ELECTRON_VERSION__ (engine v__VERSION__). Newer
Electron releases may work, though this is the version it was tested with.

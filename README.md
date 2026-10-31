# Porch Haunt

A Halloween person detector for a spare iPhone and Bluetooth speaker. The Mac serves the app; person detection and audio playback run on the phone. Camera pictures are neither recorded nor sent to the Mac. No accounts or npm dependencies are needed.

## Run

Requires Node.js 18 or later, Python 3, and an HTTPS connection for camera access on a phone.

Run `python3 scripts/download-assets.py` once to download the pinned browser libraries and lightweight COCO-SSD detector from their official sources. These downloads stay local and are excluded from Git. The three original spooky effects are included; regenerate them with `python3 scripts/make-sounds.py`.

1. Run `npm start` on the Mac.
2. In another terminal, run `cloudflared tunnel --config /dev/null --url http://127.0.0.1:8765 --no-autoupdate`. Keep both terminals running. This creates a temporary public HTTPS address for the static app, with no camera/upload endpoint. The address changes when the tunnel restarts. The explicit empty configuration isolates this app from existing Cloudflare routing on the Mac.
3. Open the printed `https://….trycloudflare.com` address in **Safari on the iPhone**. A plain HTTP LAN address cannot request camera access on iPhone.
4. Pair the iPhone with the Bluetooth speaker in Settings. Plug the iPhone into power.
5. Tap **Test sound**, starting with low speaker volume. Then tap **Start camera** and allow access.
6. Use the rear camera to frame a well-lit entrance. The outlined central area is the trigger zone. Adjust minimum person height to exclude distant pedestrians.
7. Set **Delay after detection** from 0 to 10 seconds in half-second steps, then tap **Arm the haunt**. Two consecutive person detections queue one sound after that delay, even if the person moves out of view. The countdown appears below the camera. Disarming, turning the camera off, hiding Safari, or locking the phone cancels a pending sound. Changing the delay applies to the next detection; **Test sound** always plays immediately. Another group requires the area to clear for at least 3 seconds, and the cooldown (starting at actual playback) to expire.

Keep Safari visible. The app requests a screen wake lock where supported. On older iOS, set Settings → Display & Brightness → Auto-Lock → Never; Low Power Mode may need to be disabled. Returning from another app or locking the screen disarms the haunt; tap Arm again. Restore Auto-Lock afterwards.

Custom MP3/WAV clips up to 30 seconds and 20 MB can be selected on the phone. They stay in memory for the current visit and are never uploaded. This public distribution includes three original synthesized sound effects. Random mode includes all loaded clips and avoids immediate repeats. The effect-volume slider scales the app audio; the phone and Bluetooth speaker also have their own volume controls.

On a Mac, `python3 scripts/make-voices.py` optionally generates two character laughs and six Halloween lines for personal, non-commercial use, with pitch and echo effects. “No more treats… just kidding!” includes a dramatic countdown. Pass clip IDs to regenerate individual voices. The script uses installed macOS speech voices. Generated recordings are excluded from Git and are not distributed here because Apple's system voice license restricts public sharing; see [the macOS software license](https://www.apple.com/legal/sla/). Use your own recordings or appropriately licensed audio for public distributions.

The iPhone X/XR’s actual performance, Bluetooth routing, speaker sleep behavior, costume recognition, and evening lighting need a real-device test. Camera access uses no microphone. No Sonos or doorbell integration is required. The temporary HTTPS link uses Cloudflare as transport; all detector files are served with the app, and inference stays in the browser.

## Checks

`npm test` verifies person filtering, arrival confirmation, cooldowns, and group rearming. `node --check dist/app.mjs` checks app syntax. Stop the app and tunnel with Ctrl-C when finished.

## Dependencies

TensorFlow.js 4.22.0 and COCO-SSD 2.2.3, Apache-2.0 licensed, downloaded from the official TensorFlow package distribution. The COCO-SSD lite MobileNet v2 model is downloaded from TensorFlow’s official model storage. See `dist/vendor/` for license files.


## Privacy

Camera inference runs entirely in the browser. The server serves only static app files; it has no video, microphone, or audio-upload endpoint. The microphone is disabled. There are no analytics, accounts, cookies, or persistent visitor records. Custom sound files remain in browser memory until the page closes or refreshes. A tunnel provider receives normal web requests for the app files, but not camera pictures. Share a hosted copy or your own tunnel address; never commit local credentials, tunnel configuration, logs, or personal media.

## License

Original application code and synthesized effects are available under the MIT license. Downloaded third-party libraries and model files retain their own licenses. Apple-generated voice recordings are not part of this public distribution.

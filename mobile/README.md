# PharmaVision AR

Mobile client for the existing clinic API. It does not include a server or a database.

## Setup

From `MedSystem/mobile`:

```bash
npm install
copy .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL` to this computer’s LAN address, for example `http://192.168.1.20:5000`. A phone cannot use `localhost`. Restart Expo after changing it.

Start the existing API from `MedSystem/server`:

```bash
npm run dev
```

Allow inbound TCP on that port in Windows Firewall so the phone can reach it.

## Run in Expo Go

Android Studio is not required.

1. Install Expo Go from the Play Store. This project uses Expo SDK 58, so update Expo Go if it asks.
2. Put the phone and the computer on the same Wi-Fi network.
3. From `MedSystem/mobile`:

```bash
npx expo start
```

4. Scan the QR code with Expo Go.

`npx expo start` opens the project in Expo Go. It does not build a native Android binary.

Expo Go can register a shelf from a photo: place the four corners, name the shelf, and save it through the clinic API. It can also photograph a shelf and upload that scan. Plane detection and world tracking need a development build with ARCore or ARKit. That build is not created by `npx expo start`, and it is not available inside Expo Go. Native AR is not complete until that build has been tried on a phone that supports ARCore or ARKit.

## Automated tests

From `MedSystem/mobile`:

```bash
npm test
```

That runs Jest and React Native Testing Library. The tests cover startup, login and logout, secure token storage, protected navigation, API errors, role gates, inventory, medicine search, camera permission and capture, shelf registration from a photo, detection responses, alerts, and network failure.

From `MedSystem/server`:

```bash
npm test
```

`test/mobileClient.test.js` calls the Express app with the mobile client header. It checks patients, doctors, inventory, medicine search, shelf registration, image upload, a disconnected detection service, alerts, logout, and unauthorized roles. AI stock is not changed.

## Physical Android device

1. Start the API from `MedSystem/server` with `npm run dev`.
2. Set `mobile/.env` to `http://<this-computer-lan-ip>:5000` and restart Expo.
3. Allow inbound TCP 5000 in Windows Firewall. Keep the phone on the same Wi-Fi.
4. From `MedSystem/mobile`, run `npx expo start` and open the project in Expo Go for SDK 58.

Walk through login, logout, the home counts, inventory, medicine search, a shelf photo with four corners, a scan upload, and alerts. Turn off Wi-Fi once to see the network message. Sign in as a doctor and confirm shelf registration and alert closure stay unavailable. Plane detection cannot be checked in Expo Go.

## EAS builds

Icons and the splash screen are already set:

- `assets/images/icon.png`
- `assets/images/android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`
- `assets/images/splash-icon.png` on `#1A3330`
- `assets/images/favicon.png`
- iOS icon: `assets/expo.icon`

The Android package is `com.pharmavision.ar`. The camera permission is declared. Microphone, location, and external storage are blocked. `versionCode` is 1.

Install the Expo build CLI once, from `MedSystem/mobile`:

```bash
npm install --global eas-cli
npx eas-cli login
npx eas-cli init
```

`eas init` writes the Expo project id. Do not commit API secrets.

Create the public API address for each environment. Replace the preview value with this computer’s LAN address, and the production value with the HTTPS API:

```bash
npx eas-cli env:create --name EXPO_PUBLIC_API_URL --value http://192.168.1.20:5000 --environment development --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_API_URL --value http://192.168.1.20:5000 --environment preview --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_API_URL --value https://api.example.com --environment production --visibility plaintext
```

Build:

```bash
npx eas-cli build --platform android --profile development
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

`development` is the build that can be used to try ARCore plane tracking. Install that APK on an ARCore phone before treating native shelf tracking as ready. `preview` is an internal APK for the camera and API flows. `production` is an Android App Bundle.

Submit the production bundle to the Play internal track after a Play Console app exists:

```bash
npx eas-cli submit --platform android --profile production
```

Android Studio is not required for Expo Go or for these cloud builds. It is required only if you compile the native project locally with `npx expo prebuild` and `npx expo run:android`.

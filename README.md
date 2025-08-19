# TaiRecorder - Flic Button Voice Recorder

A React Native/Expo app that connects to a Flic button via Bluetooth for hands-free audio recording. Perfect for capturing voice memos, interviews, or any audio content with simple button presses.

## 🎯 Features

- **Bluetooth LE Connection**: Pairs with Flic smart buttons
- **Background Recording**: Continues recording when phone is locked
- **Smart Button Actions**:
  - Single click: Start recording / Add bookmark
  - Double click: Stop and save recording
  - Hold (1s+): Stop and flag as important
- **Upload Queue**: Automatic file management with retry logic
- **Kill Switch**: Disable button responses when needed
- **Notifications**: Visual feedback for all actions

## 🚀 Quick Start

### Prerequisites
- Node.js and npm/yarn
- Expo CLI (`npm install -g expo-cli`)
- Flic button (any generation)
- iOS device or Android device for testing

### Installation

```bash
# Clone and install dependencies
git clone <your-repo>
cd TaiRecorder
npm install

# Start development server
npm run web          # Web preview (limited BLE support)
npm run ios          # iOS simulator/device
npm run android      # Android simulator/device
```

### First Time Setup

1. **Grant Permissions**: The app will request microphone and Bluetooth permissions
2. **Pair Flic Button**: 
   - Tap "Pair Flic Button" on the home screen
   - Follow the pairing instructions
   - Press and hold your Flic button until it blinks
3. **Test Recording**: Try single/double click to ensure everything works

## 📱 Usage

### Button Actions
- **Single Click**: 
  - If idle: Start recording
  - If recording: Add bookmark at current time
- **Double Click**: Stop recording and save to upload queue
- **Hold (1+ second)**: Stop recording and flag as important

### Manual Controls
- **Kill Switch**: Temporarily disable button responses
- **Manual Start/Stop**: Backup controls via the UI
- **Upload Status**: View and manage upload queue

### Background Operation
The app works when your phone is locked thanks to:
- iOS: Audio background mode keeps recording active
- Android: Foreground service maintains connection
- Auto-reconnect: Flic button reconnects automatically

## 🔧 Technical Architecture

```
services/
├── RecorderService.ts     # Audio recording with expo-av
├── FlicService.ts         # Bluetooth LE management
├── UploadQueue.ts         # File upload with retry logic
└── AppController.ts       # Main coordinator

ui/
├── HomeView.tsx           # Main status and controls
└── PairingView.tsx        # Bluetooth pairing interface
```

### Key Components

- **RecorderService**: Handles audio recording with proper permissions and background support
- **FlicService**: Manages Bluetooth connection, button event parsing, and auto-reconnection
- **UploadQueue**: Queues recordings for upload with exponential backoff retry
- **AppController**: Coordinates all services and manages app state

## 🔒 Permissions

### iOS
- `NSMicrophoneUsageDescription`: Audio recording
- `NSBluetoothAlwaysUsageDescription`: Flic button connection
- `UIBackgroundModes`: ["audio", "bluetooth-central"]

### Android
- `RECORD_AUDIO`: Microphone access
- `BLUETOOTH_*`: Bluetooth Low Energy
- `ACCESS_*_LOCATION`: Required for BLE scanning
- `FOREGROUND_SERVICE`: Background operation

## 📋 Testing Checklist

### Basic Functionality
- [ ] App launches without crashes
- [ ] Permissions requested and granted
- [ ] UI shows correct status indicators
- [ ] Manual start/stop recording works

### Flic Integration
- [ ] Bluetooth scanning finds Flic button
- [ ] Pairing completes successfully
- [ ] Connection status updates in UI
- [ ] Single click starts recording
- [ ] Double click stops and saves
- [ ] Hold action works (stop + flag)

### Background Operation
- [ ] Recording continues when phone is locked
- [ ] Orange mic indicator appears during recording
- [ ] Button presses work from lock screen
- [ ] App reconnects after phone restart

### File Management
- [ ] Recordings save to device storage
- [ ] Upload queue tracks pending files
- [ ] Failed uploads retry automatically
- [ ] Completed uploads can be cleared

## 🚫 Limitations

### Web Preview
- Limited Bluetooth support in browsers
- Use iOS/Android for full functionality

### iOS Restrictions
- Force-killing the app stops background operation
- Users should avoid swiping away the app

### Flic Button Requirements
- Must be paired initially while app is open
- Some older Flic models may use different UUIDs

## 🔧 Configuration

### Upload Endpoint
Edit `services/UploadQueue.ts` to configure your server:

```typescript
const defaultConfig: UploadConfig = {
  endpoint: 'https://your-server.com/api/upload',
  maxRetries: 5,
  retryDelay: 2000,
  cleanupAfterDays: 7,
};
```

### Bundle Identifiers
Update `app.json` with your own bundle IDs:

```json
"ios": {
  "bundleIdentifier": "com.yourcompany.tairecorder"
},
"android": {
  "package": "com.yourcompany.tairecorder"
}
```

## 📱 Building for Production

### iOS (TestFlight)
```bash
# Build for TestFlight
eas build --platform ios --profile preview

# Submit to App Store Connect
eas submit --platform ios
```

### Android (Play Console)
```bash
# Build APK/AAB
eas build --platform android --profile preview

# Submit to Google Play
eas submit --platform android
```

## 🐛 Troubleshooting

### Flic Won't Pair
- Ensure Bluetooth is enabled
- Check app has location permissions (Android)
- Try resetting Flic (hold 7 seconds)
- Move closer to the button

### Recording Issues
- Verify microphone permissions
- Check that audio isn't muted
- Ensure app isn't force-killed
- Test with manual controls first

### Background Problems
- iOS: Don't swipe away the app
- Android: Disable battery optimization
- Check background app refresh settings

## 📄 License

[Add your license here]

## 🤝 Contributing

[Add contributing guidelines here]

---

**Ready to record!** 🎤 Connect your Flic button and start capturing audio with the press of a button.
import { PermissionsAndroid, Platform } from 'react-native';

export enum ClickType {
  SINGLE = 'single',
  DOUBLE = 'double',
  HOLD = 'hold'
}

export interface FlicEvents {
  onSingleClick(): void;
  onDoubleClick(): void;
  onHold(): void;
  onConnectionChange(connected: boolean): void;
}

export class FlicService {
  private bleManager: any = null;
  private device: any = null;
  private delegate: FlicEvents | null = null;
  private isScanning = false;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private lastClickTime = 0;
  private clickTimer: NodeJS.Timeout | null = null;
  private clickCount = 0;
  private holdTimer: NodeJS.Timeout | null = null;

  // Flic button specific UUIDs (actual UUIDs from real device)
  private readonly FLIC_SERVICE_UUID = '00420000-8f59-4420-870d-84f3b617e493'; // Real Flic service
  private readonly FLIC_TX_CHARACTERISTIC = '00420001-8f59-4420-870d-84f3b617e493'; // TX (write)
  private readonly FLIC_RX_CHARACTERISTIC = '00420002-8f59-4420-870d-84f3b617e493'; // RX (notify)
  
  // Additional Flic-specific UUIDs
  private readonly FLIC_BUTTON_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  private readonly GENERIC_ACCESS_SERVICE = '00001800-0000-1000-8000-00805f9b34fb';
  private readonly DEVICE_INFORMATION_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
  
  // Flic button event codes
  private readonly FLIC_BUTTON_DOWN = 0x01;
  private readonly FLIC_BUTTON_UP = 0x02;
  private readonly FLIC_CLICK = 0x03;
  private readonly FLIC_DOUBLE_CLICK = 0x04;
  private readonly FLIC_HOLD = 0x05;

  constructor() {
    try {
      // Dynamically import BLE manager only if available
      const { BleManager } = require('react-native-ble-plx');
      this.bleManager = new BleManager();
      this.setupBleManager();
    } catch (error) {
      console.warn('BleManager initialization failed - Bluetooth not available in Expo Go');
      // Continue without BLE - app will work in UI-only mode
      this.bleManager = null;
    }
  }

  setDelegate(delegate: FlicEvents): void {
    this.delegate = delegate;
  }

  private setupBleManager(): void {
    if (!this.bleManager) return;
    
    this.bleManager.onStateChange((state) => {
      console.log('BLE State:', state);
      if (state === 'PoweredOn') {
        this.startAutoReconnect();
      }
    }, true);
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );
        return allGranted;
      } catch (error) {
        console.error('Permission request failed:', error);
        return false;
      }
    }
    return true;
  }

  async startScanning(): Promise<boolean> {
    if (!this.bleManager) {
      console.warn('BLE Manager not available - running in Expo Go');
      return false;
    }

    const hasPermissions = await this.requestPermissions();
    if (!hasPermissions) {
      console.error('Bluetooth permissions not granted');
      return false;
    }

    if (this.isScanning) {
      return true;
    }

    try {
      this.isScanning = true;
      console.log('Starting BLE scan...');
      
      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          this.isScanning = false;
          return;
        }

        if (device && this.isFlicButton(device)) {
          console.log('Found Flic button:', device.name, device.id);
          this.stopScanning();
          this.connectToDevice(device);
        }
      });

      // Stop scanning after 15 seconds to be less battery intensive
      setTimeout(() => {
        if (this.isScanning) {
          console.log('⏰ Scan timeout reached, stopping scan');
          this.stopScanning();
        }
      }, 15000);

      return true;
    } catch (error) {
      console.error('Failed to start scanning:', error);
      this.isScanning = false;
      return false;
    }
  }

  stopScanning(): void {
    if (this.isScanning && this.bleManager) {
      this.bleManager.stopDeviceScan();
      this.isScanning = false;
      console.log('Stopped BLE scanning');
    }
  }

  private isFlicButton(device: any): boolean {
    const name = device.name?.toLowerCase() || '';
    const localName = device.localName?.toLowerCase() || '';
    
    // ONLY accept devices with "flic" explicitly in the name
    const isFlicName = name.includes('flic') || localName.includes('flic');
    
    // Exclude all non-Flic devices - be very specific
    const isExcluded = name.includes('s22') || 
                       name.includes('samsung') || 
                       name.includes('iphone') || 
                       name.includes('airpods') ||
                       name.includes('watch') ||
                       name.includes('xiao') ||
                       name.includes('voicedsp') ||
                       name.includes('seeed') ||
                       name.includes('esp') ||
                       name.includes('arduino');
    
    console.log('Checking device:', {
      name,
      localName,
      serviceUUIDs: device.serviceUUIDs,
      manufacturerData: device.manufacturerData,
      isFlicName,
      isExcluded,
      rssi: device.rssi
    });
    
    // STRICT: Only devices with "flic" in name AND not excluded
    const isFlic = isFlicName && !isExcluded;
    
    if (isFlic) {
      console.log('🎯 Identified as REAL Flic button:', name || localName || device.id);
    } else {
      console.log('❌ Not a Flic button:', name || localName || device.id);
    }
    
    return isFlic;
  }

  private async connectToDevice(device: any): Promise<void> {
    try {
      console.log('🔄 Connecting to device:', device.name || device.id);
      
      // Set up disconnection handler BEFORE connecting
      device.onDisconnected((error, disconnectedDevice) => {
        console.log('📱 Device disconnected:', disconnectedDevice?.name || disconnectedDevice?.id);
        if (error) {
          console.error('Disconnection error:', error);
        }
        this.device = null;
        this.delegate?.onConnectionChange(false);
        
        // Auto-reconnect after short delay
        setTimeout(() => {
          console.log('🔄 Attempting auto-reconnect...');
          this.startAutoReconnect();
        }, 2000);
      });
      
      // Connect with extended timeout and options
      console.log('🔗 Establishing connection...');
      this.device = await device.connect({
        requestMTU: 247,
        connectionPriority: 'highPerformance', 
        timeout: 15000 // 15 second timeout
      });
      
      console.log('🔍 Discovering services and characteristics...');
      await this.device.discoverAllServicesAndCharacteristics();
      
      console.log('✅ Successfully connected to Flic button:', device.name);
      this.delegate?.onConnectionChange(true);
      
      // Subscribe to button events with delay to ensure stability
      setTimeout(async () => {
        await this.subscribeToButtonEvents();
      }, 1000);
      
    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.device = null;
      this.delegate?.onConnectionChange(false);
      
      // Retry connection after delay
      setTimeout(() => {
        this.startAutoReconnect();
      }, 3000);
    }
  }

  private async subscribeToButtonEvents(): Promise<void> {
    if (!this.device) {
      console.error('❌ Cannot subscribe - no device connected');
      return;
    }

    // Check if device is still connected before proceeding
    if (!this.device.isConnected()) {
      console.error('❌ Cannot subscribe - device is disconnected');
      return;
    }

    try {
      console.log('📡 Discovering all services and characteristics...');
      
      // First, let's see what services and characteristics are actually available
      const services = await this.device.services();
      console.log('🔍 Available services:', services.map(s => ({ uuid: s.uuid, isPrimary: s.isPrimary })));
      
      for (const service of services) {
        try {
          const characteristics = await service.characteristics();
          console.log(`📋 Service ${service.uuid} characteristics:`, 
            characteristics.map(c => ({ uuid: c.uuid, isReadable: c.isReadable, isWritableWithResponse: c.isWritableWithResponse, isNotifiable: c.isNotifiable }))
          );
        } catch (charError) {
          console.warn(`⚠️ Could not get characteristics for service ${service.uuid}:`, charError);
        }
      }
      
      // Try to find the Flic RX characteristic (for receiving notifications)
      let rxCharacteristic = await this.findCharacteristic(
        this.FLIC_SERVICE_UUID, 
        this.FLIC_RX_CHARACTERISTIC
      );

      // If not found, try to find any notifiable characteristic
      if (!rxCharacteristic) {
        console.log('🔍 Flic RX not found, looking for any notifiable characteristic...');
        for (const service of services) {
          try {
            const characteristics = await service.characteristics();
            const notifiableChar = characteristics.find(c => c.isNotifiable);
            if (notifiableChar) {
              console.log('📡 Found notifiable characteristic:', notifiableChar.uuid);
              rxCharacteristic = notifiableChar;
              break;
            }
          } catch (charError) {
            console.warn(`⚠️ Error checking characteristics in service ${service.uuid}:`, charError);
          }
        }
      }

      if (!rxCharacteristic) {
        console.error('❌ No suitable RX/notification characteristic found');
        return;
      }

      console.log('📡 Found Flic RX characteristic, subscribing to notifications...');

      // Subscribe to notifications from the Flic button
      rxCharacteristic.monitor((error, char) => {
        if (error) {
          console.error('❌ Flic button monitor error:', error);
          return;
        }
        
        if (char?.value) {
          console.log('📨 Button event received:', char.value.length, 'bytes');
          this.handleFlicButtonEvent(char.value);
        }
      });

      // Skip initialization command - button works without it and it was causing write failures
      console.log('✅ Successfully subscribed to Flic button events - ready for clicks!');
    } catch (error) {
      console.error('❌ Failed to subscribe to Flic button events:', error);
      // Don't disconnect on subscribe failure - connection might still be useful
    }
  }

  private async initializeFlicButton(): Promise<void> {
    try {
      // Find the TX characteristic for sending commands
      const txCharacteristic = await this.findCharacteristic(
        this.FLIC_SERVICE_UUID, 
        this.FLIC_TX_CHARACTERISTIC
      );

      if (!txCharacteristic) {
        console.log('TX characteristic not found, button may work without initialization');
        return;
      }

      // Send initialization command (this may vary by Flic button model)
      const initCommand = new Uint8Array([0x01, 0x00]); // Basic enable command
      // Convert to base64 without Buffer
      const base64Command = btoa(String.fromCharCode.apply(null, Array.from(initCommand)));
      await txCharacteristic.writeWithResponse(base64Command);
      
      console.log('Sent initialization command to Flic button');
    } catch (error) {
      console.warn('Could not initialize Flic button:', error);
      // Continue anyway - button might work without init
    }
  }

  private async findCharacteristic(serviceUUID: string, characteristicUUID: string): Promise<Characteristic | null> {
    if (!this.device) return null;

    try {
      const services = await this.device.services();
      const service = services.find(s => s.uuid.toLowerCase() === serviceUUID.toLowerCase());
      
      if (!service) return null;

      const characteristics = await service.characteristics();
      return characteristics.find(c => c.uuid.toLowerCase() === characteristicUUID.toLowerCase()) || null;
    } catch {
      return null;
    }
  }

  private handleFlicButtonEvent(data: string): void {
    try {
      // Decode base64 data from Flic button using React Native compatible method
      const binaryString = atob(data); // Use atob instead of Buffer.from
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log('Flic button data received:', Array.from(bytes).map(b => '0x' + b.toString(16)).join(' '));
      
      if (bytes.length === 0) return;
      
      const eventCode = bytes[0];
      
      // Handle different Flic button events
      switch (eventCode) {
        case this.FLIC_CLICK:
          console.log('Flic: Single click detected');
          this.delegate?.onSingleClick();
          break;
          
        case this.FLIC_DOUBLE_CLICK:
          console.log('Flic: Double click detected');
          this.delegate?.onDoubleClick();
          break;
          
        case this.FLIC_HOLD:
          console.log('Flic: Hold detected');
          this.delegate?.onHold();
          break;
          
        case this.FLIC_BUTTON_DOWN:
          console.log('Flic: Button down');
          this.handleButtonDown();
          break;
          
        case this.FLIC_BUTTON_UP:
          console.log('Flic: Button up');
          this.handleButtonUp();
          break;
          
        default:
          // Fallback: try to detect patterns manually
          console.log('Flic: Unknown event code:', eventCode, 'falling back to pattern detection');
          this.handleGenericButtonEvent();
          break;
      }
      
    } catch (error) {
      console.error('Error parsing Flic button data:', error);
      // Fallback to generic button handling
      this.handleGenericButtonEvent();
    }
  }

  private handleButtonDown(): void {
    // Start hold timer when button is pressed
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
    }
    
    this.holdTimer = setTimeout(() => {
      console.log('Flic: Hold timeout triggered');
      this.delegate?.onHold();
    }, 1000); // 1 second hold
  }

  private handleButtonUp(): void {
    // Button released - handle click counting
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    
    const now = Date.now();
    
    // Count clicks for double-click detection
    if (now - this.lastClickTime < 400) { // 400ms window for double click
      this.clickCount++;
    } else {
      this.clickCount = 1;
    }
    
    this.lastClickTime = now;
    
    // Clear previous timer
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
    }
    
    // Wait to see if there's another click
    this.clickTimer = setTimeout(() => {
      if (this.clickCount === 1) {
        console.log('Flic: Single click confirmed');
        this.delegate?.onSingleClick();
      } else if (this.clickCount >= 2) {
        console.log('Flic: Double click confirmed');
        this.delegate?.onDoubleClick();
      }
      this.clickCount = 0;
    }, 250); // 250ms to wait for potential second click
  }

  private handleGenericButtonEvent(): void {
    // Generic fallback for when we can't decode the specific protocol
    console.log('🔘 Flic: Button event detected - triggering single click');
    
    // For now, just trigger single click for every button event
    // This ensures button presses work even if we can't decode the exact protocol
    this.delegate?.onSingleClick();
  }

  private startAutoReconnect(): void {
    if (this.reconnectInterval) return;

    console.log('🔄 Starting auto-reconnect mechanism...');
    this.reconnectInterval = setInterval(() => {
      if (!this.device && !this.isScanning) {
        console.log('🔍 Auto-reconnect: Scanning for Flic button...');
        this.startScanning();
      }
    }, 8000); // Try to reconnect every 8 seconds (less aggressive)
  }

  async disconnect(): Promise<void> {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
      this.device = null;
    }

    this.stopScanning();
    this.delegate?.onConnectionChange(false);
  }

  get isConnected(): boolean {
    return this.device?.isConnected() || false;
  }
}
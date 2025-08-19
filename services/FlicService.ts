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

  // Flic button specific UUIDs (these are the actual Flic UUIDs)
  private readonly FLIC_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic UART Service
  private readonly FLIC_TX_CHARACTERISTIC = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // TX (write)
  private readonly FLIC_RX_CHARACTERISTIC = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // RX (notify)
  
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

      // Stop scanning after 30 seconds
      setTimeout(() => {
        if (this.isScanning) {
          this.stopScanning();
        }
      }, 30000);

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
    
    // More specific Flic button identification
    const isFlicName = name.includes('flic') || localName.includes('flic');
    
    // Check for Nordic UART Service UUID (used by Flic buttons)
    const hasFlicService = device.serviceUUIDs?.some(uuid => 
      uuid.toLowerCase() === this.FLIC_SERVICE_UUID.toLowerCase()
    );
    
    // Exclude common non-Flic devices
    const isExcluded = name.includes('s22') || 
                       name.includes('samsung') || 
                       name.includes('iphone') || 
                       name.includes('airpods') ||
                       name.includes('watch');
    
    console.log('Checking device:', {
      name,
      localName,
      serviceUUIDs: device.serviceUUIDs,
      manufacturerData: device.manufacturerData,
      isFlicName,
      hasFlicService,
      isExcluded,
      rssi: device.rssi
    });
    
    // Only consider it a Flic if:
    // 1. Has "flic" in the name, OR
    // 2. Has the Nordic UART service
    // AND it's not an excluded device
    const isFlic = (isFlicName || hasFlicService) && !isExcluded;
    
    if (isFlic) {
      console.log('🎯 Identified as potential Flic button:', name || localName || device.id);
    } else {
      console.log('❌ Not a Flic button:', name || localName || device.id);
    }
    
    return isFlic;
  }

  private async connectToDevice(device: Device): Promise<void> {
    try {
      console.log('Connecting to device:', device.name);
      this.device = await device.connect();
      await this.device.discoverAllServicesAndCharacteristics();
      
      this.delegate?.onConnectionChange(true);
      console.log('Connected to Flic button');
      
      // Subscribe to button events
      await this.subscribeToButtonEvents();
      
    } catch (error) {
      console.error('Connection failed:', error);
      this.device = null;
      this.delegate?.onConnectionChange(false);
      this.startAutoReconnect();
    }
  }

  private async subscribeToButtonEvents(): Promise<void> {
    if (!this.device) return;

    try {
      console.log('📡 Discovering all services and characteristics...');
      
      // First, let's see what services and characteristics are actually available
      const services = await this.device.services();
      console.log('🔍 Available services:', services.map(s => ({ uuid: s.uuid, isPrimary: s.isPrimary })));
      
      for (const service of services) {
        const characteristics = await service.characteristics();
        console.log(`📋 Service ${service.uuid} characteristics:`, 
          characteristics.map(c => ({ uuid: c.uuid, isReadable: c.isReadable, isWritableWithResponse: c.isWritableWithResponse, isNotifiable: c.isNotifiable }))
        );
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
          const characteristics = await service.characteristics();
          const notifiableChar = characteristics.find(c => c.isNotifiable);
          if (notifiableChar) {
            console.log('📡 Found notifiable characteristic:', notifiableChar.uuid);
            rxCharacteristic = notifiableChar;
            break;
          }
        }
      }

      if (!rxCharacteristic) {
        console.error('❌ No suitable RX/notification characteristic found');
        return;
      }

      console.log('Found Flic RX characteristic, subscribing to notifications...');

      // Subscribe to notifications from the Flic button
      rxCharacteristic.monitor((error, char) => {
        if (error) {
          console.error('Flic button monitor error:', error);
          return;
        }
        
        if (char?.value) {
          this.handleFlicButtonEvent(char.value);
        }
      });

      // Send initialization command to Flic button if needed
      await this.initializeFlicButton();

      console.log('Successfully subscribed to Flic button events');
    } catch (error) {
      console.error('Failed to subscribe to Flic button events:', error);
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
    console.log('Flic: Using generic button event handling');
    this.handleButtonUp(); // Treat as button release
  }

  private startAutoReconnect(): void {
    if (this.reconnectInterval) return;

    this.reconnectInterval = setInterval(() => {
      if (!this.device && !this.isScanning) {
        console.log('Attempting to reconnect...');
        this.startScanning();
      }
    }, 5000); // Try to reconnect every 5 seconds
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
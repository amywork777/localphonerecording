import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
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
  private bleManager: BleManager;
  private device: Device | null = null;
  private delegate: FlicEvents | null = null;
  private isScanning = false;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private lastClickTime = 0;
  private clickTimer: NodeJS.Timeout | null = null;
  private clickCount = 0;
  private holdTimer: NodeJS.Timeout | null = null;

  // Flic button service and characteristic UUIDs
  private readonly FLIC_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
  private readonly FLIC_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
  
  // Alternative UUIDs if above don't work
  private readonly ALT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  private readonly ALT_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  constructor() {
    this.bleManager = new BleManager();
    this.setupBleManager();
  }

  setDelegate(delegate: FlicEvents): void {
    this.delegate = delegate;
  }

  private setupBleManager(): void {
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
    if (this.isScanning) {
      this.bleManager.stopDeviceScan();
      this.isScanning = false;
      console.log('Stopped BLE scanning');
    }
  }

  private isFlicButton(device: Device): boolean {
    const name = device.name?.toLowerCase() || '';
    return name.includes('flic') || 
           name.includes('button') ||
           device.serviceUUIDs?.includes(this.FLIC_SERVICE_UUID) ||
           device.serviceUUIDs?.includes(this.ALT_SERVICE_UUID);
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
      // Try primary service/characteristic
      let characteristic = await this.findCharacteristic(
        this.FLIC_SERVICE_UUID, 
        this.FLIC_CHARACTERISTIC_UUID
      );

      // Try alternative if primary doesn't exist
      if (!characteristic) {
        characteristic = await this.findCharacteristic(
          this.ALT_SERVICE_UUID, 
          this.ALT_CHARACTERISTIC_UUID
        );
      }

      if (!characteristic) {
        console.error('No suitable characteristic found for button events');
        return;
      }

      characteristic.monitor((error, char) => {
        if (error) {
          console.error('Characteristic monitor error:', error);
          return;
        }
        
        if (char?.value) {
          this.handleButtonEvent(char.value);
        }
      });

      console.log('Subscribed to button events');
    } catch (error) {
      console.error('Failed to subscribe to button events:', error);
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

  private handleButtonEvent(data: string): void {
    // This is a simplified button event handler
    // In reality, you'd need to parse the specific data format from your Flic button
    const now = Date.now();
    
    // Clear existing timers
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
    
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    // Button pressed - start hold timer
    this.holdTimer = setTimeout(() => {
      this.delegate?.onHold();
      this.clickCount = 0;
    }, 1000); // 1 second hold

    // Count clicks
    if (now - this.lastClickTime < 500) { // 500ms between clicks for double click
      this.clickCount++;
    } else {
      this.clickCount = 1;
    }
    
    this.lastClickTime = now;

    // Set timer to handle single/double click
    this.clickTimer = setTimeout(() => {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
        this.holdTimer = null;
      }

      if (this.clickCount === 1) {
        this.delegate?.onSingleClick();
      } else if (this.clickCount >= 2) {
        this.delegate?.onDoubleClick();
      }
      
      this.clickCount = 0;
    }, 300); // 300ms to wait for potential second click
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
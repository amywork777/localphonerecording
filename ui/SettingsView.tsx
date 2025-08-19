import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsViewProps {
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const [openaiKey, setOpenaiKey] = useState('');
  const [assemblyaiKey, setAssemblyaiKey] = useState('');
  const [preferredProvider, setPreferredProvider] = useState<'openai' | 'assemblyai'>('openai');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedOpenAI = await AsyncStorage.getItem('openai_api_key');
      const savedAssemblyAI = await AsyncStorage.getItem('assemblyai_api_key');
      const savedProvider = await AsyncStorage.getItem('preferred_provider');

      if (savedOpenAI) setOpenaiKey(savedOpenAI);
      if (savedAssemblyAI) setAssemblyaiKey(savedAssemblyAI);
      if (savedProvider) setPreferredProvider(savedProvider as 'openai' | 'assemblyai');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!openaiKey.trim() && !assemblyaiKey.trim()) {
      Alert.alert('Error', 'Please enter at least one API key');
      return;
    }

    setIsSaving(true);
    try {
      await AsyncStorage.setItem('openai_api_key', openaiKey.trim());
      await AsyncStorage.setItem('assemblyai_api_key', assemblyaiKey.trim());
      await AsyncStorage.setItem('preferred_provider', preferredProvider);
      
      Alert.alert('Success', 'API keys saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API keys');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const clearSettings = () => {
    Alert.alert(
      'Clear API Keys',
      'Are you sure you want to clear all saved API keys?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('openai_api_key');
              await AsyncStorage.removeItem('assemblyai_api_key');
              await AsyncStorage.removeItem('preferred_provider');
              setOpenaiKey('');
              setAssemblyaiKey('');
              setPreferredProvider('openai');
              Alert.alert('Success', 'API keys cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear API keys');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* API Keys Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Keys for Transcription</Text>
        
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>OpenAI API Key</Text>
          <TextInput
            style={styles.textInput}
            value={openaiKey}
            onChangeText={setOpenaiKey}
            placeholder="sk-proj-..."
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.inputHint}>Used for Whisper transcription</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>AssemblyAI API Key</Text>
          <TextInput
            style={styles.textInput}
            value={assemblyaiKey}
            onChangeText={setAssemblyaiKey}
            placeholder="ae50cb8101ab4576..."
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.inputHint}>Used as backup transcription service</Text>
        </View>
      </View>

      {/* Provider Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferred Transcription Service</Text>
        
        <TouchableOpacity 
          style={[
            styles.providerButton,
            preferredProvider === 'openai' && styles.selectedProvider
          ]}
          onPress={() => setPreferredProvider('openai')}
        >
          <Text style={[
            styles.providerText,
            preferredProvider === 'openai' && styles.selectedProviderText
          ]}>
            OpenAI Whisper (Recommended)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.providerButton,
            preferredProvider === 'assemblyai' && styles.selectedProvider
          ]}
          onPress={() => setPreferredProvider('assemblyai')}
        >
          <Text style={[
            styles.providerText,
            preferredProvider === 'assemblyai' && styles.selectedProviderText
          ]}>
            AssemblyAI
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.saveButton]}
          onPress={saveSettings}
          disabled={isSaving}
        >
          <Text style={styles.actionButtonText}>
            {isSaving ? 'Saving...' : '💾 Save Settings'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={clearSettings}
        >
          <Text style={styles.actionButtonText}>🗑️ Clear All Keys</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>How to get API keys:</Text>
        
        <View style={styles.instruction}>
          <Text style={styles.instructionTitle}>OpenAI:</Text>
          <Text style={styles.instructionText}>
            1. Go to platform.openai.com{'\n'}
            2. Sign in and go to API Keys{'\n'}
            3. Create new secret key{'\n'}
            4. Copy the key starting with "sk-proj-"
          </Text>
        </View>

        <View style={styles.instruction}>
          <Text style={styles.instructionTitle}>AssemblyAI:</Text>
          <Text style={styles.instructionText}>
            1. Go to assemblyai.com{'\n'}
            2. Sign up for free account{'\n'}
            3. Go to your dashboard{'\n'}
            4. Copy your API key
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  backButton: {
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    fontFamily: 'monospace',
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  providerButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  selectedProvider: {
    borderColor: '#2196F3',
    backgroundColor: '#e3f2fd',
  },
  providerText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  selectedProviderText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  actionsContainer: {
    marginBottom: 30,
  },
  actionButton: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  clearButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  instructionsContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  instruction: {
    marginBottom: 15,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 5,
  },
  instructionText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});
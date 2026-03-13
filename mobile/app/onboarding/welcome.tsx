import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="wave"
          message={"Hey! I'm Pip \u{1F426}\nYour AI assistant.\nI'll help you automate\nyour whole life."}
        />
        <View style={styles.spacer} />
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/onboarding/phone')}
        >
          <Text style={styles.buttonText}>Let's go →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  spacer: { height: 40 },
  button: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

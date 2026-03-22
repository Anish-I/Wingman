import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, purple, presets } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import { popIn, entrance, gentleFloat } from '@/lib/motion';

export default function WelcomeScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: surface.bg }}>
      <ProgressBar step={1} />
      <View className="flex-1 items-center justify-center px-6">
        {/* Pip avatar with floating animation */}
        <MotiView {...popIn(0, 50)}>
          <MotiView {...gentleFloat(300)}>
            <PipCard expression="wave" size="large" />
          </MotiView>
        </MotiView>

        {/* Welcome card with smooth entrance and micro-delay */}
        <MotiView {...entrance(0, 250)} style={{ width: '100%', gap: 16 }}>
          <View
            style={{
              backgroundColor: surface.card,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: surface.border,
              padding: 24,
              width: '100%',
              marginTop: 24,
            }}
          >
            <Text
              style={{
                color: t.primary,
                fontSize: 24,
                textAlign: 'center',
                fontFamily: 'Sora_700Bold',
                letterSpacing: -0.6,
                marginBottom: 12,
              }}
            >
              {'Meet Pip'}
            </Text>
            <Text
              style={{
                color: t.primary,
                fontSize: 18,
                textAlign: 'center',
                fontFamily: 'Inter_600SemiBold',
                marginBottom: 8,
              }}
            >
              Your personal AI assistant
            </Text>
            <Text
              style={{
                color: t.secondary,
                fontSize: 14,
                textAlign: 'center',
                marginTop: 4,
                fontFamily: 'Inter_400Regular',
                lineHeight: 21,
              }}
            >
              Automate your life through SMS — manage calendars, tasks, music, and more. Just text Pip.
            </Text>
          </View>

          {/* Trust cue card */}
          <View
            style={{
              ...presets.cardSection,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={purple[500]} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: t.primary,
                  fontSize: 13,
                  fontFamily: 'Inter_600SemiBold',
                  marginBottom: 2,
                }}
              >
                Privacy-first
              </Text>
              <Text
                style={{
                  color: t.secondary,
                  fontSize: 12,
                  fontFamily: 'Inter_400Regular',
                  lineHeight: 18,
                }}
              >
                Your data stays encrypted. We never sell or misuse your information.
              </Text>
            </View>
          </View>
        </MotiView>
      </View>

      <View className="px-6 pb-8">
        <GradientButton
          title="Nice to meet you!"
          showArrow
          onPress={() => router.push('/onboarding/features')}
        />
      </View>
    </SafeAreaView>
  );
}

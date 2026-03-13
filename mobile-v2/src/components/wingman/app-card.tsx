import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AppCardProps {
  emoji: string;
  name: string;
  connected: boolean;
  onPress: () => void;
  color?: string;
}

export default function AppCard({ emoji, name, connected, onPress, color }: AppCardProps) {
  return (
    <TouchableOpacity
      className="w-[88px] bg-card rounded-[14px] p-3 items-center relative"
      onPress={onPress}
      activeOpacity={connected ? 1 : 0.7}
    >
      {connected && (
        <View className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#34C759] items-center justify-center z-10">
          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
        </View>
      )}
      <View
        className="w-14 h-14 rounded-full items-center justify-center mb-2"
        style={{ backgroundColor: color ? `${color}20` : '#242540' }}
      >
        <Text className="text-[28px]">{emoji}</Text>
      </View>
      <Text className="text-foreground text-xs font-medium text-center" numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

import React from 'react';
import {
  MaterialCommunityIcons,
  FontAwesome,
  FontAwesome5,
  Ionicons,
} from '@expo/vector-icons';

export type IconFamily =
  | 'MaterialCommunityIcons'
  | 'FontAwesome'
  | 'FontAwesome5'
  | 'Ionicons';

interface AppIconProps {
  iconName: string;
  iconFamily: IconFamily;
  size?: number;
  color: string;
}

const ICON_COMPONENTS = {
  MaterialCommunityIcons,
  FontAwesome,
  FontAwesome5,
  Ionicons,
} as const;

export function AppIcon({ iconName, iconFamily, size = 26, color }: AppIconProps) {
  const IconComponent = ICON_COMPONENTS[iconFamily];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <IconComponent name={iconName as any} size={size} color={color} />;
}

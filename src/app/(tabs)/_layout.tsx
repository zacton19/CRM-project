import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { ColorValue } from 'react-native';

import { colors } from '@/components/theme';

type IconProps = ComponentProps<typeof Ionicons>;
type TabIconProps = { name: IconProps['name']; color: ColorValue | null; size: number };

function TabIcon({ name, color, size }: TabIconProps) {
  // The tab bar always passes a string tint here; ColorValue is just the navigator's wider type.
  return <Ionicons name={name} color={(color ?? undefined) as IconProps['color']} size={size} />;
}

const TABS: { name: string; title: string; icon: IconProps['name'] }[] = [
  { name: 'index', title: 'Schedule', icon: 'calendar-outline' },
  { name: 'follow-ups', title: 'Follow-ups', icon: 'flag-outline' },
  { name: 'clients', title: 'Clients', icon: 'people-outline' },
  { name: 'quotes', title: 'Quotes', icon: 'document-text-outline' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: (props) => <TabIcon name={tab.icon} {...props} />,
          }}
        />
      ))}
    </Tabs>
  );
}

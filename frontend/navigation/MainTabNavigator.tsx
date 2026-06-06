import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StyleSheet } from "react-native";
import DiscoveryScreen from "@/screens/DiscoveryScreen";
import MatchesScreen from "@/screens/MatchesScreen";
import ChatsScreen from "@/screens/ChatsScreen";
import MyProfileScreen from "@/screens/MyProfileScreen";
import { useTheme } from "@/hooks/useTheme";
import { HeaderTitle } from "@/components/HeaderTitle";
import AnimatedTabBar from "@/components/AnimatedTabBar";

export type MainTabParamList = {
  Discovery: undefined;
  Matches: undefined;
  Chats: undefined;
  MyProfile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabIcon: {
  },
});

export default function MainTabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Discovery"
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.backgroundRoot,
        },
        headerTintColor: theme.text,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Discovery"
        component={DiscoveryScreen}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="MyProfile"
        component={MyProfileScreen}
        options={{
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}

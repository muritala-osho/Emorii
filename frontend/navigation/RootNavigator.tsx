import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import WelcomeScreen from "@/screens/WelcomeScreen";
import SignUpScreen from "@/screens/SignUpScreen";
import LoginScreen from "@/screens/LoginScreen";
import ProfileSetupScreen from "@/screens/ProfileSetupScreen";
import SwipeScreen from "@/screens/SwipeScreen";
import ProfileDetailScreen from "@/screens/ProfileDetailScreen";
import ChatDetailScreen from "@/screens/ChatDetailScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import FriendRequestsScreen from "@/screens/FriendRequestsScreen";
import FiltersScreen from "@/screens/FiltersScreen";
import MapViewScreen from "@/screens/MapViewScreen";
import UserDistanceMapScreen from "@/screens/UserDistanceMapScreen";
import ChangeProfilePictureScreen from "@/screens/ChangeProfilePictureScreen";
import ForgotPasswordScreen from "@/screens/ForgotPasswordScreen";
import LoveRadarScreen from "@/screens/LoveRadarScreen";
import VoiceCallScreen from "@/screens/VoiceCallScreen";
import VideoCallScreen from "@/screens/VideoCallScreen";
import StoryUploadScreen from "@/screens/StoryUploadScreen";
import StoryViewerScreen from "@/screens/StoryViewerScreen";
import SuccessStoriesScreen from "@/screens/SuccessStoriesScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import VerificationScreen from "@/screens/VerificationScreen";
import SafetyCenterScreen from "@/screens/SafetyCenterScreen";
import PremiumScreen from "@/screens/PremiumScreen";
import ManageLocationsScreen from "@/screens/ManageLocationsScreen";
import AdminScreen from "@/screens/AdminScreen";
import AppealBannedScreen from "@/screens/AppealBannedScreen";
import AnalyticsScreen from "@/screens/AnalyticsScreen";
import BlockedUsersScreen from "@/screens/BlockedUsersScreen";
import BoostCenterScreen from "@/screens/BoostCenterScreen";
import CompatibilityQuizScreen from "@/screens/CompatibilityQuizScreen";
import ProfilePromptsScreen from "@/screens/ProfilePromptsScreen";
import OTPVerificationScreen from "@/screens/OTPVerificationScreen";
import VisitorsScreen from "@/screens/VisitorsScreen";
import SupportMessagesScreen from "@/screens/SupportMessagesScreen";
import DistanceWeatherScreen from "@/screens/DistanceWeatherScreen";
import ProfileCommentsScreen from "@/screens/ProfileCommentsScreen";
import MatchPopupScreen from "@/screens/MatchPopupScreen";
import CustomizeInterfaceScreen from "@/screens/CustomizeInterfaceScreen";
import SocialMediaScreen from "@/screens/SocialMediaScreen";
import DailyMatchScreen from "@/screens/DailyMatchScreen";
import DeviceManagementScreen from "@/screens/DeviceManagementScreen";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { AppLoadingSkeleton } from "@/components/AppLoadingSkeleton";

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  OTPVerification: { userId: string; email: string };
  ProfileSetup: undefined;
  MainTabs: undefined;
  Swipe: undefined;
  MapView: undefined;
  LoveRadar: undefined;
  UserDistanceMap: { otherUser: any };
  ProfileDetail: { userId: string; isFromLikes?: boolean; likeUserId?: string };
  ChatDetail: { userId: string; userName: string; userPhoto?: string };
  VoiceCall: { userId?: string; userName: string; userPhoto?: string; isIncoming?: boolean; callData?: any; callerId?: string; matchId?: string; callAccepted?: boolean; returnToCall?: boolean };
  VideoCall: { userId?: string; userName: string; userPhoto?: string; isIncoming?: boolean; callData?: any; callerId?: string; matchId?: string };
  EditProfile: undefined;
  Settings: undefined;
  FriendRequests: undefined;
  Filters: undefined;
  ChangeProfilePicture: undefined;
  StoryUpload: undefined;
  StoryViewer: {
    userId: string;
    userName: string;
    userPhoto?: string;
    allUsers?: { id: string; name: string; photo?: string }[];
    initialUserIndex?: number;
    isOwnStory?: boolean;
  };
  Verification: undefined;
  NotificationSettings: undefined;
  SafetyCenter: undefined;
  Premium: undefined;
  SuccessStories: undefined;
  ManageLocations: undefined;
  Admin: undefined;
  Analytics: undefined;
  BlockedUsers: undefined;
  BoostCenter: undefined;
  CompatibilityQuiz: undefined;
  ProfilePrompts: undefined;
  Visitors: undefined;
  SupportMessages: undefined;
  ProfileComments: { userId: string };
  DistanceWeather: { userId: string; userName: string };
  MatchPopup: { 
    currentUser: any; 
    matchedUser: any; 
    isSuperLike?: boolean;
  };
  AppealBanned: { 
    appealToken?: string | null; 
    email: string; 
    banReason?: string; 
    bannedAt?: string;
    appeal?: { status: string; message?: string; lastAppealRejectedAt?: string } | null;
  };
  CustomizeInterface: undefined;
  SocialMedia: undefined;
  DailyMatch: undefined;
  DeviceManagement: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function VerificationPopup({ isProfileComplete }: { isProfileComplete: boolean }) {
  const { user, token } = useAuth();
  const navigation = useNavigation<any>();
  const lastPromptTime = React.useRef<number>(0);

  // Hard rule: a user whose verification is "pending" or "approved" must NEVER
  // be sent to / bounced through the Verification screen by this popup. Any
  // status that isn't a definitive "needs verification" is treated as a no-op
  // to eliminate the flicker where the app would briefly show the normal home
  // screen and then jump back to Verification while user data was reloading.
  const verificationStatus = (user as any)?.verificationStatus;
  const isVerifiedOrPending =
    !!(user as any)?.verified ||
    verificationStatus === 'pending' ||
    verificationStatus === 'approved' ||
    verificationStatus === 'in_review';

  useEffect(() => {
    if (!token) return;
    if (isVerifiedOrPending) return;

    if ((user as any)?.needsVerification) {
      navigation.navigate('Verification');
      return;
    }

    if ((user as any)?.profileIncomplete) {
      navigation.navigate('ProfileSetup');
      return;
    }

    if (user && isProfileComplete) {
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;
      if (now - lastPromptTime.current > fifteenMinutes) {
        lastPromptTime.current = now;
        navigation.navigate('Verification');
      }
    }
  }, [
    (user as any)?.needsVerification,
    (user as any)?.profileIncomplete,
    (user as any)?.verified,
    verificationStatus,
    isVerifiedOrPending,
    token,
    isProfileComplete,
  ]);

  return null;
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading, token, isProfileComplete } = useAuth();

  if (isLoading) {
    return <AppLoadingSkeleton />;
  }

  return (
    <>
      {token && <VerificationPopup isProfileComplete={isProfileComplete} />}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!token ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
            <Stack.Screen name="SuccessStories" component={SuccessStoriesScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="AppealBanned" component={AppealBannedScreen} />
          </>
        ) : !isProfileComplete ? (
          <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="Swipe" component={SwipeScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="MapView" component={MapViewScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="LoveRadar" component={LoveRadarScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="UserDistanceMap" component={UserDistanceMapScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Filters" component={FiltersScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ChangeProfilePicture" component={ChangeProfilePictureScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="VoiceCall" component={VoiceCallScreen} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
            <Stack.Screen name="StoryUpload" component={StoryUploadScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="StoryViewer" component={StoryViewerScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SafetyCenter" component={SafetyCenterScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Premium" component={PremiumScreen} />
            <Stack.Screen name="SuccessStories" component={SuccessStoriesScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ManageLocations" component={ManageLocationsScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Admin" component={AdminScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="BoostCenter" component={BoostCenterScreen} />
            <Stack.Screen name="CompatibilityQuiz" component={CompatibilityQuizScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="ProfilePrompts" component={ProfilePromptsScreen} />
            <Stack.Screen name="Visitors" component={VisitorsScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="SupportMessages" component={SupportMessagesScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="ProfileComments" component={ProfileCommentsScreen} />
            <Stack.Screen name="DistanceWeather" component={DistanceWeatherScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="MatchPopup" component={MatchPopupScreen} options={{ presentation: "fullScreenModal", animation: "fade" }} />
            <Stack.Screen name="AppealBanned" component={AppealBannedScreen} />
            <Stack.Screen name="CustomizeInterface" component={CustomizeInterfaceScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SocialMedia" component={SocialMediaScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DailyMatch" component={DailyMatchScreen} options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="DeviceManagement" component={DeviceManagementScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

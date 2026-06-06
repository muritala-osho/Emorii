import React from 'react';
import { Modal, View, StyleSheet, Pressable, TouchableWithoutFeedback } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface ThemedAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  icon?: keyof typeof Feather.glyphMap;
}

export function ThemedAlert({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onDismiss,
  icon,
}: ThemedAlertProps) {
  const { theme } = useTheme();

  const handleButtonPress = (button: AlertButton) => {
    button.onPress?.();
    onDismiss?.();
  };

  const getButtonStyle = (button: AlertButton) => {
    if (button.style === 'destructive') {
      return { backgroundColor: theme.error };
    }
    if (button.style === 'cancel') {
      return { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border };
    }
    return { backgroundColor: theme.primary };
  };

  const getButtonTextColor = (button: AlertButton) => {
    if (button.style === 'cancel') {
      return theme.text;
    }
    return '#FFF';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.alertContainer, { backgroundColor: theme.surface }]}>
              {icon && (
                <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                  <Feather name={icon} size={32} color={theme.primary} />
                </View>
              )}
              <ThemedText style={[styles.title, { color: theme.text }]}>
                {title}
              </ThemedText>
              {message && (
                <ThemedText style={[styles.message, { color: theme.textSecondary }]}>
                  {message}
                </ThemedText>
              )}
              <View style={styles.buttonsContainer}>
                {buttons.map((button, index) => (
                  <Pressable
                    key={index}
                    style={[styles.button, getButtonStyle(button)]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <ThemedText style={[styles.buttonText, { color: getButtonTextColor(button) }]}>
                      {button.text}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  icon?: keyof typeof Feather.glyphMap;
}

export const useThemedAlert = () => {
  const [alertState, setAlertState] = React.useState<AlertState>({
    visible: false,
    title: '',
  });

  const showAlert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    icon?: keyof typeof Feather.glyphMap
  ) => {
    setAlertState({ visible: true, title, message, buttons, icon });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  const AlertComponent = () => (
    <ThemedAlert
      visible={alertState.visible}
      title={alertState.title}
      message={alertState.message}
      buttons={alertState.buttons}
      onDismiss={hideAlert}
      icon={alertState.icon}
    />
  );

  return { showAlert, hideAlert, AlertComponent };
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h3,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...Typography.body,
    fontWeight: '600',
  },
});

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { messageOf } from '@/api/client';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { deviceApiWarning } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, space } from '@/theme';
import { hasErrors, validateLogin } from '@/validation';

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const configWarning = deviceApiWarning();

  async function submit() {
    const problems = validateLogin(email, password);
    setErrors(problems);
    setFormError('');
    if (hasErrors(problems) || configWarning) return;
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen includeBottomInset>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <AppText variant="heading" tone="inverse">
              Pv
            </AppText>
          </View>
          <AppText variant="display">PharmaVision</AppText>
          <AppText variant="body" tone="soft">
            Sign in with your clinic account. This app uses the same server as the desk.
          </AppText>
        </View>
        <Card>
          {configWarning ? <Banner message={configWarning} tone="info" /> : null}
          <TextField
            label="Email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setErrors((current) => ({ ...current, email: undefined }));
            }}
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="name@clinic.example"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            error={errors.password}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
          />
          {formError ? <Banner message={formError} /> : null}
          <Button label="Sign in" onPress={submit} loading={submitting} disabled={Boolean(configWarning)} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  brand: { gap: space.sm, paddingTop: space.lg },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.rail,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});

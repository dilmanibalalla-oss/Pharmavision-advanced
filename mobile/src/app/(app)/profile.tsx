import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { messageOf } from '@/api/client';
import { roleLabel } from '@/access';
import { authService } from '@/auth/service';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, space } from '@/theme';
import { hasErrors, validateName, validatePasswordChange } from '@/validation';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{ currentPassword?: string; newPassword?: string }>({});
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    authService
      .me()
      .then((next) => {
        if (!active) return;
        setUser(next);
        setName(next.name);
      })
      .catch((error) => {
        if (active) setLoadError(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, [setUser]);

  async function saveName() {
    const problem = validateName(name);
    setNameError(problem);
    setProfileMessage('');
    setProfileError('');
    if (problem) return;
    setSavingName(true);
    try {
      const next = await authService.updateProfile(name);
      setUser(next);
      setName(next.name);
      setProfileMessage('Name saved');
    } catch (error) {
      setProfileError(messageOf(error));
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    const problems = validatePasswordChange(currentPassword, newPassword);
    setPasswordErrors(problems);
    setPasswordMessage('');
    setPasswordError('');
    if (hasErrors(problems)) return;
    setSavingPassword(true);
    try {
      const next = await authService.changePassword(currentPassword, newPassword);
      setUser(next);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Password updated');
    } catch (error) {
      setPasswordError(messageOf(error));
    } finally {
      setSavingPassword(false);
    }
  }

  const initial = (user?.name || 'C').trim().charAt(0).toUpperCase();

  return (
    <Screen>
      <StackHeader title="Profile" />
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <AppText variant="heading" tone="inverse">
            {initial}
          </AppText>
        </View>
        <View style={styles.identityText}>
          <AppText variant="title">{user?.name || 'Profile'}</AppText>
          <AppText variant="body" tone="soft">
            {user?.email}
          </AppText>
          <AppText variant="caption" tone="sage">
            {roleLabel(user?.role)}
            {user && !user.active ? ' · Inactive' : ''}
          </AppText>
        </View>
      </View>

      {loadError ? <Banner message={loadError} /> : null}

      <Card>
        <AppText variant="heading">Name</AppText>
        <TextField
          label="Display name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError('');
            setProfileMessage('');
          }}
          error={nameError}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
        />
        {profileError ? <Banner message={profileError} /> : null}
        {profileMessage ? <Banner message={profileMessage} tone="ok" /> : null}
        <Button label="Save name" onPress={saveName} loading={savingName} />
      </Card>

      <Card>
        <AppText variant="heading">Password</AppText>
        <TextField
          label="Current password"
          value={currentPassword}
          onChangeText={(value) => {
            setCurrentPassword(value);
            setPasswordErrors((current) => ({ ...current, currentPassword: undefined }));
            setPasswordMessage('');
          }}
          error={passwordErrors.currentPassword}
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          autoComplete="password"
        />
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={(value) => {
            setNewPassword(value);
            setPasswordErrors((current) => ({ ...current, newPassword: undefined }));
            setPasswordMessage('');
          }}
          error={passwordErrors.newPassword}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          autoComplete="password"
        />
        {passwordError ? <Banner message={passwordError} /> : null}
        {passwordMessage ? <Banner message={passwordMessage} tone="ok" /> : null}
        <Button label="Update password" onPress={savePassword} loading={savingPassword} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  identityText: { flex: 1, gap: 2 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.rail,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

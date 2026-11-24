import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { can } from '@/access';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { AppText } from '@/components/AppText';
import { formatWhen, labelize } from '@/format';
import { useAuthStore } from '@/store/authStore';
import type { AlertDetail, ClinicUser } from '@/types';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAuthStore((state) => state.user?.role);
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    operationsApi.alert(id).then(setAlert).catch((err) => setError(messageOf(err)));
    if (can(role, 'users')) {
      operationsApi.users().then(setUsers).catch(() => setUsers([]));
    }
  }, [id, role]);

  async function run(action: () => Promise<AlertDetail>) {
    setSaving(true);
    setError('');
    try {
      setAlert(await action());
      setNote('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const investigators = users.filter((user) => user.active && (user.role === 'ADMIN' || user.role === 'SECURITY_OFFICER'));

  return (
    <Screen>
      <StackHeader title={alert?.alertCode || 'Alert'} subtitle="A quantity difference is a review item. It is not evidence that a person took stock." />
      {error ? <Banner message={error} /> : null}
      {!alert && !error ? <LoadingState label="Loading alert" /> : null}
      {alert ? (
        <>
          {alert.statement ? <Banner tone="info" message={alert.statement} /> : null}
          <Card>
            <AppText variant="label">{labelize(alert.kind)}</AppText>
            <AppText variant="body">{alert.medicineName || 'Medicine'}</AppText>
            <AppText variant="caption" tone="soft">
              {alert.shelfName} {alert.section ? `· ${alert.section}` : ''} · {labelize(alert.status)}
            </AppText>
            <AppText variant="body">Expected {alert.expectedQuantity}</AppText>
            <AppText variant="body">Observed {alert.observedQuantity}</AppText>
            <AppText variant="body">Difference {alert.difference}</AppText>
            <AppText variant="caption" tone="soft">
              Detected {formatWhen(alert.detectedAt)}
              {alert.investigatorName ? ` · ${alert.investigatorName}` : ''}
            </AppText>
            <AppText variant="caption" tone="soft">
              Related stock movements on record: {alert.movements?.length || 0}
            </AppText>
          </Card>
          <Card>
            <AppText variant="heading">Notes</AppText>
            {alert.notes.length === 0 ? <AppText variant="body" tone="soft">No notes yet</AppText> : null}
            {alert.notes.map((item, index) => (
              <AppText key={`${item.at}-${index}`} variant="body">
                {item.name ? `${item.name}: ` : ''}
                {item.text}
              </AppText>
            ))}
            {can(role, 'alertWrite') ? (
              <>
                <TextField label="Investigation note" value={note} onChangeText={setNote} />
                <Button
                  label="Add note"
                  tone="secondary"
                  loading={saving}
                  onPress={() => run(() => operationsApi.addAlertNote(alert._id, note.trim()))}
                />
              </>
            ) : null}
          </Card>
          {can(role, 'alertWrite') ? (
            <Card>
              <AppText variant="heading">Investigation</AppText>
              {investigators.map((person) => (
                <Button
                  key={person._id}
                  label={`Assign ${person.name}`}
                  tone="secondary"
                  onPress={() => run(() => operationsApi.updateAlert(alert._id, { status: 'UNDER_REVIEW', investigator: person._id }))}
                />
              ))}
              <TextField label="Resolution" value={resolution} onChangeText={setResolution} />
              <Button
                label="Mark resolved"
                loading={saving}
                onPress={() => run(() => operationsApi.updateAlert(alert._id, { status: 'RESOLVED', resolution: resolution.trim() }))}
              />
              <Button
                label="Dismiss"
                tone="secondary"
                loading={saving}
                onPress={() => run(() => operationsApi.updateAlert(alert._id, { status: 'DISMISSED', resolution: resolution.trim() }))}
              />
            </Card>
          ) : (
            <AppText variant="caption" tone="soft">
              Status changes are limited to administrators and security officers.
            </AppText>
          )}
          {alert.resolution ? <AppText variant="body">Resolution: {alert.resolution}</AppText> : null}
        </>
      ) : null}
    </Screen>
  );
}

import { useState } from 'react';
import { operationsApi } from '@/api/operations';
import { messageOf } from '@/api/client';
import { can } from '@/access';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { StackHeader } from '@/components/StackHeader';
import { TextField } from '@/components/TextField';
import { AppText } from '@/components/AppText';
import { useAuthStore } from '@/store/authStore';
import type { MedicineRecord } from '@/types';

export default function MedicineSearchScreen() {
  const role = useAuthStore((state) => state.user?.role);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<MedicineRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setError('Enter at least two characters');
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      setRows(await operationsApi.medicines(q));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  if (!can(role, 'medicines')) {
    return (
      <Screen>
        <StackHeader title="Medicines" />
        <EmptyState title="Catalog is not available" body="Your role cannot read the medicine catalog." />
      </Screen>
    );
  }

  return (
    <Screen>
      <StackHeader title="Medicines" subtitle="Search the clinic catalog. Results come from the server." />
      <TextField label="Name, code, or strength" value={query} onChangeText={setQuery} autoCapitalize="none" />
      <Button label="Search" onPress={search} loading={loading} />
      {error ? <Banner message={error} /> : null}
      {loading ? <LoadingState label="Searching the catalog" /> : null}
      {searched && !loading && rows.length === 0 ? <EmptyState title="No matches" body="Try another name or medicine code." /> : null}
      {rows.map((medicine) => (
        <Card key={medicine._id}>
          <AppText variant="label">{medicine.name}</AppText>
          <AppText variant="caption" tone="soft">
            {[medicine.medicineCode, medicine.strength, medicine.form].filter(Boolean).join(' · ')}
            {medicine.active ? '' : ' · inactive'}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

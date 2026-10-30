import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/accounts`);
      setAccounts(await r.json());
      setError(null);
    } catch (e) {
      setError(`Cannot reach API at ${API_URL}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>PulseBank</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.muted}>No accounts yet</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.owner}>{item.owner}</Text>
            <Text style={styles.balance}>${item.balance.toFixed(2)}</Text>
          </View>
        )}
      />
      <Pressable style={styles.button} onPress={load}>
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', paddingTop: 64, paddingHorizontal: 20 },
  brand: { color: '#fff', fontSize: 32, fontWeight: '700', marginBottom: 16 },
  card: { backgroundColor: '#17223b', borderRadius: 12, padding: 16, marginBottom: 12 },
  owner: { color: '#9fb3d9', fontSize: 14 },
  balance: { color: '#fff', fontSize: 24, fontWeight: '600', marginTop: 4 },
  muted: { color: '#9fb3d9' },
  error: { color: '#ff7b7b', marginBottom: 12 },
  button: { backgroundColor: '#4f7cff', borderRadius: 10, padding: 14, alignItems: 'center', marginVertical: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
});

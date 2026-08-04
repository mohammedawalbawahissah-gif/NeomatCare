import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patientsApi, getErrorMessage } from '../../api/client';
import { Input, Spinner, EmptyState, ErrorBanner } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

// health_worker (primary delivery channel) + superadmin (cross-facility
// coverage view). facility_admin/specialist/driver excluded per the
// household/nutrition tab scoping decision.
export default function NutritionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [children, setChildren] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const params = { patient_type: 'child' };
      if (q) params.q = q;
      const { data } = await patientsApi.list(params);
      setChildren(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(search); }, []));

  const renderItem = ({ item: c }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('ChildGrowth', { id: c.id, patientName: c.patient_name })}
    >
      <View style={styles.cardIcon}>
        <Ionicons name="body-outline" size={20} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName} numberOfLines={1}>{c.patient_name}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          Age {c.age} · {c.household_name || 'No household'} · {c.town || 'Unknown town'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: Spacing[2] }}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Nutrition</Text>
          <Text style={styles.headerSubtitle}>Growth tracking for children under five</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Input
          value={search} onChangeText={setSearch}
          placeholder="Search children by name or hospital ID…"
          icon="search-outline" returnKeyType="search"
          onSubmitEditing={() => load(search)}
        />
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner fullScreen />
      ) : children.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title="No child records found"
          message="Register a child patient (patient type: Child) to start tracking growth and nutrition guidance."
        />
      ) : (
        <FlatList
          data={children}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2],
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  searchRow: { paddingHorizontal: Spacing[4] },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
});

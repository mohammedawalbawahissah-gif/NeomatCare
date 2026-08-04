import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { householdsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner, EmptyState, ErrorBanner, Badge } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' };
const FOOD_LABELS = { secure: 'Food secure', at_risk: 'At risk', insecure: 'Food insecure', unknown: 'Unknown' };
const FOOD_VARIANT = { secure: 'success', at_risk: 'warning', insecure: 'danger', unknown: 'default' };

export default function HouseholdsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canCreate = isHealthWorker || isFacilityAdmin || isSuperadmin;

  const [households, setHouseholds] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const { data } = await householdsApi.list();
      setHouseholds(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  const renderItem = ({ item: h }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('HouseholdDetail', { id: h.id })}
    >
      <View style={styles.cardIcon}>
        <Ionicons name="home-outline" size={22} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardName} numberOfLines={1}>{h.head_name || 'Unnamed household'}</Text>
          <Badge label={`${h.aggregate_risk_level} risk`} variant={RISK_VARIANT[h.aggregate_risk_level] || 'default'} />
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {h.town || 'Unknown town'} · {h.facility_name || 'No facility'}
        </Text>
        <Badge label={FOOD_LABELS[h.food_security_flag] || 'Unknown'} variant={FOOD_VARIANT[h.food_security_flag] || 'default'} style={{ marginTop: 6, alignSelf: 'flex-start' }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Ionicons name="people-outline" size={16} color={Colors.gray400} />
        <Text style={styles.memberCount}>{h.member_count}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: Spacing[2] }}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Households</Text>
            <Text style={styles.headerSubtitle}>Ranked by highest member risk</Text>
          </View>
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('HouseholdCreate')}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner fullScreen />
      ) : households.length === 0 ? (
        <EmptyState
          icon="home-outline"
          title="No households found"
          message="Households group patients registered at the same compound, so you can prioritise a whole family in one pass."
          action={canCreate ? { label: 'New Household', onPress: () => navigation.navigate('HouseholdCreate') } : null}
        />
      ) : (
        <FlatList
          data={households}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2],
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, maxWidth: 150 },
  cardMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  memberCount: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary, marginTop: 2 },
});

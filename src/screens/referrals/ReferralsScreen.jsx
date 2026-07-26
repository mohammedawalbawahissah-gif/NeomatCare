import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { referralsApi, getErrorMessage } from '../../api/client';
import { Spinner, EmptyState, ErrorBanner, Badge } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const STATUS_VARIANT = {
  DRAFT: 'default', PENDING: 'warning', ACCEPTED: 'info', IN_TRANSIT: 'info',
  RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'danger', FAILED: 'danger',
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ReferralsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const { data } = await referralsApi.list();
      setReferrals(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item: r }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate('ReferralDetail', { id: r.id })}>
      <View style={styles.cardIcon}>
        <Ionicons name="swap-horizontal" size={18} color={Colors.infoDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.routeText} numberOfLines={1}>{r.referring_facility_name} → {r.receiving_facility_name}</Text>
        <Text style={styles.metaText}>{timeAgo(r.created_at)} · {r.created_by_name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Badge label={r.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[r.status] || 'default'} />
        <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <Text style={styles.headerTitle}>Referrals</Text>
        <Text style={styles.headerSub}>{referrals.length} referral{referrals.length !== 1 ? 's' : ''}</Text>
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner fullScreen />
      ) : referrals.length === 0 ? (
        <EmptyState icon="swap-horizontal-outline" title="No referrals yet" message="Referrals are created from an emergency case" />
      ) : (
        <FlatList
          data={referrals}
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
  header: { paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm,
  },
  cardIcon: {
    width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.infoLight,
    alignItems: 'center', justifyContent: 'center',
  },
  routeText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  metaText: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
});

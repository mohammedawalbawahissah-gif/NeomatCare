/**
 * screens/shared/MenuScreen.jsx
 * ------------------------------
 * Generic grid-of-cards "More" menu. Every role's tab bar now only shows
 * Menu / Home / Profile — everything that used to be its own tab button
 * (Cases, Patients, Referrals, Consultations, Transport, Facility, Users,
 * Facilities, Dispatches) is a card here instead, navigating to the exact
 * same nested stack screen as before. No functionality removed, just
 * moved one tap deeper so the tab bar stops overflowing on small screens.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

export default function MenuScreen({ items = [], title = 'Menu', subtitle }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.card}
            activeOpacity={0.7}
            onPress={item.onPress}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.color || Colors.primaryLight }]}>
              <Ionicons name={item.icon} size={24} color={item.iconColor || Colors.primaryDark} />
            </View>
            <Text style={styles.cardLabel}>{item.label}</Text>
            {!!item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[3] },
  title: { fontSize: Typography['2xl'], fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing[3],
    paddingBottom: Spacing[10],
    gap: Spacing[3],
  },
  card: {
    width: '46%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  cardLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardDescription: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },
});

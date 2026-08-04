import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal as RNModal,
  ActivityIndicator, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON
// variants: primary | secondary | danger | ghost | outline
// sizes: sm | md | lg
// ─────────────────────────────────────────────────────────────────────────────
export const Button = ({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, icon, iconPosition = 'left',
  style, textStyle, fullWidth = false,
}) => {
  const s = btnVariants[variant] || btnVariants.primary;
  const sz = btnSizes[size] || btnSizes.md;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.btnBase, s.container, sz.container,
        fullWidth && { width: '100%' },
        isDisabled && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={s.textColor} size="small" />
      ) : (
        <View style={styles.btnInner}>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={sz.iconSize} color={s.textColor} style={{ marginRight: 6 }} />
          )}
          <Text style={[styles.btnText, s.text, sz.text, textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={sz.iconSize} color={s.textColor} style={{ marginLeft: 6 }} />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const btnVariants = {
  primary:   { container: { backgroundColor: Colors.primary },       text: { color: Colors.white },         textColor: Colors.white },
  secondary: { container: { backgroundColor: Colors.secondary },     text: { color: Colors.white },         textColor: Colors.white },
  danger:    { container: { backgroundColor: Colors.danger },        text: { color: Colors.white },         textColor: Colors.white },
  success:   { container: { backgroundColor: Colors.success },       text: { color: Colors.white },         textColor: Colors.white },
  outline:   { container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary }, text: { color: Colors.primary }, textColor: Colors.primary },
  ghost:     { container: { backgroundColor: 'transparent' },        text: { color: Colors.primary },       textColor: Colors.primary },
  white:     { container: { backgroundColor: Colors.white },         text: { color: Colors.primary },       textColor: Colors.primary },
};

const btnSizes = {
  sm: { container: { paddingHorizontal: 12, paddingVertical: 7,  borderRadius: Radius.md }, text: { fontSize: Typography.sm }, iconSize: 14 },
  md: { container: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md }, text: { fontSize: Typography.base }, iconSize: 16 },
  lg: { container: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: Radius.lg }, text: { fontSize: Typography.md }, iconSize: 18 },
};

// ─────────────────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────────────────
export const Badge = ({ label, variant = 'default', style }) => {
  const v = badgeVariants[variant] || badgeVariants.default;
  return (
    <View style={[styles.badgeContainer, { backgroundColor: v.bg }, style]}>
      <Text style={[styles.badgeText, { color: v.text }]}>{label}</Text>
    </View>
  );
};

export const StatusBadge = ({ status }) => {
  const colors = Colors.status[status?.toLowerCase()] || { bg: Colors.gray100, text: Colors.gray600 };
  const label  = status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
  return (
    <View style={[styles.badgeContainer, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
};

export const RoleBadge = ({ role }) => {
  const colors = Colors.roles[role?.toLowerCase()] || { bg: Colors.gray100, text: Colors.gray600 };
  const label  = role?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
  return (
    <View style={[styles.badgeContainer, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
};

const badgeVariants = {
  default:  { bg: Colors.gray100,       text: Colors.gray700 },
  primary:  { bg: Colors.primaryLight,  text: Colors.primaryDark },
  success:  { bg: Colors.successLight,  text: Colors.successDark },
  warning:  { bg: Colors.warningLight,  text: Colors.warningDark },
  danger:   { bg: Colors.dangerLight,   text: Colors.dangerDark },
  info:     { bg: Colors.infoLight,     text: Colors.infoDark },
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────────────────
export const Card = ({ children, style, onPress, noPadding = false }) => {
  const content = (
    <View style={[styles.card, !noPadding && styles.cardPadding, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────
export const Input = ({
  label, placeholder, value, onChangeText, error,
  secureTextEntry = false, keyboardType = 'default',
  multiline = false, numberOfLines = 1, editable = true,
  icon, style, inputStyle, autoCapitalize = 'sentences',
  autoCorrect = true, returnKeyType, onSubmitEditing,
  required = false,
}) => {
  const [focused, setFocused]     = useState(false);
  const [showPass, setShowPass]   = useState(false);
  const isPassword = secureTextEntry;

  return (
    <View style={[styles.inputWrapper, style]}>
      {label && (
        <Text style={styles.inputLabel}>
          {label}{required && <Text style={{ color: Colors.danger }}> *</Text>}
        </Text>
      )}
      <View style={[
        styles.inputContainer,
        focused && styles.inputFocused,
        error  && styles.inputError,
        !editable && styles.inputDisabled,
        multiline && { height: numberOfLines * 44, alignItems: 'flex-start' },
      ]}>
        {icon && (
          <Ionicons name={icon} size={18} color={focused ? Colors.primary : Colors.gray400} style={styles.inputIcon} />
        )}
        <TextInput
          style={[styles.input, multiline && { textAlignVertical: 'top', paddingTop: 10 }, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray400}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword && !showPass}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setShowPass((p) => !p)} style={styles.inputEye}>
            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SELECT (bottom-sheet style picker)
// ─────────────────────────────────────────────────────────────────────────────
export const Select = ({
  label, placeholder = 'Select an option', value,
  onValueChange, options = [], error, style, required = false,
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={[styles.inputWrapper, style]}>
      {label && (
        <Text style={styles.inputLabel}>
          {label}{required && <Text style={{ color: Colors.danger }}> *</Text>}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.inputContainer, styles.selectTrigger, error && styles.inputError]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.input, !selected && { color: Colors.gray400 }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.gray400} />
      </TouchableOpacity>
      {error && <Text style={styles.inputErrorText}>{error}</Text>}

      <RNModal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.selectOverlay} onPress={() => setOpen(false)} />
        <View style={styles.selectSheet}>
          <View style={styles.selectHandle} />
          <Text style={styles.selectTitle}>{label || placeholder}</Text>
          <ScrollView>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.selectOption, opt.value === value && styles.selectOptionActive]}
                onPress={() => { onValueChange(opt.value); setOpen(false); }}
              >
                <Text style={[styles.selectOptionText, opt.value === value && { color: Colors.primary, fontWeight: Typography.semibold }]}>
                  {opt.label}
                </Text>
                {opt.value === value && (
                  <Ionicons name="checkmark" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </RNModal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────
export const Modal = ({
  visible, onClose, title, children,
  showClose = true, size = 'md',
}) => {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalContainer, modalSizes[size]]} onPress={() => {}}>
          {(title || showClose) && (
            <View style={styles.modalHeader}>
              {title && <Text style={styles.modalTitle}>{title}</Text>}
              {showClose && (
                <TouchableOpacity onPress={onClose} style={styles.modalClose}>
                  <Ionicons name="close" size={20} color={Colors.gray500} />
                </TouchableOpacity>
              )}
            </View>
          )}
          <View style={styles.modalBody}>{children}</View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
};

const modalSizes = {
  sm: { width: '80%' },
  md: { width: '90%' },
  lg: { width: '95%' },
};

// ─────────────────────────────────────────────────────────────────────────────
// SPINNER / LOADING
// ─────────────────────────────────────────────────────────────────────────────
export const Spinner = ({ size = 'large', color = Colors.primary, fullScreen = false }) => {
  if (fullScreen) {
    return (
      <View style={styles.spinnerFull}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={color} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────
export const EmptyState = ({ icon = 'document-outline', title, message, action }) => (
  <View style={styles.emptyContainer}>
    <Ionicons name={icon} size={52} color={Colors.gray300} />
    {title   && <Text style={styles.emptyTitle}>{title}</Text>}
    {message && <Text style={styles.emptyMessage}>{message}</Text>}
    {action  && (
      <Button title={action.label} onPress={action.onPress} style={{ marginTop: Spacing[4] }} />
    )}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────────────────────────
export const Avatar = ({ name = '', size = 40, style }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────────────────────
export const SectionHeader = ({ title, action }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={action.onPress}>
        <Text style={styles.sectionAction}>{action.label}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD (used on dashboard)
// ─────────────────────────────────────────────────────────────────────────────
export const StatCard = ({ label, value, icon, color = Colors.primary, style }) => (
  <Card style={[styles.statCard, style]}>
    <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.statValue}>{value ?? '—'}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BANNER
// ─────────────────────────────────────────────────────────────────────────────
export const ErrorBanner = ({ message, onDismiss }) => {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle-outline" size={16} color={Colors.dangerDark} style={{ marginRight: 8 }} />
      <Text style={styles.errorBannerText}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={{ marginLeft: 'auto' }}>
          <Ionicons name="close" size={16} color={Colors.dangerDark} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DIVIDER
// ─────────────────────────────────────────────────────────────────────────────
export const Divider = ({ style }) => <View style={[styles.divider, style]} />;

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Button
  btnBase:     { alignItems: 'center', justifyContent: 'center' },
  btnInner:    { flexDirection: 'row', alignItems: 'center' },
  btnText:     { fontWeight: Typography.semibold },
  btnDisabled: { opacity: 0.5 },

  // Badge
  badgeContainer: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText:      { fontSize: Typography.xs, fontWeight: Typography.semibold },

  // Card
  card:        { backgroundColor: Colors.surface, borderRadius: Radius.lg, ...Shadow.sm },
  cardPadding: { padding: Spacing[4] },

  // Input
  inputWrapper:    { marginBottom: Spacing[4] },
  inputLabel:      { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: Spacing[1] },
  inputContainer:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.white, minHeight: 46, paddingHorizontal: Spacing[3] },
  inputFocused:    { borderColor: Colors.primary },
  inputError:      { borderColor: Colors.danger },
  inputDisabled:   { backgroundColor: Colors.gray100 },
  input:           { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, paddingVertical: 0 },
  inputIcon:       { marginRight: Spacing[2] },
  inputEye:        { padding: Spacing[1] },
  inputErrorText:  { fontSize: Typography.xs, color: Colors.danger, marginTop: 4 },

  // Select
  selectTrigger:  { justifyContent: 'space-between' },
  selectOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  selectSheet:    { backgroundColor: Colors.white, borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'], padding: Spacing[6], maxHeight: '60%' },
  selectHandle:   { width: 40, height: 4, backgroundColor: Colors.gray300, borderRadius: Radius.full, alignSelf: 'center', marginBottom: Spacing[4] },
  selectTitle:    { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing[3] },
  selectOption:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  selectOptionActive: { backgroundColor: Colors.primaryLight + '40' },
  selectOptionText:   { fontSize: Typography.base, color: Colors.textPrimary },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer:  { backgroundColor: Colors.white, borderRadius: Radius.xl, maxHeight: '85%', ...Shadow.lg },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:      { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  modalClose:      { padding: 4 },
  modalBody:       { padding: Spacing[4] },

  // Spinner
  spinnerFull: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[8] },
  emptyTitle:     { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary, marginTop: Spacing[4], textAlign: 'center' },
  emptyMessage:   { fontSize: Typography.base, color: Colors.textSecondary, marginTop: Spacing[2], textAlign: 'center', lineHeight: 22 },

  // Avatar
  avatar:     { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: Typography.bold },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  sectionTitle:  { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sectionAction: { fontSize: Typography.sm, color: Colors.primary, fontWeight: Typography.medium },

  // Stat card
  statCard:  { alignItems: 'center', padding: Spacing[4], flex: 1 },
  statIcon:  { width: 48, height: 48, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  statValue: { fontSize: Typography['2xl'], fontWeight: Typography.bold, color: Colors.textPrimary },
  statLabel: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  // Error banner
  errorBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dangerLight, padding: Spacing[3], borderRadius: Radius.md, marginBottom: Spacing[3] },
  errorBannerText: { fontSize: Typography.sm, color: Colors.dangerDark, flex: 1 },

  // Divider
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing[3] },
});

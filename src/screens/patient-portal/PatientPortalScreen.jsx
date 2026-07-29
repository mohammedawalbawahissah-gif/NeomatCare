import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { patientPortalApi, transportApi, wellnessApi, householdsApi, getErrorMessage } from '../../api/client';
import { Input, Select, Button, Spinner, Badge, ErrorBanner, Card } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const TABS = [
  { id: 'pregnancy', label: 'Pregnancy', icon: 'body-outline' },
  { id: 'cycle', label: 'Cycle', icon: 'water-outline' },
  { id: 'household', label: 'My Household', icon: 'home-outline' },
  { id: 'nutrition', label: 'Nutrition', icon: 'nutrition-outline' },
  { id: 'reviews', label: 'Reviews', icon: 'star-outline' },
  { id: 'oncall', label: 'On-Call', icon: 'call-outline' },
  { id: 'transport', label: 'Transport', icon: 'car-outline' },
  { id: 'health', label: 'My Health', icon: 'heart-outline' },
];

// A non-pregnant Wellness user only gets cycle tracking, adult nutrition
// guidance, and paid telehealth. Mirrors WELLNESS_TAB_IDS on web. On-Call
// is relabeled "Consult" for Wellness users only — Maternal keeps "On-Call".
const WELLNESS_TAB_IDS = ['cycle', 'nutrition', 'oncall'];

// Mirrors TAB_COLORS on web exactly — soft tint when inactive, solid fill
// when active, so the whole bar visibly shifts mood with the selected tab.
const TAB_COLORS = {
  pregnancy: { tint: '#dcfce7', text: '#166534', solid: '#16a34a' },
  cycle:     { tint: '#fce7f3', text: '#831843', solid: '#be185d' },
  household: { tint: '#dcfce7', text: '#166534', solid: '#207652' },
  nutrition: { tint: '#fef3c7', text: '#92400e', solid: '#b45309' },
  reviews:   { tint: '#fef3c7', text: '#92400e', solid: '#b45309' },
  oncall:    { tint: '#dbeafe', text: '#1e3a8a', solid: '#1d4ed8' },
  transport: { tint: '#ffedd5', text: '#9a3412', solid: '#c2410c' },
  health:    { tint: '#f3e8ff', text: '#6b21a8', solid: '#7e22ce' },
};

export default function PatientPortalScreen() {
  const { user, isWellness } = useAuth();
  const visibleTabs = (isWellness ? TABS.filter((t) => WELLNESS_TAB_IDS.includes(t.id)) : TABS)
    .map((t) => (t.id === 'oncall' && isWellness ? { ...t, label: 'Consult' } : t));
  const [tab, setTab] = useState(isWellness ? 'cycle' : 'pregnancy');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <Text style={styles.title}>Welcome, {user?.name?.split(' ')[0]} 👋</Text>
        <Text style={styles.subtitle}>{isWellness ? 'Your personal wellness portal' : 'Your personal maternity care portal'}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarWrap} contentContainerStyle={styles.tabBar}>
        {visibleTabs.map((t) => {
          const c = TAB_COLORS[t.id];
          const isActive = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabBtn,
                { backgroundColor: isActive ? c.solid : c.tint },
                isActive && Shadow.sm,
              ]}
            >
              <Ionicons name={t.icon} size={16} color={isActive ? Colors.white : c.text} />
              <Text style={[styles.tabBtnText, { color: isActive ? Colors.white : c.text }, isActive && styles.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10] }}>
        {tab === 'pregnancy' && <PregnancyTab />}
        {tab === 'cycle' && <CycleTrackerTab />}
        {tab === 'household' && <HouseholdTab />}
        {tab === 'nutrition' && <NutritionTab />}
        {tab === 'reviews' && <ReviewsTab />}
        {tab === 'oncall' && <OnCallTab />}
        {tab === 'transport' && <TransportTab />}
        {tab === 'health' && <MyHealthTab />}
      </ScrollView>
    </View>
  );
}

// ─── 1. Pregnancy Guide ─────────────────────────────────────────────────────────
const TRIMESTERS = [
  {
    title: 'First Trimester (Weeks 1–12)', color: '#dcfce7', border: '#86efac', accent: '#166534',
    tips: [
      'Attend your first antenatal care (ANC) visit as early as possible.',
      'Start folic acid supplements (400 mcg/day) to prevent neural tube defects.',
      'Avoid alcohol, tobacco, and unprescribed medications.',
      'Eat small, frequent meals to manage nausea.',
      'Stay hydrated — aim for 8–10 glasses of water daily.',
      'Rest as much as possible; fatigue is normal.',
    ],
    danger: ['Heavy vaginal bleeding', 'Severe abdominal cramps', 'High fever (above 38°C)', 'Fainting or loss of consciousness'],
  },
  {
    title: 'Second Trimester (Weeks 13–27)', color: '#fef9c3', border: '#fde047', accent: '#713f12',
    tips: [
      'Continue ANC visits — typically monthly during this period.',
      'Sleep on your left side to improve blood flow to baby.',
      'Eat iron-rich foods (beans, dark greens, lean meat) to prevent anaemia.',
      'Take iron and folate supplements as prescribed.',
      'Start monitoring baby movements after week 20.',
      'Avoid standing for long periods without rest.',
    ],
    danger: ['No foetal movement felt after week 20', 'Sudden swelling of face, hands, or feet', 'Severe headache or blurred vision', 'Vaginal bleeding of any amount', 'Pain or burning when urinating'],
  },
  {
    title: 'Third Trimester (Weeks 28–40+)', color: '#fce7f3', border: '#f9a8d4', accent: '#831843',
    tips: [
      'Increase ANC visit frequency — every two weeks after week 28, weekly from week 36.',
      'Count baby kicks daily — at least 10 movements in 2 hours.',
      'Prepare your delivery bag early (week 35–36).',
      'Discuss your birth plan with your health worker.',
      'Watch for signs of pre-eclampsia (headache, visual changes, upper-belly pain).',
      'Arrange transport to the facility in advance.',
    ],
    danger: ['Decreased or absent foetal movement', 'Severe or sudden headache', 'Blurred or double vision', 'Swelling of face and hands', 'Fluid gushing from vagina (ruptured membranes)', 'Contractions before 37 weeks', 'Heavy bleeding'],
  },
];

function PregnancyTab() {
  const [open, setOpen] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [reason, setReason] = useState(null); // 'no_patient_record' | 'no_edd' | null
  const [loading, setLoading] = useState(true);
  const [lmpInput, setLmpInput] = useState('');
  const [submittingEdd, setSubmittingEdd] = useState(false);
  const [showFullReference, setShowFullReference] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    wellnessApi.myPregnancy()
      .then(({ data }) => { setSnapshot(data); setReason(null); })
      .catch((err) => {
        setSnapshot(null);
        setReason(err?.response?.data?.reason || 'no_edd');
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSetEdd = async () => {
    if (!lmpInput) return;
    setSubmittingEdd(true);
    try {
      await wellnessApi.setEdd({ last_period_start: lmpInput });
      load();
    } finally { setSubmittingEdd(false); }
  };

  return (
    <View>
      <View style={styles.introBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Ionicons name="body" size={18} color="#166534" />
          <Text style={styles.introTitle}>Pregnancy Tracker</Text>
        </View>
        <Text style={styles.introBody}>Personalized nutrition, lifestyle, and danger-sign guidance for exactly where you are today. If you notice any danger sign below, go to your nearest health facility or use the Transport tab.</Text>
      </View>

      {loading && <Text style={styles.emptyText}>Loading…</Text>}

      {!loading && !snapshot && reason === 'no_patient_record' && (
        <View style={styles.trackerEmpty}>
          <Text style={styles.trackerEmptyText}>Your tracker will appear here once a health worker registers your patient record.</Text>
        </View>
      )}

      {!loading && !snapshot && reason === 'no_edd' && (
        <View style={styles.eddSetupCard}>
          <Text style={styles.eddSetupTitle}>Let's set up your tracker</Text>
          <Text style={styles.eddSetupBody}>Enter the start date of your last period and we'll estimate your due date and current week. This is your own estimate — your health worker's clinical date will always take priority once recorded.</Text>
          <Input value={lmpInput} onChangeText={setLmpInput} placeholder="YYYY-MM-DD" icon="calendar-outline" />
          <Button title={submittingEdd ? 'Saving…' : 'Set up tracker'} onPress={handleSetEdd} loading={submittingEdd} fullWidth />
        </View>
      )}

      {!loading && snapshot && (
        <View>
          {/* Today */}
          <View style={styles.trackerCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={styles.trackerTitle}>Today — Week {snapshot.current_week}</Text>
              <Text style={styles.trackerStatLabel}>{snapshot.days_remaining} days until due date</Text>
            </View>
            <Text style={styles.trackerBody}>🥗 <Text style={styles.trackerBodyBold}>Nutrition:</Text> {snapshot.daily_content.nutrition_tip}</Text>
            <Text style={styles.trackerBody}>🧘 <Text style={styles.trackerBodyBold}>Lifestyle:</Text> {snapshot.daily_content.lifestyle_tip}</Text>
            <Text style={[styles.trackerBody, { color: '#b91c1c' }]}>⚠️ <Text style={styles.trackerBodyBold}>Watch for:</Text> {snapshot.daily_content.danger_sign_reminder}</Text>
          </View>

          {/* This week */}
          <Card>
            <Text style={styles.cardHeading}>This Week</Text>
            {!!snapshot.weekly_content.milestone && (
              <Text style={styles.trackerMilestone}>{snapshot.weekly_content.milestone}</Text>
            )}
            <Text style={styles.tipsLabel}>Nutrition</Text>
            {snapshot.weekly_content.nutrition.slice(0, 3).map((t, i) => <Text key={i} style={styles.tipText}>• {t}</Text>)}
            <Text style={[styles.tipsLabel, { marginTop: 8 }]}>Lifestyle</Text>
            {snapshot.weekly_content.lifestyle.slice(0, 3).map((t, i) => <Text key={i} style={styles.tipText}>• {t}</Text>)}
          </Card>

          {/* This month */}
          <Card>
            <Text style={styles.cardHeading}>This Month — Month {snapshot.current_month}</Text>
            <Text style={styles.trackerBody}>
              You're in your {snapshot.monthly_content.trimester_title.toLowerCase()}. Nutrition and lifestyle guidance stays consistent through the month — check the Trimester section below for the full list.
            </Text>
          </Card>

          {/* Trimester full reference */}
          <View style={[styles.trimesterCard, { borderColor: '#c7d2fe' }]}>
            <TouchableOpacity style={styles.trimesterReferenceHeader} onPress={() => setShowFullReference((s) => !s)}>
              <Text style={styles.trimesterReferenceTitle}>{snapshot.trimester_content.title} — Full Reference</Text>
              <Ionicons name={showFullReference ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
            {showFullReference && (
              <View style={{ padding: Spacing[4], paddingTop: 0 }}>
                <Text style={styles.tipsLabel}>All Nutrition Tips</Text>
                {snapshot.trimester_content.nutrition.map((t, i) => <Text key={i} style={styles.tipText}>• {t}</Text>)}
                <Text style={[styles.tipsLabel, { marginTop: 8 }]}>All Lifestyle Tips</Text>
                {snapshot.trimester_content.lifestyle.map((t, i) => <Text key={i} style={styles.tipText}>• {t}</Text>)}
                <View style={styles.dangerBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="warning" size={14} color={Colors.dangerDark} />
                    <Text style={styles.dangerLabel}>Danger Signs — Seek Help Immediately</Text>
                  </View>
                  {snapshot.trimester_content.danger_signs.map((d, i) => <Text key={i} style={styles.dangerText}>• {d}</Text>)}
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── 1b. Cycle Tracker ────────────────────────────────────────────────────────
function CycleTrackerTab() {
  const [entries, setEntries] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ period_start: '', period_end: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const cycleVoiceFields = [{ key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm((f) => ({ ...f, notes: v })) }];
  const cycleVoiceEntry = useVoiceEntry(cycleVoiceFields);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([wellnessApi.listCycleEntries(), wellnessApi.cyclePrediction()])
      .then(([e, p]) => {
        setEntries(e.data.results || e.data);
        setPrediction(p.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmit = async () => {
    setError('');
    if (!form.period_start) { setError('Please enter the period start date.'); return; }
    setSubmitting(true);
    try {
      await wellnessApi.addCycleEntry({
        period_start: form.period_start,
        period_end: form.period_end || null,
        notes: form.notes,
      });
      setForm({ period_start: '', period_end: '', notes: '' });
      load();
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not save cycle entry.');
    } finally { setSubmitting(false); }
  };

  return (
    <View>
      <View style={styles.cycleBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Ionicons name="water" size={18} color="#831843" />
          <Text style={styles.cycleBannerTitle}>Cycle Tracker</Text>
        </View>
        <Text style={styles.cycleBannerBody}>Log your period dates to see predictions for your next cycle. This is a simple estimate based on your own history, not medical advice.</Text>
      </View>

      {!loading && prediction && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.cardHeading}>Prediction</Text>
            {prediction.has_prediction && (
              <View style={[styles.estimateBadge, { backgroundColor: prediction.is_estimated ? '#fef3c7' : '#dcfce7' }]}>
                <Text style={[styles.estimateBadgeText, { color: prediction.is_estimated ? '#92400e' : '#166534' }]}>
                  {prediction.is_estimated ? 'Estimated' : 'Personalized'}
                </Text>
              </View>
            )}
          </View>
          {prediction.has_prediction ? (
            <View>
              <View style={{ flexDirection: 'row', gap: Spacing[5], flexWrap: 'wrap' }}>
                <View>
                  <Text style={styles.predictionStat}>{new Date(prediction.predicted_next_period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                  <Text style={styles.trackerStatLabel}>next period (est.)</Text>
                </View>
                <View>
                  <Text style={styles.predictionStat}>{prediction.avg_cycle_length_days} days</Text>
                  <Text style={styles.trackerStatLabel}>{prediction.is_estimated ? 'typical cycle length assumed' : 'your average cycle length'}</Text>
                </View>
              </View>
              {prediction.is_estimated && (
                <Text style={styles.estimateNote}>Based on a typical 28-day cycle — log one more period and we'll personalize this to your own pattern.</Text>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>Log your first period to get an estimate.</Text>
          )}
        </Card>
      )}

      <Card>
        <Text style={styles.cardHeading}>Log a period</Text>
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <Input label="Start date" required value={form.period_start} onChangeText={(v) => setForm((f) => ({ ...f, period_start: v }))} placeholder="YYYY-MM-DD" icon="calendar-outline" />
        <Input label="End date (optional)" value={form.period_end} onChangeText={(v) => setForm((f) => ({ ...f, period_end: v }))} placeholder="YYYY-MM-DD" icon="calendar-outline" />
        <VoiceEntryTrigger onPress={cycleVoiceEntry.start} count={cycleVoiceFields.length} />
        <Input label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="Any symptoms or notes" />
        <Button title="Log entry" icon="add" onPress={handleSubmit} loading={submitting} fullWidth />
        <VoiceEntryBar voiceEntry={cycleVoiceEntry} />
      </Card>

      <Card>
        <Text style={styles.cardHeading}>History</Text>
        {entries.length === 0 && <Text style={styles.emptyText}>No entries logged yet.</Text>}
        {entries.map((e) => (
          <View key={e.id} style={styles.cycleHistoryRow}>
            <Text style={styles.cycleHistoryDate}>
              {new Date(e.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {e.period_end && ` – ${new Date(e.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
            </Text>
            {!!e.notes && <Text style={styles.cycleHistoryNotes}>{e.notes}</Text>}
          </View>
        ))}
      </Card>
    </View>
  );
}

function ReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ visit_type: 'anc', period: 'pre_labour', facility_name: '', rating: 0, comments: '' });
  const [error, setError] = useState('');
  const reviewVoiceFields = [
    { key: 'facility_name', label: 'Facility Name', get: () => form.facility_name, set: (v) => setForm((f) => ({ ...f, facility_name: v })) },
    { key: 'comments', label: 'Comments', get: () => form.comments, set: (v) => setForm((f) => ({ ...f, comments: v })) },
  ];
  const reviewVoiceEntry = useVoiceEntry(reviewVoiceFields);

  const load = useCallback(() => {
    setLoading(true);
    patientPortalApi.reviews.list()
      .then(({ data }) => setReviews(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmit = async () => {
    setError('');
    if (!form.rating) { setError('Please select a star rating.'); return; }
    setSubmitting(true);
    try {
      await patientPortalApi.reviews.create(form);
      setSuccess(true); setShowForm(false);
      setForm({ visit_type: 'anc', period: 'pre_labour', facility_name: '', rating: 0, comments: '' });
      load();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to submit review.');
    } finally { setSubmitting(false); }
  };

  const visitLabel = (v) => VISIT_TYPES.find((t) => t.value === v)?.label || v;

  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.tabHeading}>Service Ratings & Reviews</Text>
        <Button title={showForm ? 'Cancel' : 'Add Review'} icon={showForm ? undefined : 'add'} size="sm" onPress={() => setShowForm((v) => !v)} />
      </View>

      {success && (
        <View style={styles.successBox}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successDark} />
          <Text style={styles.successText}>Review submitted successfully!</Text>
        </View>
      )}

      {showForm && (
        <Card>
          <Text style={styles.cardHeading}>Submit a Review</Text>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          <Select label="Visit Type" value={form.visit_type} onValueChange={(v) => setForm((f) => ({ ...f, visit_type: v }))} options={VISIT_TYPES} />
          <Select label="Period" value={form.period} onValueChange={(v) => setForm((f) => ({ ...f, period: v }))} options={[{ value: 'pre_labour', label: 'Pre-Labour' }, { value: 'post_labour', label: 'Post-Labour' }]} />
          <VoiceEntryTrigger onPress={reviewVoiceEntry.start} count={reviewVoiceFields.length} />
          <Input label="Facility Name (optional)" value={form.facility_name} onChangeText={(v) => setForm((f) => ({ ...f, facility_name: v }))} placeholder="e.g. Tamale Teaching Hospital" />
          <Text style={styles.fieldLabel}>Rating <Text style={{ color: Colors.danger }}>*</Text></Text>
          <StarPicker value={form.rating} onChange={(r) => setForm((f) => ({ ...f, rating: r }))} />
          <View style={{ marginTop: Spacing[3] }}>
            <Input label="Comments (optional)" value={form.comments} onChangeText={(v) => setForm((f) => ({ ...f, comments: v }))} multiline numberOfLines={3} placeholder="Tell us about your experience…" />
          </View>
          <Button title="Submit Review" icon="send" onPress={handleSubmit} loading={submitting} fullWidth />
          <VoiceEntryBar voiceEntry={reviewVoiceEntry} />
        </Card>
      )}

      {loading ? <Spinner /> : reviews.length === 0 ? (
        <Card><Text style={styles.emptyText}>No reviews yet. Share your experience!</Text></Card>
      ) : reviews.map((r) => (
        <Card key={r.id}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.reviewVisit}>{visitLabel(r.visit_type)}</Text>
              <Badge label={r.period === 'pre_labour' ? 'Pre-Labour' : 'Post-Labour'} variant={r.period === 'pre_labour' ? 'info' : 'primary'} />
            </View>
            <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
          {!!r.facility_name && <Text style={styles.reviewFacility}>📍 {r.facility_name}</Text>}
          {!!r.comments && <Text style={styles.reviewComments}>{r.comments}</Text>}
        </Card>
      ))}
    </View>
  );
}

// ─── 3. On-Call / Home Service ──────────────────────────────────────────────────
const SERVICE_TYPES = [
  { value: 'home_visit', label: '🏠 Home Visit', desc: 'A health worker visits you at home.' },
  { value: 'phone_consult', label: '📞 Phone Consultation', desc: 'Speak to a health worker by phone.' },
  { value: 'follow_up', label: '📋 Follow-Up Check', desc: 'Post-discharge or postnatal follow-up.' },
];

function OnCallTab() {
  const [form, setForm] = useState({ type: 'home_visit', description: '', location: '', preferred_time: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [
    { key: 'description', label: 'Describe your situation', get: () => form.description, set: (v) => setForm((f) => ({ ...f, description: v })) },
    { key: 'location', label: 'Your location / address', get: () => form.location, set: (v) => setForm((f) => ({ ...f, location: v })) },
    { key: 'preferred_time', label: 'Preferred time', get: () => form.preferred_time, set: (v) => setForm((f) => ({ ...f, preferred_time: v })) },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSubmit = async () => {
    setError('');
    if (!form.description.trim()) { setError('Please describe your request.'); return; }
    setSubmitting(true);
    try {
      await transportApi.requests.create({
        notes: `[ON-CALL / ${form.type.toUpperCase()}]\nDescription: ${form.description}\nLocation: ${form.location || 'Not specified'}\nPreferred time: ${form.preferred_time || 'As soon as possible'}`,
      });
      setSubmitted(true);
      setForm({ type: 'home_visit', description: '', location: '', preferred_time: '' });
    } catch {
      setError('Could not submit request. Please try again.');
    } finally { setSubmitting(false); }
  };

  return (
    <View>
      <View style={styles.emergencyStrip}>
        <Ionicons name="call" size={20} color={Colors.dangerDark} />
        <View>
          <Text style={styles.emergencyTitle}>Emergency? Call Now</Text>
          <Text style={styles.emergencyBody}>Ghana Emergency: <Text style={{ fontWeight: Typography.bold }}>112</Text>  |  Ambulance: <Text style={{ fontWeight: Typography.bold }}>193</Text></Text>
        </View>
      </View>

      <Card>
        <Text style={styles.cardHeading}>Request a Home Service</Text>
        <Text style={styles.cardSub}>Can't make it to the facility? Request a service at home.</Text>

        {submitted && <View style={styles.successBox}><Ionicons name="checkmark-circle" size={16} color={Colors.successDark} /><Text style={styles.successText}>Request submitted! A health worker will follow up shortly.</Text></View>}
        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <View style={{ gap: Spacing[2], marginBottom: Spacing[3] }}>
          {SERVICE_TYPES.map((s) => (
            <TouchableOpacity key={s.value} style={[styles.serviceCard, form.type === s.value && styles.serviceCardActive]} onPress={() => setForm((f) => ({ ...f, type: s.value }))}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.serviceLabel, form.type === s.value && { color: Colors.successDark }]}>{s.label}</Text>
                <Text style={styles.serviceDesc}>{s.desc}</Text>
              </View>
              {form.type === s.value && <Ionicons name="checkmark-circle" size={18} color={Colors.successDark} />}
            </TouchableOpacity>
          ))}
        </View>

        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Describe your situation" required value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline numberOfLines={3} placeholder="e.g. I am 36 weeks pregnant and having severe headaches." />
        <Input label="Your location / address (optional)" value={form.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="e.g. Tamale, Choggu area, near the mosque" icon="location-outline" />
        <Input label="Preferred time (optional)" value={form.preferred_time} onChangeText={(v) => setForm((f) => ({ ...f, preferred_time: v }))} placeholder="e.g. This afternoon" icon="calendar-outline" />
        <Button title="Submit Request" icon="send" onPress={handleSubmit} loading={submitting} fullWidth />
        <VoiceEntryBar voiceEntry={voiceEntry} />
      </Card>
    </View>
  );
}

// ─── 4. Transport ───────────────────────────────────────────────────────────────
const EMERGENCY_TYPES = ['Labour / Active contractions', 'Heavy bleeding', 'Difficulty breathing', 'Severe headache or blurred vision', 'Baby not moving', 'Other emergency'];
const STATUS_COLOR = { pending: '#f59e0b', assigned: '#3b82f6', completed: '#22c55e', cancelled: '#ef4444' };

function TransportTab() {
  const [vehicles, setVehicles] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ vehicle: '', emergency_type: EMERGENCY_TYPES[0], notes: '', pickup_address: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [
    { key: 'pickup_address', label: 'Your pickup address', get: () => form.pickup_address, set: (v) => setForm((f) => ({ ...f, pickup_address: v })) },
    { key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm((f) => ({ ...f, notes: v })) },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      transportApi.vehicles.available().then(({ data }) => setVehicles(Array.isArray(data) ? data : (data.results || []))).catch(() => {}),
      transportApi.requests.mine().then(({ data }) => setMyRequests(Array.isArray(data) ? data : (data.results || []))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSubmit = async () => {
    setError('');
    if (!form.pickup_address.trim()) { setError('Please enter your pickup address.'); return; }
    setSubmitting(true);
    try {
      await transportApi.requests.create({
        notes: `[PATIENT EMERGENCY TRANSPORT]\nType: ${form.emergency_type}\nPickup: ${form.pickup_address}\nNotes: ${form.notes}`,
        ...(form.vehicle && { vehicle: form.vehicle }),
      });
      setSuccess(true);
      setForm({ vehicle: '', emergency_type: EMERGENCY_TYPES[0], notes: '', pickup_address: '' });
      load();
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError('Could not submit transport request. Please try again or call 193.');
    } finally { setSubmitting(false); }
  };

  return (
    <View>
      <View style={styles.emergencyStrip}>
        <Ionicons name="warning" size={18} color={Colors.dangerDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.emergencyTitle}>Life-threatening emergency?</Text>
          <Text style={styles.emergencyBody}>Call Ghana Ambulance: <Text style={{ fontWeight: Typography.bold }}>193</Text> or National Emergency: <Text style={{ fontWeight: Typography.bold }}>112</Text> immediately. Use this form for urgent-but-stable transport.</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.cardHeading}>Request Emergency Transport</Text>
        <Text style={styles.cardSub}>Can't get to the hospital? Request a vehicle to your location.</Text>

        {success && <View style={styles.successBox}><Ionicons name="checkmark-circle" size={16} color={Colors.successDark} /><Text style={styles.successText}>Transport requested! A driver will be assigned shortly.</Text></View>}
        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <Select label="Emergency type" required value={form.emergency_type} onValueChange={(v) => setForm((f) => ({ ...f, emergency_type: v }))} options={EMERGENCY_TYPES.map((t) => ({ value: t, label: t }))} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Your pickup address" required value={form.pickup_address} onChangeText={(v) => setForm((f) => ({ ...f, pickup_address: v }))} placeholder="e.g. Tamale, Choggu Yapala, near water tank" icon="location-outline" />
        {!loading && vehicles.length > 0 && (
          <Select
            label="Preferred vehicle (optional)" value={form.vehicle} onValueChange={(v) => setForm((f) => ({ ...f, vehicle: v }))}
            placeholder="— Let system assign —"
            options={[{ value: '', label: '— Let system assign —' }, ...vehicles.map((v) => ({ value: v.id, label: `${v.vehicle_type} · ${v.registration}${v.driver_name ? ` · ${v.driver_name}` : ''}` }))]}
          />
        )}
        <Input label="Additional notes (optional)" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline numberOfLines={2} placeholder="e.g. I am alone, gate is blue, call on arrival" />
        <Button title="Request Transport Now" icon="car" variant="danger" onPress={handleSubmit} loading={submitting} fullWidth />
        <VoiceEntryBar voiceEntry={voiceEntry} />
      </Card>

      <View style={styles.rowBetween}>
        <Text style={styles.tabHeading}>My Transport Requests</Text>
        <TouchableOpacity onPress={load}><Ionicons name="refresh" size={16} color={Colors.gray400} /></TouchableOpacity>
      </View>

      {loading ? <Spinner /> : myRequests.length === 0 ? (
        <Card><Text style={styles.emptyText}>No transport requests yet.</Text></Card>
      ) : myRequests.slice(0, 5).map((r) => (
        <Card key={r.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.reviewVisit}>{r.vehicle_registration || 'Vehicle TBA'}</Text>
            <Text style={[styles.statusDot, { color: STATUS_COLOR[r.status] }]}>● {r.status}</Text>
          </View>
          {!!r.notes && <Text style={styles.reviewComments}>{r.notes.split('\n')[0]}</Text>}
          <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleString()}</Text>
        </Card>
      ))}
    </View>
  );
}

// ─── 5. My Household (plain member list — no risk ranking shown to a caregiver) ──
function HouseholdTab() {
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    householdsApi.list()
      .then(({ data }) => setHousehold((Array.isArray(data) ? data : data.results || [])[0] || null))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  if (!household) {
    return (
      <Card>
        <View style={{ alignItems: 'center', padding: Spacing[3] }}>
          <Ionicons name="home-outline" size={28} color={Colors.gray400} />
          <Text style={[styles.privacyText, { textAlign: 'center', marginTop: 8 }]}>
            You're not linked to a household record yet. Ask your health worker to add you during your next visit.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <View>
      <View style={styles.householdBanner}>
        <View style={styles.householdBannerIcon}>
          <Ionicons name="home" size={20} color={Colors.white} />
        </View>
        <View>
          <Text style={styles.householdBannerName}>{household.head_name || 'Your household'}</Text>
          <Text style={styles.householdBannerTown}>{household.town || 'Unknown town'}</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.cardHeading}>Household Members</Text>
        {(household.members || []).length === 0 ? (
          <Text style={styles.privacyText}>No members registered yet.</Text>
        ) : (
          household.members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Ionicons name="person-outline" size={16} color={Colors.gray400} />
              <View>
                <Text style={styles.memberName}>{m.patient_name}</Text>
                <Text style={styles.memberMeta}>{m.patient_type} · Age {m.age}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

// ─── Local food guidance block (shared across pregnancy / child / adult) ────────
function LocalFoodBlock({ tips, aiSuggestion }) {
  if (!tips || tips.length === 0) return null;
  return (
    <View style={styles.guidanceAmberBox}>
      <Text style={styles.guidanceAmberTitle}>Local foods that can help</Text>
      {aiSuggestion ? <Text style={styles.guidanceAmberText}>{aiSuggestion}</Text> : null}
      {tips.map((tip, i) => (
        <Text key={i} style={styles.guidanceAmberTip}>• {tip}</Text>
      ))}
    </View>
  );
}

// ─── 6. Nutrition (self-serve — real guidance per child, no risk ranking) ───────
function NutritionTab() {
  const { isWellness } = useAuth();
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guidanceByChild, setGuidanceByChild] = useState({});
  const [pregnancyGuidance, setPregnancyGuidance] = useState(undefined);
  const [adultGuidance, setAdultGuidance] = useState(undefined);

  useEffect(() => {
    if (isWellness) {
      wellnessApi.adultNutrition()
        .then(({ data }) => setAdultGuidance(data))
        .catch(() => setAdultGuidance(null))
        .finally(() => setLoading(false));
      return;
    }

    wellnessApi.myPregnancy()
      .then(({ data }) => setPregnancyGuidance(data))
      .catch(() => setPregnancyGuidance(null));

    householdsApi.list()
      .then(({ data }) => {
        const h = (Array.isArray(data) ? data : data.results || [])[0] || null;
        setHousehold(h);
        const children = (h?.members || []).filter((m) => m.patient_type === 'child');
        children.forEach((c) => {
          wellnessApi.childNutrition(c.id)
            .then(({ data }) => setGuidanceByChild((g) => ({ ...g, [c.id]: data })))
            .catch(() => setGuidanceByChild((g) => ({ ...g, [c.id]: null })));
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isWellness]);

  const children = (household?.members || []).filter((m) => m.patient_type === 'child');

  if (loading) return <Spinner />;

  // ── Wellness (non-pregnant) users ──────────────────────────────────────
  if (isWellness) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name="nutrition-outline" size={18} color={Colors.primary} />
          <Text style={styles.cardHeading}>Your Nutrition Guidance</Text>
        </View>
        {adultGuidance ? (
          <>
            <View style={styles.guidanceGreenBox}>
              {adultGuidance.feeding_tips.map((tip, i) => (
                <Text key={i} style={styles.guidanceGreenText}>• {tip}</Text>
              ))}
            </View>
            <LocalFoodBlock tips={adultGuidance.local_food_tips} aiSuggestion={adultGuidance.local_food_ai_suggestion} />
          </>
        ) : (
          <Text style={styles.privacyText}>No nutrition guidance available yet.</Text>
        )}
      </Card>
    );
  }

  // ── Maternal users: pregnancy nutrition + under-5 children ─────────────
  return (
    <View>
      {pregnancyGuidance ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Ionicons name="body-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardHeading}>Your Pregnancy Nutrition — Week {pregnancyGuidance.current_week}</Text>
          </View>
          <View style={styles.guidanceGreenBox}>
            {pregnancyGuidance.trimester_content.nutrition.map((tip, i) => (
              <Text key={i} style={styles.guidanceGreenText}>• {tip}</Text>
            ))}
          </View>
          <LocalFoodBlock tips={pregnancyGuidance.local_food_tips} aiSuggestion={pregnancyGuidance.local_food_ai_suggestion} />
        </Card>
      ) : null}

      {children.length === 0 ? (
        <Card>
          <Text style={styles.cardHeading}>Children Under Five</Text>
          <Text style={styles.privacyText}>No children under five linked to your household yet.</Text>
        </Card>
      ) : (
        children.map((c) => {
        const g = guidanceByChild[c.id];
        return (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="body-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardHeading}>{c.patient_name} · Age {c.age}</Text>
            </View>

            {g === undefined ? (
              <Text style={styles.privacyText}>Loading guidance…</Text>
            ) : g === null ? (
              <Text style={styles.privacyText}>
                No date of birth on file yet — ask your health worker to add one so we can show age-appropriate guidance.
              </Text>
            ) : (
              <>
                <View style={styles.guidanceGreenBox}>
                  <Text style={styles.guidanceGreenTitle}>Feeding guidance — {g.age_band}</Text>
                  {g.feeding_tips.map((tip, i) => (
                    <Text key={i} style={styles.guidanceGreenText}>• {tip}</Text>
                  ))}
                </View>
                <View style={styles.guidanceRedBox}>
                  <Text style={styles.guidanceRedTitle}>Seek care immediately if you see</Text>
                  {g.danger_signs.slice(0, 5).map((sign, i) => (
                    <Text key={i} style={styles.guidanceRedText}>• {sign}</Text>
                  ))}
                </View>
                <LocalFoodBlock tips={g.local_food_tips} aiSuggestion={g.local_food_ai_suggestion} />
              </>
            )}
          </Card>
        );
      }))}
    </View>
  );
}

// ─── 7. My Health ───────────────────────────────────────────────────────────────
function MyHealthTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientPortalApi.me().then(({ data }) => setProfile(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const info = profile || user;
  if (loading) return <Spinner />;

  return (
    <View>
      <View style={styles.healthProfileCard}>
        <View style={styles.healthAvatar}><Text style={styles.healthAvatarText}>{info?.name?.[0]?.toUpperCase() || 'P'}</Text></View>
        <Text style={styles.healthName}>{info?.name}</Text>
        <Text style={styles.healthSub}>Patient Account</Text>
        {info?.is_verified && <Badge label="✓ Verified" variant="success" />}
        <View style={{ marginTop: Spacing[3], gap: 6, width: '100%' }}>
          <InfoRow icon="mail-outline" label="Email" value={info?.email} />
          <InfoRow icon="call-outline" label="Phone" value={info?.phone_number || 'Not provided'} />
          <InfoRow icon="shield-outline" label="Role" value="Patient" />
          <InfoRow icon="calendar-outline" label="Joined" value={info?.created_at ? new Date(info.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="shield" size={16} color={Colors.gray400} />
          <Text style={styles.cardHeading}>Your Data & Privacy</Text>
        </View>
        <Text style={styles.privacyText}>Your information is stored securely and used only to provide maternal care services. It is never shared with third parties without your consent. For questions, contact your facility or the NeoMatCare team.</Text>
      </Card>

      <Card>
        <Text style={styles.cardHeading}>Quick Reminders</Text>
        {[
          '📅 Attend all scheduled ANC visits.',
          '💊 Take your supplements daily as prescribed.',
          '🚨 Any danger sign → go to hospital or request transport immediately.',
          '📞 Keep your phone charged and accessible.',
          '👩‍⚕️ Contact your health worker if you have any concerns.',
        ].map((tip, i) => <Text key={i} style={styles.reminderText}>{tip}</Text>)}
      </Card>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={Colors.gray400} />
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  tabBarWrap: { flexGrow: 0, marginTop: Spacing[2] },
  tabBar: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing[4] },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 9, ...Shadow.sm },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.white, fontWeight: Typography.semibold },
  introBanner: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  introTitle: { color: '#166534', fontSize: Typography.md, fontWeight: Typography.bold },
  introBody: { color: '#14532d', fontSize: Typography.sm },
  cycleBanner: { backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#f9a8d4', borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  cycleBannerTitle: { color: '#831843', fontSize: Typography.md, fontWeight: Typography.bold },
  cycleBannerBody: { color: '#831843', fontSize: Typography.sm },
  predictionStat: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#831843' },
  cycleHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cycleHistoryDate: { fontSize: Typography.sm, color: Colors.textSecondary },
  cycleHistoryNotes: { fontSize: Typography.xs, color: Colors.gray400 },
  trimesterCard: { borderWidth: 1.5, borderRadius: Radius.lg, marginBottom: Spacing[3], overflow: 'hidden' },
  trimesterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing[4] },
  trimesterTitle: { fontWeight: Typography.bold, fontSize: Typography.sm },
  tipsLabel: { fontWeight: Typography.semibold, fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  tipText: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: 4 },
  dangerBox: { backgroundColor: '#fff4f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[3] },
  dangerLabel: { fontWeight: Typography.bold, fontSize: Typography.sm, color: Colors.dangerDark },
  dangerText: { fontSize: Typography.sm, color: '#7f1d1d', marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  tabHeading: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  trackerBody: { fontSize: Typography.sm, color: '#166534', lineHeight: 20, marginBottom: 4 },
  trackerBodyBold: { fontWeight: Typography.bold },
  trackerMilestone: { fontSize: Typography.sm, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: 6 },
  trackerEmpty: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  trackerEmptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  eddSetupCard: { backgroundColor: '#eef2ff', borderWidth: 1.5, borderColor: '#a5b4fc', borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  eddSetupTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#3730a3', marginBottom: 6 },
  eddSetupBody: { fontSize: Typography.sm, color: '#4338ca', marginBottom: Spacing[3], lineHeight: 19 },
  trimesterReferenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing[4] },
  trimesterReferenceTitle: { fontWeight: Typography.bold, fontSize: Typography.sm, color: Colors.textPrimary, flex: 1, marginRight: 8 },
  estimateBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999 },
  estimateBadgeText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  estimateNote: { fontSize: Typography.xs, color: Colors.gray400, fontStyle: 'italic', marginTop: 8 },
  trackerStatLabel: { fontSize: Typography.xs, color: Colors.textSecondary },
  cardHeading: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing[2] },
  cardSub: { fontSize: Typography.xs, color: Colors.gray400, marginBottom: Spacing[3] },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  successText: { fontSize: Typography.sm, color: Colors.successDark },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: Spacing[1] },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  reviewVisit: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  reviewDate: { fontSize: Typography.xs, color: Colors.gray400 },
  stars: { fontSize: Typography.lg, color: '#f59e0b', letterSpacing: 2, marginVertical: 4 },
  reviewFacility: { fontSize: Typography.xs, color: Colors.gray400, marginBottom: 2 },
  reviewComments: { fontSize: Typography.sm, color: Colors.textSecondary },
  emergencyStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3] },
  emergencyTitle: { fontWeight: Typography.bold, fontSize: Typography.sm, color: Colors.dangerDark },
  emergencyBody: { fontSize: Typography.xs, color: '#991b1b', marginTop: 2 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 2, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3] },
  serviceCardActive: { borderColor: Colors.successDark, backgroundColor: '#f0fdf4' },
  serviceLabel: { fontWeight: Typography.semibold, fontSize: Typography.sm, color: Colors.textPrimary },
  serviceDesc: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  statusDot: { fontSize: Typography.xs, fontWeight: Typography.bold, textTransform: 'capitalize' },
  healthProfileCard: { alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: Radius.xl, padding: Spacing[5], marginBottom: Spacing[3] },
  healthAvatar: { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  healthAvatarText: { color: Colors.white, fontSize: Typography.lg, fontWeight: Typography.bold },
  healthName: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#166534' },
  healthSub: { fontSize: Typography.xs, color: '#15803d', marginBottom: 6 },
  infoLabel: { fontSize: Typography.sm, color: Colors.gray400, width: 50 },
  infoValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium, flex: 1 },
  privacyText: { fontSize: Typography.xs, color: Colors.gray400, lineHeight: 18 },
  reminderText: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: 6 },

  householdBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac',
    borderRadius: Radius.xl, padding: Spacing[4], marginBottom: Spacing[3],
  },
  householdBannerIcon: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: '#207652',
    alignItems: 'center', justifyContent: 'center',
  },
  householdBannerName: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#166534' },
  householdBannerTown: { fontSize: Typography.xs, color: '#15803d', marginTop: 2 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  memberName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  memberMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 1, textTransform: 'capitalize' },

  guidanceGreenBox: {
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[2],
  },
  guidanceGreenTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#166534', marginBottom: 6 },
  guidanceGreenText: { fontSize: Typography.xs, color: '#166534', marginBottom: 3, lineHeight: 16 },
  guidanceRedBox: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: Radius.md, padding: Spacing[3],
  },
  guidanceRedTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#991b1b', marginBottom: 6 },
  guidanceRedText: { fontSize: Typography.xs, color: '#991b1b', marginBottom: 3, lineHeight: 16 },
  guidanceAmberBox: {
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: Radius.md, padding: Spacing[3], marginTop: Spacing[2],
  },
  guidanceAmberTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#92400e', marginBottom: 6 },
  guidanceAmberText: { fontSize: Typography.xs, color: '#78350f', marginBottom: 8, lineHeight: 16 },
  guidanceAmberTip: { fontSize: Typography.xs, color: '#92400e', marginBottom: 3, lineHeight: 16 },
});

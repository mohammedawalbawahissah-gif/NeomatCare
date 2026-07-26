/**
 * navigation/RootNavigator.jsx
 * ------------------------------
 * Every role's tab bar is now exactly 3 items: Menu, Home, Profile.
 * Everything that used to be its own tab button (Cases, Patients,
 * Referrals, Consultations, Transport, Facility, Users, Facilities,
 * Dispatches) is now a grid card inside that role's MenuScreen, nested
 * in the same Stack as before -- screen names are unchanged, so every
 * existing navigation.navigate() call site that pointed at a nested
 * screen (e.g. 'CasesTab' -> 'CaseDetail') still resolves via React
 * Navigation's automatic upward bubbling. The only call sites that
 * needed updating are in DashboardScreen, since Dashboard ("Home") is
 * now a *sibling* of the Menu stack rather than a sibling of the
 * individual feature stacks -- those now route through 'MenuTab' first.
 */
import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';

// Auth
import LoginScreen           from '../screens/auth/LoginScreen';
import RegisterScreen        from '../screens/auth/RegisterScreen';
import WellnessCompanionScreen from '../screens/auth/WellnessCompanionScreen';

// Shared
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import ProfileScreen   from '../screens/shared/ProfileScreen';
import MenuScreen       from '../screens/shared/MenuScreen';

// Health worker
import CasesScreen       from '../screens/health-worker/CasesScreen';
import CaseDetailScreen  from '../screens/health-worker/CaseDetailScreen';
import CaseCreateScreen  from '../screens/health-worker/CaseCreateScreen';

// Patients (shared: health_worker, facility_admin, superadmin)
import PatientsScreen      from '../screens/patients/PatientsScreen';
import PatientDetailScreen from '../screens/patients/PatientDetailScreen';
import PatientCreateScreen from '../screens/patients/PatientCreateScreen';

// Referrals (shared)
import ReferralsScreen       from '../screens/referrals/ReferralsScreen';
import ReferralDetailScreen  from '../screens/referrals/ReferralDetailScreen';

// Specialist
import ConsultationsScreen       from '../screens/consultations/ConsultationsScreen';
import ConsultationDetailScreen  from '../screens/consultations/ConsultationDetailScreen';
import SpecialistProfileScreen   from '../screens/specialist/SpecialistProfileScreen';

// Facility admin
import FacilityScreen from '../screens/facility-admin/FacilityScreen';

// Driver
import TransportScreen       from '../screens/transport/TransportScreen';
import MyDispatchesScreen    from '../screens/driver/MyDispatchesScreen';

// Superadmin
import FacilitiesScreen  from '../screens/superadmin/FacilitiesScreen';
import UsersScreen       from '../screens/superadmin/UsersScreen';
import SpecialistsScreen from '../screens/superadmin/SpecialistsScreen';

// Patient portal
import PatientPortalScreen from '../screens/patient-portal/PatientPortalScreen';

import { usePushNotifications } from '../hooks/usePushNotifications';
import AssistantWidget from '../components/ai/AssistantWidget';
import NotificationBell from '../components/notifications/NotificationBell';
import SyncQueueBell from '../components/sync/SyncQueueBell';
import VoiceLanguagePicker from '../components/voice/VoiceLanguagePicker';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();
const NO_HEADER = { headerShown: false };

// --- Auth Stack ----------------------------------------------------------------
const AuthStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Login"           component={LoginScreen} />
    <Stack.Screen name="Register"        component={RegisterScreen} />
    <Stack.Screen name="PatientRegister" component={WellnessCompanionScreen} />
  </Stack.Navigator>
);

// --- Cases Stack -----------------------------------------------------------------
const CasesStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Cases"      component={CasesScreen} />
    <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
    <Stack.Screen name="CaseCreate" component={CaseCreateScreen} />
  </Stack.Navigator>
);

// --- Patients Stack --------------------------------------------------------------
const PatientsStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="PatientsList"   component={PatientsScreen} />
    <Stack.Screen name="PatientDetail"  component={PatientDetailScreen} />
    <Stack.Screen name="PatientCreate"  component={PatientCreateScreen} />
  </Stack.Navigator>
);

// --- Referrals Stack ---------------------------------------------------------------
const ReferralsStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="ReferralsList"  component={ReferralsScreen} />
    <Stack.Screen name="ReferralDetail" component={ReferralDetailScreen} />
    <Stack.Screen name="CaseDetail"     component={CaseDetailScreen} />
  </Stack.Navigator>
);

// --- Consultations Stack -----------------------------------------------------------
const ConsultationsStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="ConsultationsList"   component={ConsultationsScreen} />
    <Stack.Screen name="ConsultationDetail"  component={ConsultationDetailScreen} />
    <Stack.Screen name="ReferralDetail"      component={ReferralDetailScreen} />
    <Stack.Screen name="CaseDetail"          component={CaseDetailScreen} />
  </Stack.Navigator>
);

// --- Superadmin Cases Stack (kept distinct, as before) ------------------------------
const SuperadminCasesStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Cases"      component={CasesScreen} />
    <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
    <Stack.Screen name="CaseCreate" component={CaseCreateScreen} />
  </Stack.Navigator>
);

// --- Shared tab bar options --------------------------------------------------------
const TAB_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor:   '#16a34a',
  tabBarInactiveTintColor: '#94a3b8',
  tabBarStyle: {
    backgroundColor: '#fff',
    borderTopColor:  '#f1f5f9',
    borderTopWidth:  1,
    paddingBottom:   8,
    paddingTop:      6,
    height:          64,
  },
  tabBarLabelStyle: {
    fontSize:   11,
    fontWeight: '600',
    marginTop:  2,
  },
};

const icon = (name) => ({ color }) => <Ionicons name={name} size={22} color={color} />;

// --- Health Worker -----------------------------------------------------------------
const HealthWorkerMenu = () => {
  const nav = useNavigation();
  return (
    <MenuScreen
      subtitle="Everything else, in one place"
      items={[
        { key: 'cases',         label: 'Cases',        icon: 'medical-outline',           color: '#dcfce7', iconColor: '#16a34a', onPress: () => nav.navigate('CasesTab') },
        { key: 'patients',      label: 'Patients',     icon: 'people-outline',             color: '#dbeafe', iconColor: '#1d4ed8', onPress: () => nav.navigate('PatientsTab') },
        { key: 'referrals',     label: 'Referrals',    icon: 'swap-horizontal-outline',    color: '#fef3c7', iconColor: '#d97706', onPress: () => nav.navigate('Referrals') },
        { key: 'consultations', label: 'Consults',     icon: 'chatbubbles-outline',        color: '#ede9fe', iconColor: '#6d28d9', onPress: () => nav.navigate('Consultations') },
        { key: 'transport',     label: 'Transport',    icon: 'car-outline',                color: '#ffe4e6', iconColor: '#be123c', onPress: () => nav.navigate('Transport') },
      ]}
    />
  );
};

const HealthWorkerMenuStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Menu"          component={HealthWorkerMenu} />
    <Stack.Screen name="CasesTab"      component={CasesStack} />
    <Stack.Screen name="PatientsTab"   component={PatientsStack} />
    <Stack.Screen name="Referrals"     component={ReferralsStack} />
    <Stack.Screen name="Consultations" component={ConsultationsStack} />
    <Stack.Screen name="Transport"     component={TransportScreen} />
  </Stack.Navigator>
);

const HealthWorkerTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="MenuTab"   component={HealthWorkerMenuStack} options={{ title: 'Menu', tabBarIcon: icon('grid-outline') }} />
    <Tab.Screen name="Dashboard" component={DashboardScreen}       options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}         options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Specialist ----------------------------------------------------------------------
const SpecialistMenu = () => {
  const nav = useNavigation();
  return (
    <MenuScreen
      subtitle="Everything else, in one place"
      items={[
        { key: 'consultations', label: 'Consults',  icon: 'chatbubbles-outline',     color: '#ede9fe', iconColor: '#6d28d9', onPress: () => nav.navigate('Consultations') },
        { key: 'referrals',     label: 'Referrals', icon: 'swap-horizontal-outline', color: '#fef3c7', iconColor: '#d97706', onPress: () => nav.navigate('Referrals') },
        { key: 'myProfile',     label: 'My Profile', icon: 'medkit-outline',         color: '#dcf1e6', iconColor: '#207652', onPress: () => nav.navigate('SpecialistProfile') },
      ]}
    />
  );
};

const SpecialistMenuStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Menu"               component={SpecialistMenu} />
    <Stack.Screen name="Consultations"      component={ConsultationsStack} />
    <Stack.Screen name="Referrals"          component={ReferralsStack} />
    <Stack.Screen name="SpecialistProfile"  component={SpecialistProfileScreen} />
  </Stack.Navigator>
);

const SpecialistTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="MenuTab"   component={SpecialistMenuStack} options={{ title: 'Menu', tabBarIcon: icon('grid-outline') }} />
    <Tab.Screen name="Dashboard" component={DashboardScreen}     options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}       options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Facility Admin --------------------------------------------------------------------
const FacilityAdminMenu = () => {
  const nav = useNavigation();
  return (
    <MenuScreen
      subtitle="Everything else, in one place"
      items={[
        { key: 'cases',         label: 'Cases',        icon: 'medical-outline',           color: '#dcfce7', iconColor: '#16a34a', onPress: () => nav.navigate('CasesTab') },
        { key: 'patients',      label: 'Patients',     icon: 'people-outline',             color: '#dbeafe', iconColor: '#1d4ed8', onPress: () => nav.navigate('PatientsTab') },
        { key: 'referrals',     label: 'Referrals',    icon: 'swap-horizontal-outline',    color: '#fef3c7', iconColor: '#d97706', onPress: () => nav.navigate('Referrals') },
        { key: 'consultations', label: 'Consults',     icon: 'chatbubbles-outline',        color: '#ede9fe', iconColor: '#6d28d9', onPress: () => nav.navigate('Consultations') },
        { key: 'transport',     label: 'Transport',    icon: 'car-outline',                color: '#ffe4e6', iconColor: '#be123c', onPress: () => nav.navigate('Transport') },
        { key: 'facility',      label: 'Facility',     icon: 'business-outline',           color: '#e0f2fe', iconColor: '#0369a1', onPress: () => nav.navigate('Facility') },
        { key: 'users',         label: 'Users',        icon: 'people-circle-outline',      color: '#f1f5f9', iconColor: '#475569', onPress: () => nav.navigate('Users') },
      ]}
    />
  );
};

const FacilityAdminMenuStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Menu"          component={FacilityAdminMenu} />
    <Stack.Screen name="CasesTab"      component={CasesStack} />
    <Stack.Screen name="PatientsTab"   component={PatientsStack} />
    <Stack.Screen name="Referrals"     component={ReferralsStack} />
    <Stack.Screen name="Consultations" component={ConsultationsStack} />
    <Stack.Screen name="Transport"     component={TransportScreen} />
    <Stack.Screen name="Facility"      component={FacilityScreen} />
    <Stack.Screen name="Users"         component={UsersScreen} />
  </Stack.Navigator>
);

const FacilityAdminTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="MenuTab"   component={FacilityAdminMenuStack} options={{ title: 'Menu', tabBarIcon: icon('grid-outline') }} />
    <Tab.Screen name="Dashboard" component={DashboardScreen}        options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}          options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Driver ------------------------------------------------------------------------------
const DriverMenu = () => {
  const nav = useNavigation();
  return (
    <MenuScreen
      subtitle="Everything else, in one place"
      items={[
        { key: 'dispatches', label: 'Dispatches', icon: 'car-outline', color: '#ffe4e6', iconColor: '#be123c', onPress: () => nav.navigate('Transport') },
      ]}
    />
  );
};

const DriverMenuStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Menu"      component={DriverMenu} />
    <Stack.Screen name="Transport" component={MyDispatchesScreen} />
  </Stack.Navigator>
);

const DriverTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="MenuTab"   component={DriverMenuStack} options={{ title: 'Menu', tabBarIcon: icon('grid-outline') }} />
    <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}   options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Superadmin ------------------------------------------------------------------------
const SuperadminMenu = () => {
  const nav = useNavigation();
  return (
    <MenuScreen
      subtitle="Everything else, in one place"
      items={[
        { key: 'cases',         label: 'Cases',        icon: 'medical-outline',           color: '#dcfce7', iconColor: '#16a34a', onPress: () => nav.navigate('CasesTab') },
        { key: 'patients',      label: 'Patients',     icon: 'people-outline',             color: '#dbeafe', iconColor: '#1d4ed8', onPress: () => nav.navigate('PatientsTab') },
        { key: 'referrals',     label: 'Referrals',    icon: 'swap-horizontal-outline',    color: '#fef3c7', iconColor: '#d97706', onPress: () => nav.navigate('Referrals') },
        { key: 'consultations', label: 'Consults',     icon: 'chatbubbles-outline',        color: '#ede9fe', iconColor: '#6d28d9', onPress: () => nav.navigate('Consultations') },
        { key: 'transport',     label: 'Transport',    icon: 'car-outline',                color: '#ffe4e6', iconColor: '#be123c', onPress: () => nav.navigate('Transport') },
        { key: 'facilities',    label: 'Facilities',   icon: 'business-outline',           color: '#e0f2fe', iconColor: '#0369a1', onPress: () => nav.navigate('Facilities') },
        { key: 'specialists',   label: 'Specialists',  icon: 'medkit-outline',             color: '#dcf1e6', iconColor: '#207652', onPress: () => nav.navigate('Specialists') },
        { key: 'users',         label: 'Users',        icon: 'people-circle-outline',      color: '#f1f5f9', iconColor: '#475569', onPress: () => nav.navigate('Users') },
      ]}
    />
  );
};

const SuperadminMenuStack = () => (
  <Stack.Navigator screenOptions={NO_HEADER}>
    <Stack.Screen name="Menu"          component={SuperadminMenu} />
    <Stack.Screen name="CasesTab"      component={SuperadminCasesStack} />
    <Stack.Screen name="PatientsTab"   component={PatientsStack} />
    <Stack.Screen name="Referrals"     component={ReferralsStack} />
    <Stack.Screen name="Consultations" component={ConsultationsStack} />
    <Stack.Screen name="Transport"     component={TransportScreen} />
    <Stack.Screen name="Facilities"    component={FacilitiesScreen} />
    <Stack.Screen name="Specialists"   component={SpecialistsScreen} />
    <Stack.Screen name="Users"         component={UsersScreen} />
  </Stack.Navigator>
);

const SuperadminTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="MenuTab"   component={SuperadminMenuStack} options={{ title: 'Menu', tabBarIcon: icon('grid-outline') }} />
    <Tab.Screen name="Dashboard" component={DashboardScreen}     options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}       options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Patient (portal user) ---------------------------------------------------------------
// Only ever had 2 items (Portal + Profile) -- already compact, no Menu needed.
// "Portal" (pregnancy/cycle tracker etc.) is promoted to the Home slot.
const PatientTabs = () => (
  <Tab.Navigator screenOptions={TAB_OPTIONS}>
    <Tab.Screen name="Dashboard" component={PatientPortalScreen} options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
    <Tab.Screen name="Profile"   component={ProfileScreen}       options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
  </Tab.Navigator>
);

// --- Root Navigator ------------------------------------------------------------------------
const RootNavigator = () => {
  const { isAuthenticated, userRole, loading } = useAuth();
  usePushNotifications(isAuthenticated);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (!isAuthenticated) return <AuthStack />;

  const RoleTabs = {
    health_worker:  HealthWorkerTabs,
    specialist:     SpecialistTabs,
    facility_admin: FacilityAdminTabs,
    driver:         DriverTabs,
    superadmin:     SuperadminTabs,
    patient:        PatientTabs,
  }[userRole] || HealthWorkerTabs;

  return (
    <>
      <RoleTabs />
      <NotificationBell />
      <SyncQueueBell />
      <VoiceLanguagePicker />
      <AssistantWidget />
    </>
  );
};

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
});

export default RootNavigator;

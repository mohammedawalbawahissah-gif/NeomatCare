# NeoMatCare Mobile

React Native / Expo mobile app — rebuilt to exactly match the NeoMatCare web frontend.

## Setup

### 1. Copy these files into your existing mobile project
Replace everything in `src/` and the root config files with this rebuild.

### 2. Install dependencies
```bash
npm install
```

### 3. Set your backend URL
Create a `.env` file at the project root:
```
EXPO_PUBLIC_API_URL=http://your-backend-url/api
```
Or edit `src/api/client.js` line 7 directly.

### 4. Start the app
```bash
npx expo start
```

---

## File structure

```
neomatcare-mobile/
├── App.jsx                          ← Root (NavigationContainer + AuthProvider)
├── app.json
├── package.json
├── babel.config.js
└── src/
    ├── api/
    │   └── client.js                ← Axios + JWT interceptors + all API modules
    ├── constants/
    │   ├── colors.js                ← Full color system matching frontend tailwind.config.js
    │   └── theme.js                 ← Typography, spacing, radius, shadows
    ├── contexts/
    │   └── AuthContext.jsx          ← Auth state, login, logout, role routing
    ├── hooks/
    │   └── usePushNotifications.js
    ├── navigation/
    │   └── RootNavigator.jsx        ← Auth stack + role-based tab navigators
    ├── components/
    │   ├── ui/
    │   │   └── index.jsx            ← Button, Badge, Card, Input, Select, Modal, Spinner, etc.
    │   └── layout/
    │       └── ScreenWrapper.jsx    ← Safe area wrapper + screen headers
    └── screens/
        ├── auth/
        │   ├── LoginScreen.jsx
        │   └── RegisterScreen.jsx
        ├── dashboard/
        │   └── DashboardScreen.jsx
        ├── health-worker/
        │   ├── CasesScreen.jsx
        │   └── CaseDetailScreen.jsx
        ├── referrals/
        │   └── ReferralsScreen.jsx  ← Used by health_worker + specialist
        ├── specialist/
        │   └── ConsultationsScreen.jsx
        ├── facility-admin/
        │   └── FacilityScreen.jsx
        ├── driver/
        │   └── TransportScreen.jsx
        ├── superadmin/
        │   ├── FacilitiesScreen.jsx
        │   └── UsersScreen.jsx
        └── shared/
            └── ProfileScreen.jsx
```

## Role routing (matches frontend App.jsx)

| Role            | Home tab       | Tabs                                    |
|-----------------|----------------|-----------------------------------------|
| health_worker   | Cases          | Cases → Case Detail, Referrals, Dashboard, Profile |
| specialist      | Consultations  | Consultations, Referrals, Dashboard, Profile |
| facility_admin  | Facility       | Facility, Dashboard, Profile            |
| driver          | Transport      | Transport, Dashboard, Profile           |
| superadmin      | Facilities     | Facilities, Users, Dashboard, Profile   |

## Design system (matches frontend exactly)

- Primary: `#0d9488` (teal-600)
- Secondary: `#0284c7` (sky-600)
- All status/role badge colors mirror `src/components/ui/index.jsx` from the web app
- Typography scale mirrors Tailwind font sizes

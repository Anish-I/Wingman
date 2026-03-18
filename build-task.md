# UI Rebuild Task

Read the current mobile app structure then implement these changes based on the Pencil designs.

## Design System
Update or create `mobile/constants/Theme.ts`:
```ts
export const Theme = {
  bg: '#0f0f1a',
  card: '#1a1a2e',
  border: '#2a2a4e',
  primary: '#6c63ff',
  teal: '#00d4d4',
  success: '#00c896',
  danger: '#ff4d6d',
  textPrimary: '#ffffff',
  textSecondary: '#8888aa',
  radius: { card: 16, button: 12, pill: 24 },
};
```

## Bottom Tab Bar (`mobile/app/(tabs)/_layout.tsx`)
- tabBarStyle: bg #1a1a2e, borderTopColor #2a2a4e, height 64
- tabBarActiveTintColor: #6c63ff
- tabBarInactiveTintColor: #8888aa
- Icons: Chat=MessageCircle, Apps=Grid2x2, Workflows=Zap, Settings=Settings (lucide-react-native or @expo/vector-icons)

## Screens to rebuild (UI only, keep all existing logic/API calls):

### mobile/app/onboarding/index.tsx
- Full dark bg #0f0f1a
- Pip mascot (pip-happy.png) 120px centered with teal glow ring (shadow/borderColor #00d4d4)
- 'Hey, I'm Pip!' white 28px bold
- 'Your AI-powered personal assistant' #8888aa 16px
- 'Get Started' button: full width, #6c63ff, white text, radius 12, fixed near bottom

### mobile/app/onboarding/phone.tsx  
- Back arrow top left
- 'Enter your number' white 24px bold
- 'We'll send a verification code' #8888aa
- Phone input card: #1a1a2e bg, radius 12, phone icon + text input
- 'Send Code' purple button full width bottom

### mobile/app/onboarding/verify.tsx (create if missing)
- Back arrow, 'Check your texts' h1
- Subtitle showing the phone number
- 4 OTP digit TextInput boxes in a row (64x64, 12px gap, #1a1a2e bg, focused border #6c63ff)
- Auto-advance on digit entry
- 'Resend code' tappable link #8888aa
- 'Verify' purple button

### mobile/app/onboarding/login.tsx (or signup.tsx - check existing)
- 'Wingman' wordmark 32px bold white centered
- Pip icon 100px with teal ring
- Google SSO button: white bg, dark text, Google icon, full width
- Apple SSO button: black bg, white text, Apple icon (Platform.OS === 'ios' only)
- OR divider with lines
- Phone input field
- 'Continue' purple button
- 'By continuing you agree to Terms & Privacy Policy' tiny #8888aa

### mobile/app/(tabs)/chat.tsx
- Header: Pip avatar (pip-icon.png 40px circle, teal border 2px), 'Pip' bold, purple dot status indicator
- FlatList messages: user bubbles (right, bg #6c63ff, white text, radius 16 no bottom-right), Pip bubbles (left, bg #1a1a2e, white border 1px rgba(255,255,255,0.1), radius 16 no bottom-left)
- Suggestion chips: horizontal ScrollView, each chip #1a1a2e border #2a2a4e radius 24 text #8888aa
- Input bar: #1a1a2e bg, TextInput white, send IconButton #6c63ff circle
- Empty state: pip-happy.png 80px, 'What can I help with?' white, 4 suggestion chips in 2x2 grid

### mobile/app/(tabs)/apps.tsx
- Header row: 'Your Apps' 20px bold white, search icon right
- Horizontal pill filter: All / Productivity / Communication / Calendar — active pill bg #6c63ff, inactive bg #1a1a2e border #2a2a4e
- App list rows (not grid): icon 44px + app name bold + category #8888aa + right side: green 'Connected' badge OR purple 'Connect' button
- Each row separated by #2a2a4e border

### mobile/app/(tabs)/workflows.tsx
- Header: 'Workflows' bold + purple circular FAB (+) top right
- Stats row: 3 pills (Total Runs #6c63ff, Active #00d4d4, Success % #00c896), each has number + label
- Workflow cards: #1a1a2e bg, radius 16, name bold + trigger badge (colored pill) + description #8888aa + toggle switch right
- Create modal: BottomSheet or Modal, name TextInput, trigger picker, action input, 'Create' button

### mobile/app/(tabs)/settings.tsx  
- Avatar circle 64px (initials or icon) + name bold + phone #8888aa
- Divider
- Setting rows: each row icon + label + right element (toggle or chevron or badge count)
  - Notifications (toggle)
  - Connected Apps (count badge)
  - Privacy Policy (chevron)
  - Help & Support (chevron)
- Divider
- 'Sign Out' row: red #ff4d6d text, no icon

## After all changes:
1. cd mobile && npx tsc --noEmit
2. Fix any TS errors
3. cd .. && git add -A && git commit -m "feat: full UI rebuild from Pencil designs - dark theme, bottom dock, all screens" && git push origin main
4. Report what was changed and any issues found

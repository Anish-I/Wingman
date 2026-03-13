import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VerifyRedirect() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  return <Redirect href={{ pathname: '/onboarding/phone', params: { phone } }} />;
}

import { useForm } from '@tanstack/react-form';

import * as React from 'react';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as z from 'zod';

import { Button, Input, View } from '@/components/ui';
import { StyleSheet, Text as RNText } from 'react-native';
import { getFieldError } from '@/components/ui/form-utils';
import { spacing } from '@/components/ui/tokens';

const schema = z.object({
  name: z.string().optional(),
  email: z
    .string({
      message: 'Email is required',
    })
    .min(1, 'Email is required')
    .email('Invalid email format'),
  password: z
    .string({
      message: 'Password is required',
    })
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export type FormType = z.infer<typeof schema>;

export type LoginFormProps = {
  onSubmit?: (data: FormType) => void;
};

export function LoginForm({ onSubmit = () => {} }: LoginFormProps) {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },

    validators: {
      onChange: schema as any,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <KeyboardAvoidingView
      style={formStyles.flex1}
      behavior="padding"
      keyboardVerticalOffset={10}
    >
      <View className="flex-1 justify-center bg-background" style={{ padding: spacing.lg }}>
        <View className="items-center justify-center">
          <RNText
            testID="form-title"
            className="text-center text-4xl font-bold text-foreground"
            style={{ paddingBottom: spacing['2xl'] }}
          >
            Sign In
          </RNText>

          <RNText className="mb-6 max-w-xs text-center text-muted-foreground">
            Welcome! 👋 This is a demo login screen! Feel free to use any email
            and password to sign in and try it out.
          </RNText>
        </View>

        <form.Field
          name="name"
          children={field => (
            <Input
              testID="name"
              label="Name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChangeText={field.handleChange}
              error={getFieldError(field)}
            />
          )}
        />

        <form.Field
          name="email"
          children={field => (
            <Input
              testID="email-input"
              label="Email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChangeText={field.handleChange}
              error={getFieldError(field)}
            />
          )}
        />

        <form.Field
          name="password"
          children={field => (
            <Input
              testID="password-input"
              label="Password"
              placeholder="***"
              secureTextEntry={true}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChangeText={field.handleChange}
              error={getFieldError(field)}
            />
          )}
        />

        <form.Subscribe
          selector={state => [state.isSubmitting]}
          children={([isSubmitting]) => (
            <Button
              testID="login-button"
              label="Login"
              onPress={form.handleSubmit}
              loading={isSubmitting}
            />
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const formStyles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
});

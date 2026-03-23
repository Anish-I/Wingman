/* eslint-disable react-refresh/only-export-components */
/**
 * Modal
 * Dependencies:
 * - @gorhom/bottom-sheet.
 *
 * Props:
 * - All `BottomSheetModalProps` props.
 * - `title` (string | undefined): Optional title for the modal header.
 *
 * Usage Example:
 * import { Modal, useModal } from '@gorhom/bottom-sheet';
 *
 * function DisplayModal() {
 *   const { ref, present, dismiss } = useModal();
 *
 *   return (
 *     <View>
 *       <Modal
 *         snapPoints={['60%']} // optional
 *         title="Modal Title"
 *         ref={ref}
 *       >
 *         Modal Content
 *       </Modal>
 *     </View>
 *   );
 * }
 *
 */

import type {
  BottomSheetBackdropProps,
  BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { BottomSheetModal, useBottomSheet } from '@gorhom/bottom-sheet';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';

import { Text } from './text';

/**
 * Focus trap hook for web accessibility.
 * Traps Tab/Shift+Tab within the given container so keyboard focus
 * cannot escape behind a modal overlay.
 */
function useFocusTrap(active: boolean) {
  const containerRef = React.useRef<View>(null);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;

    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;

    function getFocusableElements(root: HTMLElement): HTMLElement[] {
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements(el!);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // If focus escaped the modal container, pull it back
      if (!el!.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Move focus into the modal on mount
    const focusable = getFocusableElements(el);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      el.setAttribute('tabindex', '-1');
      el.focus();
    }

    // Attach to document so Tab presses are caught before focus moves away
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active]);

  return containerRef;
}

type ModalProps = BottomSheetModalProps & {
  title?: string;
};

type ModalRef = React.ForwardedRef<BottomSheetModal>;

type ModalHeaderProps = {
  title?: string;
  dismiss: () => void;
};

export function useModal() {
  const ref = React.useRef<BottomSheetModal>(null);
  const present = React.useCallback((data?: any) => {
    ref.current?.present(data);
  }, []);
  const dismiss = React.useCallback(() => {
    ref.current?.dismiss();
  }, []);
  return { ref, present, dismiss };
}

export function Modal({ ref, snapPoints: _snapPoints = ['60%'] as (string | number)[], title, detached = false, ...props }: ModalProps & { ref?: ModalRef }) {
  const detachedProps = React.useMemo(
    () => getDetachedProps(detached),
    [detached],
  );
  const modal = useModal();
  const snapPoints = React.useMemo(() => _snapPoints, [_snapPoints]);

  React.useImperativeHandle(
    ref,
    () => (modal.ref.current as BottomSheetModal) || null,
  );

  const renderHandleComponent = React.useCallback(
    () => (
      <>
        <View className="mt-2 mb-8 h-1 w-12 self-center rounded-lg bg-gray-400 dark:bg-gray-700" />
        <ModalHeader title={title} dismiss={modal.dismiss} />
      </>
    ),
    [title, modal.dismiss],
  );

  const focusTrapRef = useFocusTrap(true);

  return (
    <BottomSheetModal
      {...props}
      {...detachedProps}
      ref={modal.ref}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={props.backdropComponent || renderBackdrop}
      enableDynamicSizing={false}
      handleComponent={renderHandleComponent}
    >
      <View
        ref={focusTrapRef}
        style={{ flex: 1 }}
        accessibilityRole="none"
        {...(Platform.OS === 'web' ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        {props.children}
      </View>
    </BottomSheetModal>
  );
}

/**
 * Custom Backdrop
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CustomBackdrop({ style }: BottomSheetBackdropProps) {
  const { close } = useBottomSheet();
  return (
    <AnimatedPressable
      onPress={() => close()}
      entering={FadeIn.duration(50).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(20).reduceMotion(ReduceMotion.System)}
      style={[style, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}
      aria-hidden={true}
    />
  );
}

export function renderBackdrop(props: BottomSheetBackdropProps) {
  return <CustomBackdrop {...props} />;
}

/**
 *
 * @param detached
 * @returns
 *
 * @description
 * In case the modal is detached, we need to add some extra props to the modal to make it look like a detached modal.
 */

function getDetachedProps(detached: boolean) {
  if (detached) {
    return {
      detached: true,
      bottomInset: 46,
      style: { marginHorizontal: 16, overflow: 'hidden' },
    } as Partial<BottomSheetModalProps>;
  }
  return {} as Partial<BottomSheetModalProps>;
}

/**
 * ModalHeader
 */

const ModalHeader = React.memo(({ title, dismiss }: ModalHeaderProps) => {
  return (
    <>
      {title && (
        <View className="flex-row px-2 py-4">
          <View className="size-6" />
          <View className="flex-1">
            <Text className="text-center text-[16px] font-bold text-foreground">
              {title}
            </Text>
          </View>
        </View>
      )}
      <CloseButton close={dismiss} />
    </>
  );
});

function CloseButton({ close }: { close: () => void }) {
  return (
    <Pressable
      onPress={close}
      className="absolute top-3 right-3 size-6 items-center justify-center"
      hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      accessibilityLabel="close modal"
      accessibilityRole="button"
      accessibilityHint="closes the modal"
    >
      <Svg
        className="fill-neutral-300 dark:fill-white"
        width={24}
        height={24}
        fill="none"
        viewBox="0 0 24 24"
      >
        <Path d="M18.707 6.707a1 1 0 0 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12l5.293-5.293Z" />
      </Svg>
    </Pressable>
  );
}

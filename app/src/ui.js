import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors } from './config';

export function Button({ title, onPress, kind = 'primary', disabled, loading, small }) {
  const bg = kind === 'primary' ? colors.red : kind === 'dark' ? colors.ink : 'transparent';
  const fg = kind === 'ghost' ? colors.ink : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        kind === 'ghost' && styles.ghost,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnText, small && styles.btnTextSmall, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Sheet({ children, style }) {
  return <View style={[styles.sheet, style]}>{children}</View>;
}

export function Eyebrow({ children, color = colors.red }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function Title({ children }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children, style }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

// Small "- value +" control used for game settings.
export function Stepper({ label, value, display, onChange, step, min, max, disabled }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepCtrl}>
        <Pressable
          disabled={disabled || value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.stepBtn}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable
          disabled={disabled || value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.stepBtn}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtMin = (sec) => (sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`);

const styles = StyleSheet.create({
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnSmall: { height: 38, borderRadius: 19, paddingHorizontal: 14 },
  ghost: { borderWidth: 1.5, borderColor: colors.ink },
  btnText: { fontSize: 18, fontWeight: '700' },
  btnTextSmall: { fontSize: 14 },
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: 28,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  title: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -0.8, lineHeight: 34 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  stepLabel: { fontSize: 15, color: colors.ink },
  stepCtrl: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, fontWeight: '700', color: colors.ink },
  stepValue: { minWidth: 70, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.ink },
});

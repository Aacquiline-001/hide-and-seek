import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Sheet, Eyebrow, Title, Muted } from '../ui';
import { colors } from '../config';

const NAME_KEY = 'pursuit:name';

export default function HomeScreen({ connected, actions }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('choose'); // choose | join
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(NAME_KEY).then((n) => n && setName(n)).catch(() => {});
  }, []);

  async function run(fn) {
    setError(null);
    if (!name.trim()) return setError('Enter your name first');
    setBusy(true);
    AsyncStorage.setItem(NAME_KEY, name.trim()).catch(() => {});
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.hero}>
        <Text style={styles.logo}>PURSUIT</Text>
        <Text style={styles.tagline}>Hide and seek on real streets.</Text>
      </View>

      <Sheet>
        <Eyebrow>YOUR TURN</Eyebrow>
        <Title>Get 3 or more friends together.</Title>
        <Muted style={{ marginTop: 6, marginBottom: 16 }}>
          One of you hosts. Everyone else joins with a code.
        </Muted>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          maxLength={20}
          style={styles.input}
          placeholderTextColor={colors.muted}
        />

        {mode === 'join' && (
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Game code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            style={[styles.input, styles.codeInput]}
            placeholderTextColor={colors.muted}
          />
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {mode === 'choose' ? (
          <View style={{ gap: 12 }}>
            <Button title="Host a game" loading={busy} disabled={!connected} onPress={() => run(() => actions.host(name.trim()))} />
            <Button title="Join with a code" kind="dark" disabled={!connected} onPress={() => setMode('join')} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Button
              title="Join game"
              loading={busy}
              disabled={!connected || code.length < 5}
              onPress={() => run(() => actions.join(code, name.trim()))}
            />
            <Button title="Back" kind="ghost" onPress={() => { setMode('choose'); setError(null); }} />
          </View>
        )}

        <Muted style={styles.status}>
          {connected ? '● Connected to server' : '○ Connecting to server…'}
        </Muted>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16, justifyContent: 'flex-end', paddingBottom: 32 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 48, fontWeight: '900', color: colors.red, letterSpacing: 4 },
  tagline: { fontSize: 16, color: colors.ink, marginTop: 6 },
  input: {
    height: 52, borderRadius: 14, backgroundColor: colors.bg, paddingHorizontal: 16,
    fontSize: 17, color: colors.ink, marginBottom: 12,
  },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  error: { color: colors.red, marginBottom: 10, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 14, textAlign: 'center' },
});

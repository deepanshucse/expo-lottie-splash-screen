import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { hideAsync, isVisible, useHideAnimation } from 'expo-lottie-splash-screen';

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [status, setStatus] = useState('Splash is showing…');
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // Simulate app initialisation (e.g. fonts, auth check)
  useEffect(() => {
    async function init() {
      addLog('App initialising…');
      await new Promise((r) => setTimeout(r, 1500)); // simulate async work
      addLog('Resources loaded.');
      setAppReady(true);
    }
    init();
  }, []);

  // Pattern A: hideAsync() directly
  // Uncomment this block and comment out Pattern B to switch modes.
  //
  // useEffect(() => {
  //   if (appReady) {
  //     hideAsync({ fade: true }).then(() => {
  //       setStatus('Hidden via hideAsync()');
  //       addLog('Splash hidden (hideAsync).');
  //     });
  //   }
  // }, [appReady]);

  // Pattern B: useHideAnimation() hook
  // Gives you a JS-driven fade-out after the native splash is removed.
  const overlayOpacity = useRef(new Animated.Value(isVisible() ? 1 : 0)).current;
  const [showJsOverlay, setShowJsOverlay] = useState(isVisible());

  const { opacity } = useHideAnimation({
    ready: appReady,
    animate: () => {
      addLog('Running JS exit animation…');
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setShowJsOverlay(false);
        setStatus('Hidden via useHideAnimation()');
        addLog('JS overlay removed.');
      });
    },
  });

  return (
    <SafeAreaView style={styles.root}>
      {showJsOverlay && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayOpacity }]} />
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>expo-lottie-splash-screen</Text>
          <Text style={styles.subtitle}>Example App</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <Text style={styles.statusText}>{status}</Text>

          <View style={styles.row}>
            <Text style={styles.cardLabel}>isVisible()</Text>
            <View style={[styles.badge, isVisible() ? styles.badgeOn : styles.badgeOff]}>
              <Text style={styles.badgeText}>{isVisible() ? 'true' : 'false'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Manual Controls</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              hideAsync({ fade: true }).then(() => {
                setStatus('Manually hidden with fade');
                addLog('hideAsync({ fade: true }) called.');
              });
            }}
          >
            <Text style={styles.buttonText}>hideAsync(&#123; fade: true &#125;)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => {
              hideAsync({ fade: false }).then(() => {
                setStatus('Manually hidden instantly');
                addLog('hideAsync({ fade: false }) called.');
              });
            }}
          >
            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
              hideAsync(&#123; fade: false &#125;)
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Event Log</Text>
          {log.length === 0 && <Text style={styles.emptyLog}>No events yet.</Text>}
          {log.map((entry, i) => (
            <Text key={i} style={styles.logEntry}>{entry}</Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>API Quick Reference</Text>
          {API_DOCS.map((item) => (
            <View key={item.name} style={styles.apiItem}>
              <Text style={styles.apiName}>{item.name}</Text>
              <Text style={styles.apiDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const API_DOCS = [
  {
    name: 'hideAsync({ fade? })',
    desc: 'Hides the Lottie splash. Resolves when the view is removed. Call when your app is ready.',
  },
  {
    name: 'isVisible()',
    desc: 'Returns true if the native Lottie overlay is still on screen.',
  },
  {
    name: 'useHideAnimation({ ready, animate })',
    desc: 'Hook that calls animate() after the native splash is hidden. Use for custom JS exit transitions.',
  },
  {
    name: 'autoHide (app.json)',
    desc: 'Set autoHide: true in the plugin config to hide automatically when the animation ends — no JS code needed.',
  },
];

const BRAND = '#6C63FF';
const DARK = '#1A1A2E';
const CARD_BG = '#FFFFFF';
const MUTED = '#6B7280';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  scroll: { padding: 20, gap: 16 },
  overlay: { backgroundColor: DARK, zIndex: 100 },

  header: { alignItems: 'center', paddingVertical: 24 },
  title: { fontSize: 22, fontWeight: '700', color: DARK, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: MUTED, marginTop: 4 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8 },

  statusText: { fontSize: 16, fontWeight: '600', color: DARK },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeOn: { backgroundColor: '#D1FAE5' },
  badgeOff: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 13, fontWeight: '600' },

  button: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonSecondary: { backgroundColor: '#EEF2FF' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  buttonTextSecondary: { color: BRAND },

  emptyLog: { color: MUTED, fontSize: 13 },
  logEntry: { fontSize: 12, color: '#374151', fontFamily: 'monospace' },

  apiItem: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  apiName: { fontSize: 13, fontWeight: '700', color: DARK, fontFamily: 'monospace' },
  apiDesc: { fontSize: 13, color: MUTED, marginTop: 2 },
});

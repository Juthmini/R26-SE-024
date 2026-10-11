import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { AI_URL, CameraSource, speak } from '../../../../services/memoryAI';
import { Esp32Art } from './Illustrations';

export const ROOMS: { en: string; si: string; emoji: string }[] = [
  { en: 'Living room', si: 'සාලය', emoji: '🛋️' },
  { en: 'Kitchen', si: 'කුස්සිය', emoji: '🍳' },
  { en: 'Bedroom', si: 'නිදන කාමරය', emoji: '🛏️' },
  { en: 'Dining room', si: 'කෑම කාමරය', emoji: '🍽️' },
  { en: 'Bathroom', si: 'නාන කාමරය', emoji: '🛁' },
  { en: 'Hallway', si: 'ඉස්තෝප්පුව', emoji: '🚪' },
];

export const roomSi = (en?: string) => ROOMS.find((r) => r.en === en)?.si || en || '';

type Camera = { ip: string; rssi?: number };
type Phase = 'searching' | 'found' | 'notfound';

const signal = (rssi?: number) => {
  if (rssi == null) return { bars: 2, label: 'සම්බන්ධයි' };
  if (rssi > -55) return { bars: 4, label: 'ඉතා හොඳ සංඥාව' };
  if (rssi > -67) return { bars: 3, label: 'හොඳ සංඥාව' };
  if (rssi > -78) return { bars: 2, label: 'සාමාන්‍ය සංඥාව' };
  return { bars: 1, label: 'දුර්වල සංඥාව - හොට්ස්පොට් එකට ළං කරන්න' };
};

// Finds the MemoCare camera on the Wi-Fi by itself (the AI server sweeps the
// network) - nobody has to know or type an IP address.
export default function Esp32ConnectSheet({ visible, current, onClose, onConnected }: {
  visible: boolean;
  current: CameraSource;
  onClose: () => void;
  onConnected: (cfg: CameraSource) => void;
}) {
  const [phase, setPhase] = useState<Phase>('searching');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [picked, setPicked] = useState<Camera | null>(null);
  const [room, setRoom] = useState(current.room || 'Living room');
  const [tick, setTick] = useState(0);
  const [previewOk, setPreviewOk] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  // Phase offsets so the three radar rings are spread out in time.
  const offsets = useRef([0, 1 / 3, 2 / 3].map((v) => new Animated.Value(v))).current;

  const search = async () => {
    setPhase('searching');
    setPreviewOk(false);
    try {
      const res = await axios.get(`${AI_URL}/esp32/discover`, { timeout: 25000 });
      const cams: Camera[] = res.data.cameras || [];
      setCameras(cams);
      if (cams.length) {
        setPicked(cams.find((c) => c.ip === current.esp32Ip) || cams[0]);
        setPhase('found');
      } else {
        setPhase('notfound');
      }
    } catch {
      setPhase('notfound');
    }
  };

  useEffect(() => {
    if (visible) {
      setRoom(current.room || 'Living room');
      search();
    }
  }, [visible]);

  // Radar rings while searching.
  useEffect(() => {
    if (phase !== 'searching') return;
    pulse.setValue(0);
    const loop = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  // Live preview: refresh the snapshot a few times a second.
  useEffect(() => {
    if (!visible || phase !== 'found') return;
    const t = setInterval(() => setTick((n) => n + 1), 700);
    return () => clearInterval(t);
  }, [visible, phase]);

  const useCamera = () => {
    if (!picked) return;
    onConnected({ source: 'esp32', esp32Ip: picked.ip, room });
    speak(`ESP32 කැමරාව ${roomSi(room)}ට සම්බන්ධ කළා.`);
    onClose();
  };

  const sig = signal(picked?.rssi);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grabber} />
          <View style={s.head}>
            <View style={s.headIcon}><Esp32Art size={40} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>ESP32 කැමරාව</Text>
              <Text style={s.sub}>Wi-Fi කැමරාව ඉබේම හොයාගන්නවා</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={onClose}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {phase === 'searching' && (
            <View style={s.center}>
              <View style={s.radar}>
                {offsets.map((offset, i) => {
                  const p = Animated.modulo(Animated.add(pulse, offset), 1);
                  return (
                    <Animated.View key={i} style={[s.ring, {
                      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                      transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }],
                    }]} />
                  );
                })}
                <View style={s.radarCore}><Esp32Art size={54} /></View>
              </View>
              <Text style={s.bigText}>කැමරාව හොයනවා...</Text>
              <Text style={s.smallText}>Searching your Wi-Fi for the MemoCare camera</Text>
            </View>
          )}

          {phase === 'found' && picked && (
            <>
              <View style={s.preview}>
                <Image
                  source={{ uri: `${AI_URL}/esp32/snapshot?ip=${picked.ip}&t=${tick}` }}
                  style={s.previewImg}
                  onLoad={() => setPreviewOk(true)}
                  fadeDuration={0}
                />
                {!previewOk && (
                  <View style={[StyleSheet.absoluteFill, s.previewWait]}>
                    <Text style={s.previewWaitText}>පින්තූරය එනවා...</Text>
                  </View>
                )}
                <View style={s.liveBadge}>
                  <View style={s.liveDot} />
                  <Text style={s.liveText}>LIVE</Text>
                </View>
                <View style={s.signalBadge}>
                  <View style={s.bars}>
                    {[1, 2, 3, 4].map((b) => (
                      <View key={b} style={[s.bar, { height: 4 + b * 3 }, b <= sig.bars && s.barOn]} />
                    ))}
                  </View>
                  <Text style={s.signalText}>{sig.label}</Text>
                </View>
              </View>

              {cameras.length > 1 && (
                <View style={s.camList}>
                  {cameras.map((c, i) => (
                    <TouchableOpacity key={c.ip} style={[s.camChip, picked.ip === c.ip && s.camChipOn]} onPress={() => { setPicked(c); setPreviewOk(false); }}>
                      <Text style={[s.camChipText, picked.ip === c.ip && { color: '#fff' }]}>කැමරාව {i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={s.label}>මේ කැමරාව තියෙන්නේ කොහෙද?</Text>
              <View style={s.rooms}>
                {ROOMS.map((r) => (
                  <TouchableOpacity key={r.en} style={[s.room, room === r.en && s.roomOn]} onPress={() => setRoom(r.en)} activeOpacity={0.8}>
                    <Text style={s.roomEmoji}>{r.emoji}</Text>
                    <Text style={[s.roomText, room === r.en && s.roomTextOn]}>{r.si}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={s.primary} onPress={useCamera} activeOpacity={0.9}>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={s.primaryText}>මේ කැමරාව භාවිතා කරන්න</Text>
              </TouchableOpacity>
              <Text style={s.foot}>Found automatically · {picked.ip}</Text>
            </>
          )}

          {phase === 'notfound' && (
            <View style={s.center}>
              <View style={[s.radarCore, s.radarCoreOff]}><Esp32Art size={54} /></View>
              <Text style={s.bigText}>කැමරාව හම්බුණේ නැහැ</Text>
              <View style={s.tips}>
                <Tip icon="battery-charging" text="කැමරාව power bank එකකට ගහලා තත්පර 30ක් ඉන්න" />
                <Tip icon="wifi" text="ලැප්ටොප් එකයි කැමරාවයි එකම hotspot එකේ තියෙන්න ඕනේ" />
                <Tip icon="settings" text='iPhone: Personal Hotspot → "Maximize Compatibility" ON' />
              </View>
              <TouchableOpacity style={s.primary} onPress={search} activeOpacity={0.9}>
                <Ionicons name="refresh" size={22} color="#fff" />
                <Text style={s.primaryText}>ආයෙත් හොයන්න</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Tip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.tip}>
      <View style={s.tipIcon}><Ionicons name={icon} size={18} color="#0f766e" /></View>
      <Text style={s.tipText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#0f766e', fontWeight: '700' },
  close: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },

  center: { alignItems: 'center', paddingVertical: 10, gap: 8 },
  radar: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  ring: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: '#14b8a6' },
  radarCore: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#5eead4' },
  radarCoreOff: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginBottom: 6 },
  bigText: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  smallText: { fontSize: 13, color: '#64748b', fontWeight: '600' },

  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 24, overflow: 'hidden', backgroundColor: '#0f172a', marginBottom: 14 },
  previewImg: { width: '100%', height: '100%' },
  previewWait: { alignItems: 'center', justifyContent: 'center' },
  previewWaitText: { color: '#cbd5e1', fontWeight: '700' },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ef4444' },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  signalBadge: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  barOn: { backgroundColor: '#4ade80' },
  signalText: { color: '#fff', fontWeight: '700', fontSize: 12, flex: 1 },

  camList: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  camChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0' },
  camChipOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  camChipText: { fontWeight: '800', color: '#334155' },

  label: { fontSize: 15, fontWeight: '900', color: '#334155', marginBottom: 10 },
  rooms: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  room: { width: '31.5%', alignItems: 'center', paddingVertical: 10, borderRadius: 18, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  roomOn: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' },
  roomEmoji: { fontSize: 24 },
  roomText: { marginTop: 2, fontWeight: '800', color: '#475569', fontSize: 13 },
  roomTextOn: { color: '#0f766e' },

  primary: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f766e', borderRadius: 20, paddingVertical: 17, marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  foot: { textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: '600', marginTop: 10 },

  tips: { alignSelf: 'stretch', gap: 10, marginVertical: 12 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', borderRadius: 16, padding: 12 },
  tipIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#ccfbf1', alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, color: '#334155', fontWeight: '600', lineHeight: 20 },
});

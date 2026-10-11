import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import {
  AI_URL, FamilyAlert, Person, clearCaregiverPin, getCaregiverPin, getPatientId, getPatientName, setCaregiverPin, timeAgo,
} from '../../../services/memoryAI';
import { PeopleArt } from './findThings/Illustrations';

type Gate = 'loading' | 'set' | 'enter' | 'open';

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  return f;
};
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 15000 };

export default function FamilyUI() {
  const router = useRouter();
  const [pid, setPid] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  // Always show WHOSE family this is - a wrong patient here once saved a grandson to another patient.
  React.useEffect(() => { getPatientName().then(setPatientName).catch(() => {}); }, []);
  const [gate, setGate] = useState<Gate>('loading');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinError, setPinError] = useState('');
  const [verified, setVerified] = useState<Person[]>([]);
  const [pending, setPending] = useState<Person[]>([]);
  const [alerts, setAlerts] = useState<FamilyAlert[]>([]);
  const [allVisitors, setAllVisitors] = useState(false);

  const loadFamily = useCallback(async (id: string) => {
    try {
      const res = await axios.get(`${AI_URL}/family/${id}`, { timeout: 10000 });
      setVerified(res.data.verified || []);
      setPending(res.data.pending || []);
      setAlerts(res.data.alerts || []);
      axios.get(`${AI_URL}/family/consent-all/${id}`, { timeout: 8000 }).then((r) => setAllVisitors(!!r.data.on)).catch(() => {});
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const id = await getPatientId();
        setPid(id);
        if (!id) return;
        if (getCaregiverPin()) {
          setGate('open');
          loadFamily(id);
          return;
        }
        try {
          const res = await axios.get(`${AI_URL}/family/pin-status/${id}`, { timeout: 10000 });
          setGate(res.data.has_pin ? 'enter' : 'set');
        } catch {
          setGate('enter');
        }
      })();
    }, [loadFamily]),
  );

  const submitPin = async () => {
    if (!pid) return;
    setPinError('');
    if (gate === 'set') {
      if (!/^\d{4,6}$/.test(pin)) return setPinError('ඉලක්කම් 4-6ක PIN එකක් දාන්න');
      if (pin !== pin2) return setPinError('PIN දෙක ගැලපෙන්නේ නැහැ');
      const res = await axios.post(`${AI_URL}/family/pin`, form({ patient_id: pid, pin }), MULTIPART);
      if (res.data.status !== 'success') return setPinError(res.data.message);
    } else {
      const res = await axios.post(`${AI_URL}/family/pin/verify`, form({ patient_id: pid, pin }), MULTIPART);
      if (!res.data.ok) return setPinError('PIN එක වැරදියි');
    }
    setCaregiverPin(pin);
    setPin('');
    setPin2('');
    setGate('open');
    loadFamily(pid);
  };

  const review = async (p: Person, action: 'approve' | 'reject') => {
    const cur = getCaregiverPin();
    if (!pid || !cur) return setGate('enter');
    await axios.post(`${AI_URL}/family/review`, form({ patient_id: pid, pin: cur, person_id: p.id, action }), MULTIPART).catch(() => {});
    loadFamily(pid);
  };

  const remove = (p: Person) => {
    Alert.alert('Remove', `${p.name} (${p.relation_si}) ඉවත් කරන්නද?`, [
      { text: 'නැහැ', style: 'cancel' },
      {
        text: 'ඔව්', style: 'destructive',
        onPress: async () => {
          const cur = getCaregiverPin();
          if (!pid || !cur) return setGate('enter');
          await axios.delete(`${AI_URL}/people/${pid}/${p.id}`, { params: { pin: cur } }).catch(() => {});
          loadFamily(pid);
        },
      },
    ]);
  };

  // Consent is the family member's own choice - the caregiver records it here (PIN-protected).
  const toggleTalk = (p: Person) => {
    const allow = !p.conversation_ok;
    const save = async () => {
      const cur = getCaregiverPin();
      if (!pid || !cur) return setGate('enter');
      await axios.post(`${AI_URL}/family/consent`,
        form({ patient_id: pid, pin: cur, person_id: p.id, allow: allow ? 'true' : 'false' }), MULTIPART).catch(() => {});
      loadFamily(pid);
    };
    if (!allow) return save();
    Alert.alert(
      'කතාබහ සාරාංශ කරන්න අවසරද?',
      `${p.name} (${p.relation_si}) රෝගියා බලන්න ආවම කතා කරන දේවල් app එක අහලා කෙටි සාරාංශයක් විතරක් තියාගන්නවා. ` +
        'Audio එක save වෙන්නේ නැහැ. මේකට එයාගේ අවසරය ගත්තද?',
      [{ text: 'නැහැ', style: 'cancel' }, { text: 'ඔව්, අවසර තියෙනවා', onPress: save }],
    );
  };

  const toggleAllVisitors = () => {
    const allow = !allVisitors;
    const save = async () => {
      const cur = getCaregiverPin();
      if (!pid || !cur) return setGate('enter');
      const r = await axios.post(`${AI_URL}/family/consent-all`,
        form({ patient_id: pid, pin: cur, allow: allow ? 'true' : 'false' }), MULTIPART).catch(() => null);
      if (r?.data?.status === 'success') setAllVisitors(allow);
    };
    if (!allow) return save();
    Alert.alert(
      'සියලුම අමුත්තන්ගේ කතාබහ?',
      'ලියාපදිංචි නැති අය (අසල්වැසියන්, යාළුවෝ) ආවත් කතා කරන දේවල් කෙටි සාරාංශයක් විදිහට තියාගන්නවා. ' +
        'Audio save වෙන්නේ නැහැ, කැමරා තිරයේ "අහගෙන ඉන්නවා" ලකුණ පේනවා. අමුත්තන්ට මේ ගැන කියන්න.',
      [{ text: 'නැහැ', style: 'cancel' }, { text: 'ඔව්, දාන්න', onPress: save }],
    );
  };

  const markAlertsSeen = async () => {
    const cur = getCaregiverPin();
    if (!pid || !cur) return;
    await axios.post(`${AI_URL}/family/alerts/seen`, form({ patient_id: pid, pin: cur }), MULTIPART).catch(() => {});
    loadFamily(pid);
  };

  const header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#0f172a" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>පවුලේ අය</Text>
        <Text style={s.sub}>{patientName ? `👤 ${patientName} ගේ පවුල` : 'Family registration · caregiver'}</Text>
      </View>
      {gate === 'open' && (
        <TouchableOpacity style={s.lockBtn} onPress={() => { clearCaregiverPin(); setGate('enter'); }}>
          <Ionicons name="lock-closed" size={20} color="#0f172a" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (gate === 'loading') {
    return <SafeAreaView style={s.container}>{header}<ActivityIndicator style={{ marginTop: 40 }} /></SafeAreaView>;
  }

  if (gate !== 'open') {
    return (
      <SafeAreaView style={s.container}>
        {header}
        <View style={s.pinCard}>
          <Ionicons name="shield-checkmark" size={52} color="#0f766e" />
          <Text style={s.pinTitle}>{gate === 'set' ? 'Caregiver PIN එකක් හදන්න' : 'Caregiver PIN එක දාන්න'}</Text>
          <Text style={s.pinHelp}>
            පවුලේ අය ලියාපදිංචි කරන්න පුළුවන් caregiver ට විතරයි - එතකොට බොරුවට කෙනෙක්ට "පුතා" විදිහට ලියාපදිංචි වෙන්න බැහැ.
          </Text>
          <TextInput style={s.pinInput} value={pin} onChangeText={setPin} placeholder="••••" placeholderTextColor="#94a3b8"
            keyboardType="number-pad" secureTextEntry maxLength={6} />
          {gate === 'set' && (
            <TextInput style={s.pinInput} value={pin2} onChangeText={setPin2} placeholder="ආයෙත් දාන්න"
              placeholderTextColor="#94a3b8" keyboardType="number-pad" secureTextEntry maxLength={6} />
          )}
          {!!pinError && <Text style={s.err}>{pinError}</Text>}
          <TouchableOpacity style={s.primary} onPress={submitPin}>
            <Text style={s.primaryText}>{gate === 'set' ? 'PIN එක හදන්න' : 'ඇතුළු වෙන්න'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const unseen = alerts.filter((a) => !a.seen);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {header}

        <TouchableOpacity style={s.addCard} onPress={() => router.push('/patient/family-enroll' as any)} activeOpacity={0.85}>
          <PeopleArt size={70} />
          <View style={{ flex: 1 }}>
            <Text style={s.addTitle}>අලුත් කෙනෙක් එකතු කරන්න</Text>
            <Text style={s.addSub}>Live camera එකෙන් මුහුණේ photos 4ක් ගන්නවා</Text>
          </View>
          <View style={s.plus}><Ionicons name="add" size={28} color="#fff" /></View>
        </TouchableOpacity>

        {unseen.length > 0 && (
          <View style={s.alertBox}>
            <View style={s.alertHead}>
              <Ionicons name="warning" size={22} color="#b91c1c" />
              <Text style={s.alertTitle}>ආරක්ෂක අනතුරු ඇඟවීම් ({unseen.length})</Text>
              <TouchableOpacity onPress={markAlertsSeen}><Text style={s.alertDismiss}>OK</Text></TouchableOpacity>
            </View>
            {unseen.map((a) => (
              <View key={a.id} style={s.alertRow}>
                <Image source={{ uri: a.photo_url }} style={s.alertImg} />
                <View style={{ flex: 1 }}>
                  <Text style={s.alertText}>
                    {a.kind === 'unknown_visitor'
                      ? 'නොදන්නා කෙනෙක් රෝගියා එක්ක තත්පර 30කට වඩා හිටියා (ESP32 camera).'
                      : `කෙනෙක් "${a.claimed_si}" කියලා කිව්වා, ඒත් මුහුණ ලියාපදිංචි ${a.registered_name ? `${a.registered_name}ට` : 'කෙනාට'} ගැලපෙන්නේ නැහැ.`}
                  </Text>
                  <Text style={s.alertMeta}>{timeAgo(a.time)}{a.said ? ` · "${a.said}"` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {pending.length > 0 && (
          <>
            <Text style={s.section}>තහවුරු කරන්න ඕනේ ({pending.length})</Text>
            {pending.map((p) => (
              <View key={p.id} style={s.pendingRow}>
                <Image source={{ uri: p.photo_url }} style={s.pendingImg} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingName}>{p.relation_si}{p.name && p.name !== p.relation_si ? ` · ${p.name}` : ''}</Text>
                  {!!p.said && <Text style={s.pendingSaid}>කිව්වේ: "{p.said}"</Text>}
                  <Text style={s.pendingSaid}>{timeAgo(p.created || p.last_seen || '')}</Text>
                </View>
                <TouchableOpacity style={[s.reviewBtn, { backgroundColor: '#16a34a' }]} onPress={() => review(p, 'approve')}>
                  <Ionicons name="checkmark" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.reviewBtn, { backgroundColor: '#dc2626' }]} onPress={() => review(p, 'reject')}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <TouchableOpacity style={[s.allCard, allVisitors && s.allCardOn]} onPress={toggleAllVisitors} activeOpacity={0.85}>
          <Ionicons name={allVisitors ? 'mic' : 'mic-off'} size={24} color={allVisitors ? '#fff' : '#0f766e'} />
          <View style={{ flex: 1 }}>
            <Text style={[s.allTitle, allVisitors && { color: '#fff' }]}>සියලුම අමුත්තන්ගේ කතාබහ</Text>
            <Text style={[s.allSub, allVisitors && { color: '#ccfbf1' }]}>
              {allVisitors ? 'ඕනෑම කෙනෙක් ආවත් කතාව සාරාංශ කරනවා' : 'දැන් අවසර දීපු පවුලේ අයගේ විතරයි'}
            </Text>
          </View>
          <Text style={[s.allState, allVisitors && { color: '#fff' }]}>{allVisitors ? 'ON' : 'OFF'}</Text>
        </TouchableOpacity>

        <Text style={s.section}>ලියාපදිංචි පවුලේ අය ({verified.length})</Text>
        {verified.length === 0 ? (
          <Text style={s.empty}>තවම කවුරුත් නැහැ. උඩ තියෙන බොත්තමෙන් එකතු කරන්න.</Text>
        ) : (
          <View style={s.grid}>
            {verified.map((p) => (
              <TouchableOpacity key={p.id} style={s.card} onLongPress={() => remove(p)} activeOpacity={0.9}>
                <Image source={{ uri: p.photo_url }} style={s.photo} />
                <Text style={s.rel}>{p.relation_si}</Text>
                {p.name && p.name !== p.relation_si ? <Text style={s.name}>{p.name}</Text> : null}
                <Text style={s.meta}>🧠 මුහුණු {p.face_samples || 0}ක්</Text>
                <TouchableOpacity onPress={() => toggleTalk(p)}
                  style={[s.talkChip, p.conversation_ok && { backgroundColor: '#0f766e', borderColor: '#0f766e' }]}>
                  <Ionicons name={p.conversation_ok ? 'mic' : 'mic-off'} size={13} color={p.conversation_ok ? '#fff' : '#64748b'} />
                  <Text style={[s.talkChipText, p.conversation_ok && { color: '#fff' }]}>
                    {p.conversation_ok ? 'කතාබහ: අවසර ඇත' : 'කතාබහ: අවසර නැත'}
                  </Text>
                </TouchableOpacity>
                {p.enrolled && <View style={s.badge}><Ionicons name="shield-checkmark" size={14} color="#fff" /></View>}
              </TouchableOpacity>
            ))}
          </View>
        )}
        {verified.length > 0 && <Text style={s.tip}>Long-press to remove</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0fdfa' },
  scroll: { padding: 20, paddingBottom: 48 },
  allCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18, padding: 14,
    marginTop: 18, borderWidth: 1.5, borderColor: '#99f6e4' },
  allCardOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  allTitle: { fontSize: 15.5, fontWeight: '900', color: '#0f172a' },
  allSub: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
  allState: { fontSize: 13, fontWeight: '900', color: '#0f766e' },
  talkChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', alignSelf: 'center' },
  talkChipText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18, paddingHorizontal: 0 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccfbf1' },
  lockBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccfbf1' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#0f766e', fontWeight: '700' },

  pinCard: { margin: 20, backgroundColor: '#fff', borderRadius: 28, padding: 24, alignItems: 'center', gap: 12 },
  pinTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  pinHelp: { textAlign: 'center', color: '#475569', lineHeight: 21 },
  pinInput: { alignSelf: 'stretch', borderWidth: 2, borderColor: '#99f6e4', borderRadius: 16, padding: 14, fontSize: 24, textAlign: 'center', letterSpacing: 8, color: '#0f172a' },
  err: { color: '#dc2626', fontWeight: '700' },
  primary: { alignSelf: 'stretch', backgroundColor: '#0f766e', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 17 },

  addCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 24, padding: 14, borderWidth: 2, borderColor: '#5eead4', marginBottom: 18 },
  addTitle: { fontSize: 18, fontWeight: '900', color: '#0f766e' },
  addSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  plus: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center' },

  alertBox: { backgroundColor: '#fef2f2', borderRadius: 22, padding: 14, borderWidth: 2, borderColor: '#fecaca', marginBottom: 18, gap: 10 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertTitle: { flex: 1, fontWeight: '900', color: '#b91c1c', fontSize: 16 },
  alertDismiss: { fontWeight: '900', color: '#b91c1c', paddingHorizontal: 8 },
  alertRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  alertImg: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#fee2e2' },
  alertText: { color: '#7f1d1d', fontWeight: '700', lineHeight: 20 },
  alertMeta: { color: '#991b1b', fontSize: 12, marginTop: 2 },

  section: { fontSize: 16, fontWeight: '900', color: '#334155', marginBottom: 10, marginTop: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffbeb', borderRadius: 18, padding: 10, borderWidth: 1, borderColor: '#fde68a', marginBottom: 10 },
  pendingImg: { width: 60, height: 60, borderRadius: 14, backgroundColor: '#fef3c7' },
  pendingName: { fontSize: 17, fontWeight: '900', color: '#78350f' },
  pendingSaid: { fontSize: 12, color: '#92400e' },
  reviewBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  empty: { color: '#64748b', fontSize: 15, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 22, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ccfbf1' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#ccfbf1' },
  rel: { fontSize: 20, fontWeight: '900', color: '#0f766e', marginTop: 8 },
  name: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#7c3aed', fontWeight: '800', marginTop: 2 },
  badge: { position: 'absolute', top: 16, right: 16, backgroundColor: '#0f766e', borderRadius: 10, padding: 4 },
  tip: { textAlign: 'center', color: '#94a3b8', marginTop: 14, fontWeight: '600' },
});

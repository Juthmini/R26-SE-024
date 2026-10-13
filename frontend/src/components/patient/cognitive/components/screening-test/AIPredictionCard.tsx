import { predictTriage } from "@/src/services/patient/cognitive/dementiaService";
import { TriagePrediction } from "@/src/types/dementia.types";
import { Ionicons } from "@expo/vector-icons";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  AiButton,
  AiCardShell,
  TRIAGE_ORDER,
  TRIAGE_OUTCOME,
} from "./triageUi";
import { GlowIcon, GRADIENTS, GradientView, IoniconName } from "./visuals";

// The dementia model returns a 2-class triage: keep monitoring at home
// ("monitor") vs. recommend a clinical review ("escalate"). This card is the
// single place that result is shown on the results screen.

interface AIPredictionCardProps {
  patientId: string;
  // Default true: fetch immediately on mount, matching the original results-
  // screen behavior exactly. Pass false for an on-demand "Run Check" button
  // instead (profile screen, caregiver view) - nothing fetches until pressed.
  autoRun?: boolean;
  // Called instead of the generic error message when the backend responds
  // 409 FAQ_REQUIRED, if provided. Falls back to the generic message otherwise.
  onFaqRequired?: () => void;
}

// Imperative handle so a parent (e.g. after the caller closes an FAQ modal
// opened via onFaqRequired) can trigger a re-run without disturbing the
// `autoRun`/idle-vs-result UI state - just calls the same `load()` again.
export interface AIPredictionCardHandle {
  run: () => void;
}

export const AIPredictionCard = forwardRef<AIPredictionCardHandle, AIPredictionCardProps>(({
  patientId,
  autoRun = true,
  onFaqRequired,
}, ref) => {
  const [loading, setLoading] = useState(autoRun);
  const [error, setError] = useState<string | null>(null);
  const [faqRequired, setFaqRequired] = useState(false);
  const [result, setResult] = useState<TriagePrediction | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setFaqRequired(false);
    try {
      const prediction = await predictTriage(patientId);
      setResult(prediction);
    } catch (e: any) {
      if (e?.code === "FAQ_REQUIRED") {
        setFaqRequired(true);
        if (onFaqRequired) onFaqRequired();
      } else {
        setError(e?.message || "Could not reach the prediction service.");
      }
    } finally {
      setLoading(false);
      setHasRun(true);
    }
  };

  useImperativeHandle(ref, () => ({ run: load }));

  useEffect(() => {
    if (patientId && autoRun) load();
  }, [patientId, autoRun]);

  if (loading) {
    return (
      <AiCardShell>
        <View className="items-center py-3 gap-2">
          <PulsingSparkle />
          <Text className="text-lg font-bold text-gray-900">Analysing results…</Text>
          <Text className="text-sm text-gray-500 text-center">
            Combining the MMSE score with daily-living answers
          </Text>
        </View>
      </AiCardShell>
    );
  }

  // Not auto-run and nothing has happened yet - show the idle "Run" state.
  if (!autoRun && !hasRun) {
    return (
      <AiCardShell>
        <View className="flex-row items-center gap-3 mb-4">
          <GlowIcon colors={GRADIENTS.violet} icon="analytics" size={44} />
          <Text className="flex-1 text-base text-gray-600 leading-relaxed">
            Run the AI triage check using the latest completed assessment and
            daily-living answers.
          </Text>
        </View>
        <AiButton label="Run AI check" icon="sparkles" onPress={load} />
      </AiCardShell>
    );
  }

  if (faqRequired && !onFaqRequired) {
    return (
      <AiCardShell>
        <StatusRow
          icon="clipboard"
          colors={GRADIENTS.amber}
          text="Complete the daily-living questionnaire to get a triage result."
        />
        <AiButton label="Retry" icon="refresh" variant="secondary" onPress={load} />
      </AiCardShell>
    );
  }

  if (error || !result) {
    if (faqRequired) {
      // onFaqRequired already fired above; render nothing while the caller
      // (e.g. a modal) handles it, to avoid flashing a generic error first.
      return null;
    }
    return (
      <AiCardShell>
        <StatusRow
          icon="cloud-offline"
          colors={GRADIENTS.slate}
          text={`${error ?? "Prediction unavailable."} Make sure the ML service is running.`}
        />
        <AiButton label="Retry" icon="refresh" variant="secondary" onPress={load} />
      </AiCardShell>
    );
  }

  const outcome = TRIAGE_OUTCOME[result.triage];
  const pcts = TRIAGE_ORDER.map((level) => ({
    level,
    pct: Math.round((result.probabilities[level] ?? 0) * 100),
  }));

  return (
    <Animated.View entering={FadeInDown.duration(450)}>
      <AiCardShell subtitle="Your triage result">
        {/* Outcome */}
        <GradientView
          colors={outcome.softGradient}
          className="items-center rounded-3xl px-4 pt-3 pb-5 mb-4"
        >
          <GlowIcon colors={outcome.gradient} icon={outcome.icon} size={76} />
          <Text className="text-xs font-bold uppercase tracking-widest text-gray-500 mt-1">
            AI recommendation
          </Text>
          <Text
            className="text-[26px] font-extrabold text-gray-900 text-center mt-1"
            accessibilityRole="header"
          >
            {outcome.label}
          </Text>
          <View
            className="flex-row items-center gap-1.5 mt-3 rounded-full bg-white px-3.5 py-1.5"
            style={{
              shadowColor: outcome.accent,
              shadowOpacity: 0.15,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Ionicons name="shield-checkmark" size={15} color={outcome.accent} />
            <Text className={`text-sm font-bold ${outcome.text}`}>
              {Math.round(result.confidence * 100)}% confident
            </Text>
          </View>
        </GradientView>

        <Text className="text-base text-gray-700 leading-relaxed mb-5">
          {result.message}
        </Text>

        {/* Probability breakdown - one stacked gradient bar */}
        <Text className="text-sm font-semibold text-gray-500 mb-2">
          How the model weighed it
        </Text>
        <View
          className="h-4 flex-row rounded-full overflow-hidden bg-gray-100"
          accessibilityLabel={pcts
            .map((p) => `${TRIAGE_OUTCOME[p.level].shortLabel} ${p.pct}%`)
            .join(", ")}
        >
          {pcts.map((p) => (
            <GradientView
              key={p.level}
              colors={TRIAGE_OUTCOME[p.level].gradient}
              diagonal={false}
              style={{ width: `${p.pct}%`, height: "100%" }}
            />
          ))}
        </View>
        <View className="flex-row justify-between mt-2.5">
          {pcts.map((p) => (
            <View key={p.level} className="flex-row items-center gap-1.5">
              <View className={`w-2.5 h-2.5 rounded-full ${TRIAGE_OUTCOME[p.level].dot}`} />
              <Text className="text-sm text-gray-600">
                {TRIAGE_OUTCOME[p.level].shortLabel}{" "}
                <Text className="font-bold text-gray-900">{p.pct}%</Text>
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row items-center gap-2 mt-4 rounded-2xl bg-slate-50 px-3 py-2.5">
          <Ionicons name="information-circle" size={18} color="#94a3b8" />
          <Text className="flex-1 text-xs text-gray-500">
            Screening triage only - not a diagnosis.
          </Text>
        </View>

        {!autoRun && (
          <View className="mt-4">
            <AiButton label="Re-run check" icon="refresh" variant="secondary" onPress={load} />
          </View>
        )}
      </AiCardShell>
    </Animated.View>
  );
});

AIPredictionCard.displayName = "AIPredictionCard";

function StatusRow({
  icon,
  colors,
  text,
}: {
  icon: IoniconName;
  colors: readonly [string, string, ...string[]];
  text: string;
}) {
  return (
    <View className="flex-row items-center gap-3 mb-4">
      <GlowIcon colors={colors} icon={icon} size={44} />
      <Text className="flex-1 text-base text-gray-600 leading-relaxed">{text}</Text>
    </View>
  );
}

// Gently "breathing" AI badge for the loading state.
function PulsingSparkle() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.12, { duration: 700 }), -1, true);
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <GlowIcon colors={GRADIENTS.ai} icon="sparkles" size={64} />
    </Animated.View>
  );
}

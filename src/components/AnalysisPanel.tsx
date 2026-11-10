import { format } from 'date-fns';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { analyzeInteraction } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { ActionItem, Interaction } from '@/lib/types';

import { ActionItemRow } from './ActionItemRow';
import { colors } from './theme';
import { Button, Card, ErrorText, Section, styles } from './ui';

type Props = {
  interaction: Interaction;
  actionItems: ActionItem[];
  /** Called after a successful analysis so the screen reloads the saved results. */
  onAnalyzed: () => void;
};

/**
 * "Analyze with AI" button plus the saved results. If the AI is down, the error shows here
 * and the rest of the screen (editing, deleting) keeps working.
 */
export function AnalysisPanel({ interaction, actionItems, onAnalyzed }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const { appliedStatus } = await analyzeInteraction(interaction.id);
      if (appliedStatus) setNotice(`Quote marked as ${appliedStatus}.`);
      onAnalyzed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const analysis = interaction.analysis;

  return (
    <Section title="AI analysis">
      {analysis && interaction.analyzed_at ? (
        <Card>
          <Text style={styles.body}>{analysis.summary}</Text>
          {!!analysis.follow_up_date && (
            <Text style={styles.muted}>Follow up: {formatDay(analysis.follow_up_date)}</Text>
          )}
          {interaction.applied_status ? (
            <Text style={[styles.muted, { color: colors.success }]}>
              Changed the quote to “{interaction.applied_status}”.
            </Text>
          ) : (
            !!analysis.suggested_status && (
              <Text style={styles.muted}>
                Suggested status “{analysis.suggested_status}” (not applied: confidence{' '}
                {Math.round(analysis.confidence * 100)}%)
              </Text>
            )
          )}
          <Text style={styles.muted}>
            Analyzed {format(new Date(interaction.analyzed_at), 'd MMM, h:mm a')}
          </Text>
        </Card>
      ) : (
        <Text style={styles.muted}>
          Get a summary, to-dos and a follow-up date from this{' '}
          {interaction.kind === 'email' ? 'email' : 'note'}.
        </Text>
      )}

      {actionItems.length > 0 && (
        <View style={{ gap: 2 }}>
          {actionItems.map((item) => (
            <ActionItemRow key={item.id} item={item} />
          ))}
        </View>
      )}

      {!!notice && <Text style={[styles.body, { color: colors.success }]}>{notice}</Text>}
      <ErrorText error={error} />
      <Button
        variant={analysis ? 'secondary' : 'primary'}
        title={analysis ? 'Analyze again' : 'Analyze with AI'}
        onPress={run}
        loading={running}
      />
    </Section>
  );
}

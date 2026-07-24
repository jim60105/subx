import { MatchWizard } from "./MatchWizard";

interface MatchScreenProps {
  /** Opens the Settings screen — the recovery route when no AI is configured. */
  onOpenSettings: () => void;
}

/**
 * The Match feature screen: the four-step wizard built on `WizardShell`.
 *
 * The screen itself is a thin host; all of the flow lives in `MatchWizard` and
 * its `useMatchWizard` state machine.
 */
export function MatchScreen({ onOpenSettings }: MatchScreenProps) {
  return <MatchWizard onOpenSettings={onOpenSettings} />;
}

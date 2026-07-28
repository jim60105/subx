import { TranslateWizard } from "./TranslateWizard";

interface TranslateScreenProps {
  /** Opens the Settings screen — the recovery route when no AI is configured. */
  onOpenSettings: () => void;
}

/**
 * The Translate feature screen: the four-step wizard built on `WizardShell`.
 *
 * The screen itself is a thin host; all of the flow lives in `TranslateWizard`
 * and its `useTranslateWizard` state machine.
 */
export function TranslateScreen({ onOpenSettings }: TranslateScreenProps) {
  return <TranslateWizard onOpenSettings={onOpenSettings} />;
}
